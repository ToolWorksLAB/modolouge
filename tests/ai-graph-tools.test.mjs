import test, { mock } from "node:test";
import assert from "node:assert/strict";
let results = [],
  restores = 0,
  submitted = [],
  events = [];
const original = {
  id: "original",
  controls: [],
  graph: { nodes: [], wires: [] },
};
mock.module("../lib/jobs.js", {
  exports: {
    submit: async (_user, body) => {
      submitted.push(body);
      return { id: String(submitted.length) };
    },
    readJob: async () => ({
      status: "done",
      resultUrl: "https://example.test/result",
    }),
  },
});
mock.module("../lib/ai-apps.js", {
  exports: {
    restoreDraft: async () => {
      restores++;
      return { definition: structuredClone(original) };
    },
  },
});
mock.module("../lib/auth.js", {
  exports: {
    failure: (message, status) => Object.assign(new Error(message), { status }),
  },
});
const { graphSession } = await import("../lib/ai-graph-tools.js");
const create = async (kind = "member", allowEdits = true) => {
  restores = 0;
  submitted = [];
  events = [];
  return graphSession(
    { kind, sk: "owner" },
    { id: "app", definition_id: original.id, metadata: original },
    new Request("https://example.test"),
    {
      allowEdits,
      report: async (e) => events.push(e),
      signal: AbortSignal.timeout(3000),
    },
  );
};
test("failed edits leave the original; a corrected candidate is adopted only after a successful test", async () => {
  mock.method(globalThis, "fetch", async () => Response.json(results.shift()));
  results = [
    { passed: false, errors: ["Bad connection"], objects: 0 },
    {
      passed: true,
      errors: [],
      objects: 54,
      duration: 25,
      definition: { ...original, id: "candidate" },
    },
  ];
  const session = await create();
  await session.test({ edits: [], reason: "First test" });
  assert.equal(session.definition().id, "original");
  assert.equal(session.candidate(), null);
  assert.equal(session.passed(), false);
  await session.test({ edits: [], reason: "Correction" });
  assert.equal(session.definition().id, "candidate");
  assert.equal(session.passed(), true);
  assert.ok(session.resultUrl());
  await session.test({ edits: [], reason: "Excess test" });
  assert.equal(submitted.length, 2);
  assert.deepEqual(
    events.filter((e) => e.status !== "running").map((e) => e.status),
    ["failed", "passed"],
  );
  mock.restoreAll();
});
test("guest and unchecked edit requests cannot enqueue mutations", async () => {
  for (const [kind, enabled] of [
    ["guest", true],
    ["member", false],
  ]) {
    const session = await create(kind, enabled);
    const r = await session.test({
      edits: [{ op: "remove" }],
      reason: "Denied",
    });
    assert.equal(r.passed, false);
    assert.equal(submitted.length, 0);
  }
});
test("presentation-only sessions neither restore archives nor enqueue Compute", async () => {
  const session = await create();
  assert.equal(session.definition().id, original.id);
  assert.equal(session.attempts(), 0);
  assert.equal(session.candidate(), null);
  assert.equal(submitted.length, 0);
  assert.equal(restores, 0);
});
test("a failed second test never allows the request to report success from an earlier candidate", async () => {
  mock.method(globalThis, "fetch", async () => Response.json(results.shift()));
  results = [
    {
      passed: true,
      errors: [],
      objects: 54,
      definition: { ...original, id: "candidate" },
    },
    { passed: false, errors: ["No geometry"], objects: 0 },
  ];
  const session = await create();
  await session.test({ edits: [], reason: "First" });
  await session.test({ edits: [], reason: "Second" });
  assert.equal(session.passed(), false);
  assert.equal(session.resultUrl(), null);
  assert.equal(session.definition().id, "candidate");
  mock.restoreAll();
});
