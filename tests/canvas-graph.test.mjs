import test from "node:test";
import assert from "node:assert/strict";
import {
  fitCamera,
  graphBounds,
  portAnchor,
  zoomCamera,
  wirePath,
} from "../lib/canvas-graph.js";

test("canvas fit keeps a real graph inside the available area", () => {
  const bounds = graphBounds([
    { bounds: { x: -200, y: -50, width: 220, height: 20 } },
    { bounds: { x: 350, y: 80, width: 69, height: 84 } },
  ]);
  const camera = fitCamera(bounds, { width: 620, height: 568 });
  assert.ok(bounds.x * camera.scale + camera.x >= 45);
  assert.ok((bounds.x + bounds.width) * camera.scale + camera.x <= 575);
  assert.ok(bounds.y * camera.scale + camera.y >= 80);
});
test("zoom stays anchored under the pointer and clamps at both limits", () => {
  const c = { x: 10, y: -20, scale: 1 },
    point = { x: 315, y: 210 };
  for (const factor of [0.0001, 0.8, 1.4, 100]) {
    const z = zoomCamera(c, factor, point);
    assert.ok(z.scale >= 0.02 && z.scale <= 4);
    assert.ok(Math.abs((point.x - z.x) / z.scale - (point.x - c.x)) < 1e-8);
    assert.ok(Math.abs((point.y - z.y) / z.scale - (point.y - c.y)) < 1e-8);
  }
});
test("wires use exact port IDs including unconnected ports", () => {
  const node = {
    bounds: { x: 400, y: 100, width: 70, height: 80 },
    inputs: [{ id: "B" }, { id: "R" }, { id: "U" }, { id: "V" }],
    outputs: [{ id: "M" }],
  };
  assert.deepEqual(portAnchor(node, "inputs", "R"), { x: 400, y: 130 });
  assert.deepEqual(portAnchor(node, "outputs", "M"), { x: 470, y: 140 });
  assert.equal(portAnchor(node, "inputs", "unknown"), null);
  assert.match(wirePath({ x: 200, y: 50 }, { x: 400, y: 130 }), /^M200,50 C/);
});
