import test from "node:test";
import assert from "node:assert/strict";
import { makeValues } from "../worker/compute.js";
import { pointControls, sameValue } from "../lib/point-controls.js";
import { changedControls } from "../lib/workspace-flow.js";
import {
  mergeActivity,
  activityMessage,
  changedNodeIds,
  editSummary,
} from "../lib/agent-activity.js";

test("point handles use real Point3d inputs and reject malformed or unbounded coordinates", () => {
  const c = {
    name: "attractor",
    label: "Point",
    kind: "point",
    value: [1, 2, 3],
  };
  const input = makeValues([c], { attractor: [-100, 2200, 0] })[0];
  assert.equal(input.ParamName, "attractor");
  assert.equal(input.InnerTree["{0}"][0].type, "Rhino.Geometry.Point3d");
  assert.deepEqual(JSON.parse(input.InnerTree["{0}"][0].data), {
    X: -100,
    Y: 2200,
    Z: 0,
  });
  for (const value of [
    null,
    "1,2,3",
    [1, 2],
    [1, 2, 3, 4],
    [NaN, 2, 3],
    [0, Infinity, 0],
    [0, 0, 1000001],
    ["1", 2, 3],
  ])
    assert.throws(() => makeValues([c], { attractor: value }));
  assert.deepEqual(
    pointControls([c], {}).map((p) => p.position),
    [[1, 2, 3]],
  );
  assert.equal(pointControls([c], { attractor: [0, NaN, 0] }).length, 0);
});
test("point movement stages one changed input and a reset clears it", () => {
  const controls = [{ name: "point" }],
    solved = { point: [1, 2, 3] };
  assert(sameValue([1, 2, 3], [1, 2, 3]));
  assert.equal(changedControls(controls, { point: [1, 2, 3] }, solved), 0);
  assert.equal(changedControls(controls, { point: [10, 2, 3] }, solved), 1);
  assert.equal(
    changedControls(controls, { point: [...solved.point] }, solved),
    0,
  );
});
test("live progress replaces pending actions, retains graph evidence, and gives legacy empty events a label", () => {
  const graph = { nodes: [{ id: "a", label: "Attractor" }], wires: [] };
  let events = mergeActivity([], {
    id: "test-1",
    tool: "test_definition",
    status: "running",
    graph,
  });
  events = mergeActivity(events, {
    id: "test-1",
    tool: "test_definition",
    status: "passed",
    message: "2 objects",
  });
  assert.equal(events.length, 1);
  assert.equal(events[0].status, "passed");
  assert.equal(events[0].graph, graph);
  assert.equal(
    activityMessage({ tool: "test_definition", message: "" }),
    "Tested geometry",
  );
  assert.deepEqual(
    changedNodeIds(graph, {
      nodes: [{ id: "a", label: "Moved point" }, { id: "b" }],
      wires: [{ sourceNode: "a", targetNode: "b" }],
    }),
    ["a", "b"],
  );
  assert.deepEqual(
    editSummary([{ op: "rename", nodeId: "a", text: "private text" }], graph),
    [
      {
        op: "rename",
        nodeId: "a",
        label: "Attractor",
        newId: undefined,
        sourceNode: undefined,
      },
    ],
  );
});
