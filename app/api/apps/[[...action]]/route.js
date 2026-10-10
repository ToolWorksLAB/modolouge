import {
  requireActor,
  originCheck,
  safeError,
  failure,
} from "../../../../lib/auth.js";
import { manager } from "../../../../lib/config.js";
import {
  listApps,
  ownedApp,
  publicDraft,
  restoreDraft,
  saveBlueprint,
  publishApp,
  unpublishApp,
  appVersions,
  restoreVersion,
} from "../../../../lib/ai-apps.js";
import { generateApp } from "../../../../lib/ai-builder.js";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
const json = (data) =>
  Response.json(data, { headers: { "Cache-Control": "no-store" } });
export async function GET(req, { params }) {
  try {
    if (manager) throw failure("Not found.", 404);
    const user = await requireActor(),
      action = (await params).action || [];
    if (action.length === 2 && action[1] === "versions")
      return json(await appVersions(user, action[0]));
    return json(
      action.length
        ? await publicDraft(await ownedApp(user, action[0]))
        : await listApps(user),
    );
  } catch (e) {
    return safeError(e);
  }
}
export async function POST(req, { params }) {
  try {
    originCheck(req);
    if (manager) throw failure("Not found.", 404);
    const user = await requireActor();
    const raw = await req.text();
    if (raw.length > 80000) throw failure("Request too large.", 413);
    const body = JSON.parse(raw),
      action = ((await params).action || []).join("/");
    if (action === "generate" && body.stream === true) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          const send = (value) => {
            try {
              controller.enqueue(encoder.encode(JSON.stringify(value) + "\n"));
            } catch {}
          };
          try {
            const app = await generateApp(user, body, req, {
              onProgress: async (event) => send({ event }),
            });
            send({ app });
          } catch (e) {
            const response = safeError(e);
            send({ ...(await response.json()), status: response.status });
          } finally {
            try {
              controller.close();
            } catch {}
          }
        },
      });
      return new Response(stream, {
        headers: {
          "Content-Type": "application/x-ndjson",
          "Cache-Control": "no-store",
        },
      });
    }
    if (action === "generate") return json(await generateApp(user, body, req));
    if (action === "restore") return json(await restoreVersion(user, body));
    if (action === "save") return json(await saveBlueprint(user, body));
    if (action === "open") return json(await restoreDraft(user, body.id));
    if (action === "publish") return json(await publishApp(user, body, req));
    if (action === "unpublish")
      return json(await unpublishApp(user, body.id, req));
    throw failure("Not found.", 404);
  } catch (e) {
    return safeError(e);
  }
}
