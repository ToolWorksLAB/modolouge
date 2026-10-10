import { submit, readJob } from "./jobs.js";
import { restoreDraft } from "./ai-apps.js";
import { graphContext } from "./ai-blueprint.js";
import { failure } from "./auth.js";

export async function graphSession(
  user,
  app,
  req,
  { allowEdits, report, signal },
) {
  const restored = await restoreDraft(user, app.id);
  let current = restored.definition,
    candidate = null,
    lastPassed = false,
    attempts = 0,
    testing = false,
    resultUrl = null;
  async function test({ edits, reason }) {
    if (testing)
      return {
        passed: false,
        errors: [
          "Wait for the current Compute test before submitting another.",
        ],
      };
    if (attempts >= 2)
      return {
        passed: false,
        errors: [
          "Two Compute tests have been used. Finish with the evidence available.",
        ],
      };
    if (edits.length && (!allowEdits || user.kind !== "member"))
      return {
        passed: false,
        errors: ["Definition editing has not been enabled for this request."],
      };
    if (signal.aborted) throw signal.reason;
    attempts++;
    lastPassed = false;
    testing = true;
    try {
      await report({
        tool: "test_definition",
        status: "running",
        message: reason.slice(0, 300),
        edits: edits.length,
      });
      const job = await submit(
        user,
        {
          type: user.kind === "member" ? "edit" : "solve",
          definitionId: current.id,
          edits,
          values: {},
        },
        req,
      );
      const deadline = Date.now() + 100000;
      while (Date.now() < deadline) {
        if (signal.aborted) throw signal.reason;
        const state = await readJob(user, job.id);
        if (["failed", "expired"].includes(state.status)) {
          const errors = [state.error || "Compute test did not finish."];
          await report({
            tool: "test_definition",
            status: "failed",
            jobId: job.id,
            message: errors[0].slice(0, 500),
          });
          return { passed: false, errors };
        }
        if (state.status === "done") {
          const response = await fetch(state.resultUrl, { signal });
          if (!response.ok)
            throw failure("Could not read the Compute test.", 503);
          const result = await response.json();
          const passed =
            result.passed ??
            (!result.errors?.length && result.objects?.length > 0);
          lastPassed = passed;
          if (passed) resultUrl = state.resultUrl;
          if (passed && result.definition) {
            current = result.definition;
            candidate = result;
          }
          const summary = {
            passed,
            errors: (result.errors || []).slice(0, 8),
            warnings: (result.warnings || []).slice(0, 8),
            objects:
              typeof result.objects === "number"
                ? result.objects
                : result.objects?.length,
            duration: result.duration,
          };
          await report({
            tool: "test_definition",
            status: passed ? "passed" : "failed",
            jobId: job.id,
            message: passed
              ? `${summary.objects} geometry objects; ${summary.duration} ms solve.`
              : summary.errors.join("; ").slice(0, 500),
            edits: edits.length,
          });
          return { ...summary, controls: graphContext(current).controls };
        }
        await new Promise((resolve) => setTimeout(resolve, 1200));
      }
      await report({
        tool: "test_definition",
        status: "failed",
        jobId: job.id,
        message: "Compute test timed out; the existing app is unchanged.",
      });
      return {
        passed: false,
        errors: [
          "Compute test timed out. The submitted job may finish separately.",
        ],
      };
    } catch (error) {
      if (signal.aborted) throw signal.reason;
      const message = error.status
        ? error.message
        : "The Compute test could not complete. Try again if a test remains.";
      await report({
        tool: "test_definition",
        status: "failed",
        message: message.slice(0, 500),
      });
      return { passed: false, errors: [message] };
    } finally {
      testing = false;
    }
  }
  return {
    test,
    context: () => graphContext(current),
    definition: () => current,
    candidate: () => candidate,
    passed: () => lastPassed,
    attempts: () => attempts,
    resultUrl: () => (lastPassed ? resultUrl : null),
  };
}
