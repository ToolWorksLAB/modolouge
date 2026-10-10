// Private shelf.gh input is supplied separately; never commit it.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import path from "node:path";
const [source, destination] = process.argv.slice(2);
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
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const before = digest(await readFile(source));
await mkdir(destination, { recursive: true, mode: 0o700 });
const parse = (file, patch) =>
  JSON.parse(
    execFileSync(
      "/usr/share/dotnet/dotnet",
      [bridge, file, ...(patch ? ["--patch", patch] : [])],
      { maxBuffer: 64 * 1024 * 1024 },
    ),
  );
const original = parse(source);
const count = original.controls.find((c) => c.label === "Count");
assert(count, "Count slider");
const countId = count.instanceId;
const cloneId = randomUUID();
const connected = original.graph.wires.filter((w) => w.sourceNode === countId);
assert(connected.length);
const edits = [
  { op: "clone", nodeId: countId, newId: cloneId, text: "Shelf count" },
  { op: "slider", nodeId: cloneId, value: 6 },
  ...connected.flatMap((w) => {
    const target = original.graph.nodes.find((n) => n.id === w.targetNode);
    const input = target.inputs.findIndex((p) => p.id === w.targetPort);
    assert(input >= 0);
    return [
      {
        op: "disconnect",
        nodeId: target.id,
        input,
        sourceNode: countId,
        output: 0,
      },
      {
        op: "connect",
        nodeId: target.id,
        input,
        sourceNode: cloneId,
        output: 0,
      },
    ];
  }),
];
const patch = path.join(destination, "patch.json");
await writeFile(patch, JSON.stringify(edits), { mode: 0o600 });
const candidate = parse(source, patch);
assert.equal(candidate.graph.nodes.length, 61);
assert.equal(candidate.graph.wires.length, 70);
assert.equal(
  candidate.controls.find((c) => c.instanceId === countId).value,
  count.value,
);
assert.equal(candidate.controls.find((c) => c.instanceId === cloneId).value, 6);
const io = await compute("/io", { algo: candidate.algo, filename: "shelf.gh" });
assert.equal(io.Errors?.length || 0, 0);
const known = new Set(io.Inputs.map((x) => x.Name));
candidate.controls = candidate.controls.filter((c) => known.has(c.name));
const solved = await compute("/grasshopper", {
  algo: candidate.algo,
  filename: "shelf.gh",
  values: makeValues(candidate.controls, {}),
  cachesolve: false,
});
assert.equal(solved.errors?.length || 0, 0);
const preview = await previewGeometry(solved.values);
assert.equal(preview.objects.length, 54);
assert.equal(
  digest(await readFile(source)),
  before,
  "Original file is immutable",
);
// Re-open an already prepared archive, removing only our generated RH groups.
const binary = path.join(destination, "candidate.gh");
await writeFile(binary, Buffer.from(candidate.algo, "base64"), { mode: 0o600 });
await writeFile(patch, JSON.stringify([{ op: "remove", nodeId: countId }]), {
  mode: 0o600,
});
const cleaned = parse(binary, patch);
assert.equal(cleaned.graph.nodes.length, 60);
assert.equal(cleaned.graph.wires.length, 70);
await writeFile(
  path.join(destination, "summary.json"),
  JSON.stringify({
    passed: true,
    edits: edits.length,
    nodes: candidate.graph.nodes.length,
    wires: candidate.graph.wires.length,
    objects: preview.objects.length,
    sourceUnchanged: true,
  }),
  { mode: 0o600 },
);
console.log(
  JSON.stringify({
    passed: true,
    edits: edits.length,
    nodes: candidate.graph.nodes.length,
    wires: candidate.graph.wires.length,
    objects: preview.objects.length,
    sourceUnchanged: true,
  }),
);
