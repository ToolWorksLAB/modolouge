import test from "node:test";
import assert from "node:assert/strict";
import {
  changedControls,
  serviceLabel,
  runLabel,
} from "../lib/workspace-flow.js";
import {
  initialDesign,
  arrangeDesign,
  flatten,
  patchNode,
  validateDesign,
} from "../lib/app-design.js";

test("pending changes reflect current values, including reverting to the solved model", () => {
  const controls = [
    { name: "radius" },
    { name: "enabled" },
    { name: "message" },
  ];
  const solved = { radius: 12, enabled: false, message: "hello" };
  assert.equal(changedControls(controls, { ...solved }, solved), 0);
  assert.equal(
    changedControls(
      controls,
      { radius: 18, enabled: true, message: "hello" },
      solved,
    ),
    2,
  );
  assert.equal(
    changedControls(controls, { ...solved, unknown: 42 }, solved),
    0,
  );
  assert.equal(changedControls(controls, solved, null), 0);
});
test("run messaging distinguishes unchanged, pending, exhausted and in-flight states", () => {
  assert.equal(
    runLabel({ hasResult: true, changes: 0 }),
    "Model is up to date",
  );
  assert.equal(runLabel({ hasResult: true, changes: 1 }), "Update model");
  assert.equal(runLabel({ hasResult: false }), "Generate model");
  assert.equal(
    runLabel({ exhausted: true, hasResult: true, changes: 1 }),
    "Sign in to continue",
  );
  assert.equal(runLabel({ busy: "Updating…", exhausted: true }), "Updating…");
  assert.equal(serviceLabel(null), "Checking availability…");
  assert.equal(
    serviceLabel({ online: false, acceptingJobs: true }),
    "Compute is starting",
  );
});
test("quick layout arrangements preserve every element, input binding, hidden state and lock", () => {
  const d = initialDesign({
    filename: "model.gh",
    controls: [
      { name: "radius", instanceId: "a", label: "Radius", kind: "number" },
    ],
  });
  const hidden = validateDesign(patchNode(d, "input-0", { hidden: true }));
  const before = flatten(hidden.nodes).map((x) => [
    x.node.id,
    x.node.binding,
    x.node.hidden,
  ]);
  for (const layout of ["side", "balanced", "stacked"]) {
    const result = validateDesign(arrangeDesign(hidden, layout));
    assert.deepEqual(
      flatten(result.nodes).map((x) => [
        x.node.id,
        x.node.binding,
        x.node.hidden,
      ]),
      before,
    );
  }
  const locked = patchNode(hidden, "layout", { locked: true });
  assert.equal(arrangeDesign(locked, "stacked"), locked);
  assert.equal(arrangeDesign(hidden, "unknown"), hidden);
});
