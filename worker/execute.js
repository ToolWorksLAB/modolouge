import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compute, makeValues } from "./compute.js";
import { previewGeometry } from "./geometry.js";
import { get, put, download, upload } from "./storage.js";
const root = path.dirname(fileURLToPath(import.meta.url)),
  run = promisify(execFile);
export async function execute(job) {
  let def = await get("DEF#" + job.definitionId);
  if (job.type === "example") {
    def = {
      pk: "DEF#" + job.definitionId,
      sk: "STATE",
      id: job.definitionId,
      owner: job.owner,
      filename: "parametric-sphere.ghx",
      ttl: Math.floor(Date.now() / 1000) + 86400,
    };
  }
  if (
    !def ||
    def.owner !== (job.definitionOwner || job.owner) ||
    def.ttl < Date.now() / 1000
  )
    throw new Error("Definition expired or unavailable. Upload it again.");
  if (job.type === "prepare" || job.type === "example") {
    const bytes =
      job.type === "example"
        ? await readFile(path.join(root, "examples/parametric-sphere.ghx"))
        : await download(def.key);
    if (bytes.length > 20 * 1024 * 1024)
      throw new Error("Maximum file size is 20 MB.");
    const temp = await mkdtemp(path.join(tmpdir(), "modolouge-"));
    let parsed;
    try {
      const source = path.join(
        temp,
        def.filename.toLowerCase().endsWith(".ghx")
          ? "definition.ghx"
          : "definition.gh",
      );
      await writeFile(source, bytes);
      try {
        const { stdout } = await run(
          "/usr/share/dotnet/dotnet",
          [path.join(root, "tools/GhBridge/publish/GhBridge.dll"), source],
          { timeout: 30000, maxBuffer: 64 * 1024 * 1024 },
        );
        parsed = JSON.parse(stdout);
      } catch (e) {
        throw new Error(
          e.stderr?.trim().slice(0, 1000) ||
            "Could not read this Grasshopper archive.",
        );
      }
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
    const io = await compute("/io", {
      algo: parsed.algo,
      filename: def.filename,
    });
    if (io.Errors?.length)
      throw new Error(
        "Rhino could not prepare this definition: " +
          io.Errors.join("; ").slice(0, 800),
      );
    const known = new Set((io.Inputs || []).map((x) => x.Name));
    parsed.controls = parsed.controls.filter((x) => known.has(x.name));
    const preparedKey = `prepared/${job.owner}/${def.id}.json`;
    await upload(preparedKey, parsed);
    await put({ ...def, status: "ready", preparedKey });
    return {
      id: def.id,
      filename: def.filename,
      controls: parsed.controls,
      graph: parsed.graph,
      outputs: io.Outputs || [],
      warnings: [...parsed.warnings, ...(io.Warnings || [])],
    };
  }
  if (job.type !== "solve" || def.status !== "ready")
    throw new Error("Definition is not ready.");
  const prepared = JSON.parse(
    new TextDecoder().decode(await download(def.preparedKey)),
  );
  const start = performance.now();
  const result = await compute("/grasshopper", {
    algo: prepared.algo,
    filename: def.filename,
    values: makeValues(prepared.controls, job.values),
    cachesolve: false,
  });
  const preview = await previewGeometry(result.values || []);
  const body = {
    ...preview,
    duration: Math.round(performance.now() - start),
    errors: result.errors || [],
    warnings: [...(result.warnings || []), ...preview.warnings],
  };
  if (JSON.stringify(body).length > 40 * 1024 * 1024)
    throw new Error("Preview is larger than 40 MB. Reduce the output.");
  return body;
}
if (process.argv[2]) {
  try {
    const result = await execute(JSON.parse(process.argv[2]));
    const key = `results/${process.argv[3]}.json`;
    await upload(key, result);
    process.stdout.write(JSON.stringify({ key }));
  } catch (e) {
    process.stdout.write(JSON.stringify({ error: e.message.slice(0, 1200) }));
    process.exitCode = 1;
  }
}
