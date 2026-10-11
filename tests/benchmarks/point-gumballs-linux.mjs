// Pass the owner's private e.gh and visibility-only diagnostic copy explicitly.
// Archive bytes, coordinates and generated geometry never belong in this repo.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import path from "node:path";
const [source, liveSource, destination] = process.argv.slice(2);
assert(
  source && liveSource && destination,
  "Supply original, live diagnostic and output directory",
);
const root = process.env.MODOLOUGE_WORKER || "/opt/modolouge-worker";
const bridge =
  process.env.MODOLOUGE_BRIDGE ||
  path.join(root, "tools/GhBridge/publish/GhBridge.dll");
const { compute, makeValues } = await import(
  pathToFileURL(
    process.env.MODOLOUGE_COMPUTE_MODULE || path.join(root, "compute.js"),
  )
);
const { previewGeometry } = await import(
  pathToFileURL(path.join(root, "geometry.js"))
);
const hash = (x) => createHash("sha256").update(x).digest("hex");
const originalHash = hash(await readFile(source));
const prepare = (file) =>
  JSON.parse(
    execFileSync("/usr/share/dotnet/dotnet", [bridge, file], {
      maxBuffer: 64 * 1024 * 1024,
      timeout: 30000,
    }),
  );
const original = prepare(source),
  live = prepare(liveSource),
  points = live.controls.filter((c) => c.kind === "point");
assert.equal(original.controls.length, 14);
assert.equal(points.length, 2);
assert.equal(original.graph.nodes.length, 70);
assert.equal(original.graph.wires.length, 82);
await mkdir(destination, { recursive: true, mode: 0o700 });
const reports = [];
async function solve(definition, name, values = {}) {
  const io = await compute("/io", {
    algo: definition.algo,
    filename: "point-gumballs.gh",
  });
  assert.equal(io.Errors?.length || 0, 0);
  for (const c of definition.controls.filter((c) => c.kind === "point"))
    assert(
      io.Inputs.some((i) => i.Name === c.name),
      "Compute recognizes point binding",
    );
  const start = performance.now();
  const response = await compute("/grasshopper", {
    algo: definition.algo,
    filename: "point-gumballs.gh",
    values: makeValues(definition.controls, values),
    cachesolve: false,
  });
  assert.equal(
    response.errors?.length || 0,
    0,
    JSON.stringify(response.errors),
  );
  const preview = await previewGeometry(response.values || []);
  assert.equal(preview.warnings.length, 0, JSON.stringify(preview.warnings));
  assert(preview.objects.length > 0);
  const positions = preview.objects.flatMap(
    (o) => o.mesh?.data?.attributes?.position?.array || [],
  );
  assert(positions.length && positions.every(Number.isFinite));
  const report = {
    name,
    objects: preview.objects.length,
    vertices: positions.length / 3,
    ms: Math.round(performance.now() - start),
    fingerprint: hash(JSON.stringify(preview.objects)),
  };
  await writeFile(
    path.join(destination, name + ".json"),
    JSON.stringify(preview),
    { mode: 0o600 },
  );
  reports.push(report);
  return report;
}
const saved = await solve(original, "original-defaults");
assert.equal(saved.objects, 9);
const baseline = await solve(live, "live-defaults");
for (const [i, c] of points.entries()) {
  const value = c.value.map((v, axis) => v + (axis === i ? 450 : 0));
  const moved = await solve(live, `point-${i + 1}-moved`, { [c.name]: value });
  assert.notEqual(
    baseline.fingerprint,
    moved.fingerprint,
    `Attractor ${i + 1} changes the actual geometry`,
  );
}
assert.equal(hash(await readFile(source)), originalHash);
const report = {
  sourceSha256: originalHash,
  nodes: 70,
  wires: 82,
  controls: 14,
  points: 2,
  reports,
};
await writeFile(
  path.join(destination, "report.json"),
  JSON.stringify(report, null, 2),
  { mode: 0o600 },
);
console.log(JSON.stringify(report));
