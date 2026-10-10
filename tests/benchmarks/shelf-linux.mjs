// Run on the Linux worker with its existing Compute environment loaded.
// The owner's shelf.gh is intentionally not distributed in this public repo.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";

const [source, destination] = process.argv.slice(2);
assert(
  source && destination,
  "Usage: node shelf-linux.mjs /private/shelf.gh /private/results",
);
const root = process.env.MODOLOUGE_WORKER || "/opt/modolouge-worker";
const bridge =
  process.env.MODOLOUGE_BRIDGE ||
  path.join(root, "tools/GhBridge/publish/GhBridge.dll");
const { compute, makeValues } = await import(
  pathToFileURL(path.join(root, "compute.js"))
);
const { previewGeometry } = await import(
  pathToFileURL(path.join(root, "geometry.js"))
);
const digest = (value) => createHash("sha256").update(value).digest("hex");
assert.equal(
  digest(await readFile(source)),
  "e189d2b1ad1166d079526164dc86b926d00107d7c1dab70c24df30b96fe2d215",
  "Use the original shelf benchmark file",
);
await mkdir(destination, { recursive: true, mode: 0o700 });
const save = (name, data) =>
  writeFile(
    path.join(destination, name + ".json"),
    JSON.stringify(data, null, 2),
    { mode: 0o600 },
  );
const parsed = JSON.parse(
  execFileSync(
    process.env.DOTNET || "/usr/share/dotnet/dotnet",
    [bridge, path.resolve(source)],
    { timeout: 30000, maxBuffer: 64 * 1024 * 1024 },
  ),
);
assert(!parsed.error, parsed.error);
const io = await compute("/io", { algo: parsed.algo, filename: "shelf.gh" });
assert.equal(io.Errors?.length || 0, 0, "Prepare must succeed");
const known = new Set((io.Inputs || []).map((input) => input.Name));
const controls = parsed.controls.filter((control) => known.has(control.name));
assert.equal(controls.filter((control) => control.kind === "number").length, 6);
assert.equal(parsed.graph.nodes.length, 60);
assert.equal(parsed.graph.wires.length, 70);
assert.equal(parsed.graph.groups.length, 26);
assert.equal(io.Outputs.length, 3);
await save("definition", {
  filename: "shelf.gh",
  controls,
  graph: parsed.graph,
  outputs: io.Outputs,
  warnings: parsed.warnings,
});
const reports = [];
for (const [name, changes, expectedMeshes] of [
  ["default", {}, 48],
  ["wider", { "X Size": 11.9 }, 48],
  ["more-shelves", { Count: 6 }, 54],
]) {
  const values = Object.fromEntries(
    controls.map((control) => [
      control.name,
      changes[control.label] ?? control.value,
    ]),
  );
  const start = performance.now();
  const solved = await compute("/grasshopper", {
    algo: parsed.algo,
    filename: "shelf.gh",
    values: makeValues(controls, values),
    cachesolve: false,
  });
  const preview = await previewGeometry(solved.values || []);
  const errors = solved.errors || [];
  const warnings = [...(solved.warnings || []), ...preview.warnings];
  const result = { ...preview, errors, warnings };
  await save(name, result);
  const min = [Infinity, Infinity, Infinity],
    max = [-Infinity, -Infinity, -Infinity];
  let vertices = 0;
  for (const object of preview.objects) {
    const positions = object.mesh?.data?.attributes?.position?.array;
    if (!positions) continue;
    for (let i = 0; i < positions.length; i += 3) {
      vertices++;
      for (let axis = 0; axis < 3; axis++) {
        min[axis] = Math.min(min[axis], positions[i + axis]);
        max[axis] = Math.max(max[axis], positions[i + axis]);
      }
    }
  }
  assert.equal(errors.length, 0, name + ": solve errors");
  assert.equal(warnings.length, 0, name + ": geometry warnings");
  assert.equal(
    preview.objects.filter((object) => object.kind === "mesh").length,
    expectedMeshes,
    name + ": mesh count",
  );
  assert(
    vertices > 0 && [...min, ...max].every(Number.isFinite),
    name + ": finite geometry",
  );
  reports.push({
    name,
    ms: Math.round(performance.now() - start),
    objects: preview.objects.length,
    vertices,
    bounds: { min, max },
    fingerprint: digest(JSON.stringify(preview.objects)),
    errors,
    warnings,
  });
}
assert.notEqual(
  reports[0].fingerprint,
  reports[1].fingerprint,
  "Width must change geometry",
);
assert.notEqual(
  reports[0].fingerprint,
  reports[2].fingerprint,
  "Count must change geometry",
);
assert(
  Math.abs(reports[1].bounds.max[0] - reports[0].bounds.max[0] - 2) < 1e-4,
  "Width must increase by two model units",
);
const report = {
  recordedAt: new Date().toISOString(),
  sourceSha256: digest(await readFile(source)),
  nodes: 60,
  wires: 70,
  groups: 26,
  sliders: 6,
  outputs: 3,
  reports,
};
await save("report", report);
console.log(JSON.stringify(report));
