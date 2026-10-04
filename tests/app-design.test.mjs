import test from "node:test";
import assert from "node:assert/strict";
import {
  initialDesign,
  element,
  flatten,
  validateDesign,
  moveNode,
  removeNode,
  insertNode,
  patchNode,
  duplicateNode,
  definitionKey,
  boundControl,
  plotSeries,
} from "../lib/app-design.js";
import { previewData } from "../worker/data-outputs.js";
const definition = {
  filename: "sphere.ghx",
  controls: [
    {
      name: "RH_IN:Radius",
      instanceId: "radius",
      label: "Radius",
      kind: "number",
      value: 12,
    },
  ],
};
test("starter layout IDs are stable across server and browser rendering", () => {
  assert.deepEqual(initialDesign(definition), initialDesign(definition));
});
test("layouts preserve bindings by stable component ID across definition uploads", () => {
  const d = initialDesign(definition),
    copy = validateDesign(JSON.parse(JSON.stringify(d))),
    n = flatten(copy.nodes).find((x) => x.node.type === "slider").node;
  assert.equal(boundControl(n, definition).name, "RH_IN:Radius");
  assert.equal(
    definitionKey({ ...definition, id: "new" }),
    definitionKey(definition),
  );
  assert.equal(
    boundControl(n, {
      controls: [{ instanceId: "different", kind: "number" }],
    }),
    undefined,
  );
  assert.equal(
    boundControl(n, { controls: [{ instanceId: "radius", kind: "text" }] }),
    undefined,
  );
});
test("reparent and reorder retain every node and reject cycles or locked descendants", () => {
  let d = validateDesign(initialDesign(definition));
  const group = flatten(d.nodes).find((x) => x.node.type === "section").node;
  const slider = group.children[0],
    button = group.children[1],
    count = flatten(d.nodes).length;
  d = moveNode(d, slider.id, group.id, 2);
  assert.deepEqual(
    find(d, group.id).children.map((n) => n.id),
    [button.id, slider.id],
  );
  assert.equal(flatten(d.nodes).length, count);
  assert.throws(() => moveNode(d, group.id, slider.id), /itself/);
  d = patchNode(d, slider.id, { locked: true });
  assert.throws(() => moveNode(d, group.id, null), /locked/);
  assert.equal(removeNode(d, group.id), d);
  d = patchNode(d, group.id, { locked: true });
  assert.equal(patchNode(d, slider.id, { locked: false }), d);
  assert.throws(() => insertNode(d, element("text"), group.id), /unlocked/);
});
const find = (d, id) => flatten(d.nodes).find((x) => x.node.id === id).node;
test("grid changes keep children; duplication remaps every descendant ID", () => {
  const d = validateDesign(initialDesign(definition)),
    grid = d.nodes[1];
  const changed = patchNode(d, grid.id, { columns: 1 });
  assert.equal(find(changed, grid.id).children.length, 2);
  const copy = duplicateNode(changed, grid.id),
    ids = flatten(copy.nodes).map((x) => x.node.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(copy.nodes.length, 3);
});
test("import validation rejects deep trees, duplicate IDs, unsafe images, excessive viewports and unknown elements", () => {
  const d = initialDesign(definition);
  assert.throws(
    () => validateDesign({ ...d, nodes: [d.nodes[0], d.nodes[0]] }),
    /duplicate/,
  );
  assert.throws(
    () =>
      validateDesign({
        ...d,
        nodes: [
          { ...element("image"), image: "https://tracking.invalid/image.png" },
        ],
      }),
    /Images/,
  );
  assert.throws(
    () =>
      validateDesign({
        ...d,
        nodes: [
          { ...element("image"), image: "data:image/svg+xml;base64,AAAA" },
        ],
      }),
    /Images/,
  );
  assert.throws(
    () =>
      validateDesign({
        ...d,
        nodes: Array.from({ length: 4 }, () => element("viewport")),
      }),
    /three/,
  );
  assert.throws(() => element("mapper"), /native/);
  let nested = element("stack");
  for (let i = 0; i < 10; i++)
    nested = element("stack", { children: [nested] });
  assert.throws(() => validateDesign({ ...d, nodes: [nested] }), /nesting/);
  assert.throws(
    () =>
      validateDesign({
        ...d,
        nodes: [element("text", { children: [element("text")] })],
      }),
    /Only/,
  );
});
test("export strips unknown payloads, credentials and runtime values", () => {
  const d = validateDesign({
    ...initialDesign(definition),
    credential: "secret",
    values: { a: 1 },
    algo: "raw",
    nodes: [element("text", { script: "alert(1)", owner_id: "other" })],
  });
  assert.equal(d.credential, undefined);
  assert.equal(d.values, undefined);
  assert.equal(d.algo, undefined);
  assert.equal(d.nodes[0].script, undefined);
});
test("numeric graphs retain invalid gaps, negatives, constants and isolated points", () => {
  const p = plotSeries([-4, 2, null, 8]);
  assert.equal(p.min, -4);
  assert.equal(p.max, 8);
  assert.equal((p.path.match(/M/g) || []).length, 2);
  assert.equal(plotSeries([12]).points[0][0], 150);
  assert.equal(plotSeries([3, 3]).points[0][1], 75);
  assert.equal(plotSeries(["not numeric", null, Infinity]), null);
  assert.deepEqual(plotSeries(["-1", " 2.5e2 ", "bad"]).points.at(-1), null);
  assert.equal(plotSeries(["-1", " 2.5e2 "]).max, 250);
});
test("solver data preview orders tree branches numerically, excludes geometry, and retains invalid numeric gaps", () => {
  const item = (type, data) => ({ type, data: JSON.stringify(data) });
  const out = previewData([
    {
      ParamName: "RH_OUT:Values",
      InnerTree: {
        "{10}": [item("System.Double", 8)],
        "{2}": [
          item("System.Double", -2),
          item("System.Double", "NaN"),
          item("Rhino.Geometry.Point3d", { X: 1 }),
          item("System.String", "<script>"),
          item("System.Boolean", false),
        ],
      },
    },
  ]);
  assert.deepEqual(out[0].items, [-2, null, "<script>", false, 8]);
});
test("solver data preview bounds output lists and string size", () => {
  const out = previewData([
    {
      ParamName: "test",
      InnerTree: {
        "{0}": Array.from({ length: 2200 }, () => ({
          type: "System.Double",
          data: "1",
        })),
      },
    },
  ]);
  assert.equal(out[0].items.length, 2000);
  assert.equal(out[0].truncated, true);
  const text = previewData([
    {
      ParamName: "text",
      InnerTree: {
        "{0}": [
          { type: "System.String", data: JSON.stringify("x".repeat(3000)) },
        ],
      },
    },
  ]);
  assert.equal(text[0].items[0].length, 2000);
  assert.equal(text[0].truncated, true);
});
