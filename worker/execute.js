import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compute, makeValues } from "./compute.js";
import { previewGeometry } from "./geometry.js";
import { previewData } from "./data-outputs.js";
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
  if (job.type === "edit") {
    if (
      def.status !== "ready" ||
      !Array.isArray(job.edits) ||
      job.edits.length > 24
    )
      throw new Error("Invalid graph edit job.");
    const original = JSON.parse(
      new TextDecoder().decode(await download(def.preparedKey)),
    );
    const temp = await mkdtemp(path.join(tmpdir(), "modolouge-edit-"));
    let parsed;
    try {
      const source = path.join(temp, "candidate.gh"),
        patch = path.join(temp, "edits.json");
      await writeFile(source, Buffer.from(original.algo, "base64"));
      await writeFile(patch, JSON.stringify(job.edits));
      try {
        const { stdout } = await run(
          "/usr/share/dotnet/dotnet",
          [
            path.join(root, "tools/GhBridge/publish/GhBridge.dll"),
            source,
            "--patch",
            patch,
          ],
          { timeout: 30000, maxBuffer: 64 * 1024 * 1024 },
        );
        parsed = JSON.parse(stdout);
      } catch (e) {
        throw new Error(
          e.stderr?.trim().slice(0, 1000) || "Graph edit validation failed.",
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
      return { passed: false, errors: io.Errors, warnings: io.Warnings || [] };
    const known = new Set((io.Inputs || []).map((x) => x.Name));
    parsed.controls = parsed.controls.filter((x) => known.has(x.name));
    const started = performance.now();
    const solved = await compute("/grasshopper", {
      algo: parsed.algo,
      filename: def.filename,
      values: makeValues(parsed.controls, {}),
      cachesolve: false,
    });
    const preview = await previewGeometry(solved.values || []);
    const errors = solved.errors || [],
      warnings = [...(solved.warnings || []), ...preview.warnings];
    const passed =
      errors.length === 0 &&
      preview.objects.length > 0 &&
      !preview.warnings.some((w) => /failed/i.test(w));
    const summary = {
      passed,
      errors,
      warnings,
      objects: preview.objects.length,
      duration: Math.round(performance.now() - started),
      nodes: parsed.graph.nodes.length,
      wires: parsed.graph.wires.length,
    };
    if (!passed) return summary;
    const output = {
      ...summary,
      definition: {
        id: job.id,
        filename: def.filename,
        controls: parsed.controls,
        graph: parsed.graph,
        warnings: parsed.warnings,
        outputs: io.Outputs || [],
      },
      geometry: {
        ...preview,
        dataOutputs: previewData(solved.values || []),
        errors,
        warnings,
        duration: summary.duration,
      },
    };
    if (Buffer.byteLength(JSON.stringify(output)) > 40 * 1024 * 1024)
      throw new Error("Preview is larger than 40 MB. Reduce the output.");
    // The input definition is immutable; a tested candidate has its own identity.
    const preparedKey = `prepared/${job.owner}/${job.id}.json`;
    await upload(preparedKey, parsed);
    await put({
      pk: "DEF#" + job.id,
      sk: "STATE",
      id: job.id,
      owner: job.owner,
      filename: def.filename,
      status: "ready",
      preparedKey,
      ttl: Math.floor(Date.now() / 1000) + 86400,
    });
    return output;
  }
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
    dataOutputs: previewData(result.values || []),
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
