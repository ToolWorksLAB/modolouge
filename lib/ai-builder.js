import { createHash } from "node:crypto";
import { gateway } from "@ai-sdk/gateway";
import {
  validateBlueprint,
  graphContext,
  usageFromSteps,
} from "./ai-blueprint.js";
import { backend, checked } from "./supabase.js";
import {
  ownedApp,
  captureApp,
  publicDraft,
  retainCandidate,
} from "./ai-apps.js";
import { graphSession } from "./ai-graph-tools.js";
import { failure } from "./auth.js";
import { connection, rateLimit, activity } from "./activity.js";

import { blueprintAgent, AI_MODEL } from "./ai-agent.js";
import { modelBlueprint, reconcileRequirements } from "./app-capabilities.js";
const errors = {
  AI_PAUSED: "AI drafting is paused by the administrator.",
  AI_BUDGET: "Today's AI budget has been reached. Your saved apps still work.",
  AI_BUSY: "A draft is already being generated. Please wait.",
  AI_ALLOWANCE:
    "Your AI drafting allowance is used. Members get 10 drafts per day.",
  ACCOUNT_DISABLED: "This account is disabled.",
  APP_LIMIT: "Your library is full (20 apps).",
};
export async function generateApp(
  user,
  body,
  req,
  { onProgress = async () => {} } = {},
) {
  if (typeof body.prompt !== "string" || body.prompt.length > 4000)
    throw failure("Describe your app in up to 4,000 characters.");
  if (body.consent !== true)
    throw failure(
      "Confirm sending the file's node metadata and your brief to the AI provider.",
    );
  // Do not consume a guest draft or reserve paid usage while the provider is inactive.
  try {
    const credit = await gateway.getCredits();
    if (Number(credit.balance) <= 0)
      throw failure(
        "AI drafting is awaiting provider activation by ToolWorksLab. Your free AI draft has not been used. You can use Model or Advanced layout meanwhile.",
        503,
      );
  } catch (e) {
    if (e.status) throw e;
    throw failure(
      "The AI provider is temporarily unavailable. Your free draft has not been used.",
      503,
    );
  }
  let app;
  try {
    app = body.appId
      ? await ownedApp(user, body.appId)
      : await captureApp(user, body.definitionId);
  } catch (e) {
    if (errors[e.databaseMessage])
      throw failure(errors[e.databaseMessage], 429);
    throw e;
  }
  const context = graphContext(app.metadata);
  const prompt = body.prompt.trim();
  if (
    Buffer.byteLength(
      JSON.stringify([context, modelBlueprint(app.blueprint), prompt]),
      "utf8",
    ) > 80000
  )
    throw failure(
      "This graph and draft exceed the AI context limit. Shorten the descriptions or use the manual tools.",
      413,
    );
  const baseRevision = body.revision ?? 0;
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify([
        "builder-v3-workflows",
        app.id,
        baseRevision,
        prompt,
        AI_MODEL,
        body.allowEdits === true,
      ]),
    )
    .digest("hex");
  const prior = await checked(
    backend()
      .from("modolouge_ai_requests")
      .select("status")
      .eq("actor_id", user.sk)
      .eq("fingerprint", fingerprint)
      .in("status", ["running", "succeeded"])
      .maybeSingle(),
  );
  if (prior?.status === "succeeded")
    return { ...(await publicDraft(app)), cached: true };
  if (prior)
    throw failure(
      "This draft is already being generated. Reopen your app shortly.",
      409,
    );
  if (baseRevision !== app.revision)
    throw failure(
      "The draft changed. Reopen it before asking for another refinement.",
      409,
    );
  if (
    user.kind === "guest" &&
    !(await rateLimit("trial:ai:" + connection(req).hash, 1, 2592000))
  )
    throw failure(
      "Your free AI draft is used. Verify your email to refine or create more apps.",
      402,
      "TRIAL_EXHAUSTED",
    );
  let id;
  try {
    id = await checked(
      backend().rpc("modolouge_reserve_ai", {
        p_actor: user.sk,
        p_app: app.id,
        p_fingerprint: fingerprint,
        p_model: AI_MODEL,
      }),
    );
  } catch (e) {
    throw failure(
      errors[e.databaseMessage] || "AI drafting is temporarily unavailable.",
      429,
    );
  }
  const started = Date.now(),
    steps = [],
    events = [];
  const signal = AbortSignal.any([AbortSignal.timeout(240000), req.signal]);
  const report = async (event) => {
    events.push({ ...event, at: new Date().toISOString() });
    await checked(
      backend()
        .from("modolouge_ai_requests")
        .update({ events: events.slice(-30) })
        .eq("id", id),
    );
    await onProgress(event);
  };
  let succeeded = false,
    generationCompleted = false,
    errorCode = null,
    providerRejected = false;
  try {
    const clientConnection = connection(req);
    await checked(
      backend()
        .from("modolouge_ai_requests")
        .update({
          ip: clientConnection.ip,
          location: clientConnection.location,
        })
        .eq("id", id),
    );
    const session = await graphSession(user, app, req, {
      allowEdits: body.allowEdits === true,
      report,
      signal,
    });
    const agent = blueprintAgent(context, {
      session,
      report,
      refinement: !!app.blueprint,
      allowEdits: body.allowEdits === true,
      onStepEnd: async (step) => {
        steps.push(step);
        await checked(
          backend()
            .from("modolouge_ai_requests")
            .update(usageFromSteps(steps, AI_MODEL))
            .eq("id", id),
        );
      },
    });
    const result = await agent.generate({
      prompt: JSON.stringify({
        brief:
          prompt || "Make a clear app from the evidence in this definition.",
        existingDraft: modelBlueprint(app.blueprint),
        conversation: (app.conversation || [])
          .slice(-6)
          .map(({ role, text }) => ({ role, text })),
        definitionEditing: body.allowEdits === true && user.kind === "member",
      }),
      abortSignal: signal,
    });
    generationCompleted = true;
    if ((!app.blueprint || session.attempts() > 0) && !session.passed())
      throw failure(
        "The agent could not verify a working model within this turn. Your previous version is intact. Refine the request and try again.",
        422,
      );
    const blueprint = reconcileRequirements(
      validateBlueprint(
        {
          ...result.output,
          logo: app.blueprint?.logo || "",
          answers: app.blueprint?.answers || [],
        },
        session.definition(),
      ),
      app.blueprint,
    );
    if (session.attempts() === 0)
      await report({
        tool: "presentation_update",
        status: "passed",
        message:
          "Updated the app without changing or rerunning the Grasshopper definition.",
      });
    const candidate = session.candidate();
    const archiveUpdate = candidate
      ? await retainCandidate(user, app, candidate.definition.id)
      : {};
    const conversation = [
      ...(app.conversation || []),
      { role: "user", text: prompt || "Create an app from this definition." },
      {
        role: "assistant",
        text: blueprint.reasoning,
        events: events.slice(-16),
        model: AI_MODEL,
      },
    ].slice(-20);
    const updated = await checked(
      backend()
        .from("modolouge_apps")
        .update({
          blueprint,
          ...archiveUpdate,
          conversation,
          revision: app.revision + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", app.id)
        .eq("revision", app.revision)
        .select("*")
        .maybeSingle(),
    );
    if (!updated)
      throw failure(
        "The draft changed during generation. Reopen the latest version.",
        409,
      );
    succeeded = true;
    await activity(user, "ai_draft_created", req, {
      appId: app.id,
      requestId: id,
    }).catch(() => {});
    return {
      ...(await publicDraft(updated)),
      definition: session.definition(),
      resultUrl: session.resultUrl(),
      geometryUnchanged: session.attempts() === 0,
      requestId: id,
      events,
    };
  } catch (e) {
    providerRejected =
      steps.length === 0 && [401, 402, 403].includes(e.statusCode);
    if (providerRejected) {
      errorCode = "provider_activation";
      if (user.kind === "guest")
        await checked(
          backend()
            .from("modolouge_limits")
            .delete()
            .eq("key", "trial:ai:" + connection(req).hash),
        );
      throw failure(
        "GPT-6.1 Sol requires paid AI Gateway credits from ToolWorksLab. Your app is saved; try again once the credits are added.",
        503,
      );
    }
    errorCode = e.status
      ? "draft_conflict"
      : e.name === "TimeoutError" || e.name === "AbortError"
        ? "timeout"
        : "generation_failed";
    if (e.status) throw e;
    // Provider errors may include prompts, keys or URLs: never expose the raw body.
    console.error("ai_generation_failed", {
      requestId: id,
      name: e.name,
      statusCode: e.statusCode,
    });
    throw failure(
      "The AI draft could not be completed. Your file is saved in My apps. Try again later or use the manual tools.",
      503,
    );
  } finally {
    const usage = usageFromSteps(steps, AI_MODEL);
    if (usage.generation_ids.length === steps.length && steps.length) {
      const costs = await Promise.allSettled(
        usage.generation_ids.map((id) =>
          Promise.race([
            gateway.getGenerationInfo({ id }),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("Cost lookup pending")), 2500),
            ),
          ]),
        ),
      );
      if (
        costs.every(
          (r) => r.status === "fulfilled" && Number.isFinite(r.value.totalCost),
        )
      )
        usage.cost_usd = costs.reduce((sum, r) => sum + r.value.totalCost, 0);
    }
    await checked(
      backend()
        .from("modolouge_ai_requests")
        .update({
          ...usage,
          status: succeeded ? "succeeded" : "failed",
          error_code: errorCode,
          latency_ms: Date.now() - started,
          finished_at: new Date().toISOString(),
          reserved_usd: generationCompleted || providerRejected ? 0 : 3,
          ...(providerRejected ? { cost_usd: 0 } : {}),
        })
        .eq("id", id),
    );
  }
}
