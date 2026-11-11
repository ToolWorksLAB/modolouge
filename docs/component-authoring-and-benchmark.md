# Geometry creation and benchmark

Modolouge can now create component types that are absent from the uploaded definition. The agent searches a catalog exported from the installed Rhino runtime, then adds native templates with new object and port identities. The worker validates the edited archive and requires an actual Compute solve before adopting it.

The catalog contains 61 reviewed built-ins and three new C# components. Metadata includes names, descriptions, typed inputs, access modes, optionality, and zero-based port indices. Factory defaults are preserved in the embedded templates. External documentation is reference material, not proof that an addon is installed or safe to execute.

Useful references: [Grasshopper component index](https://grasshopperdocs.com/completeIndex.html), [RhinoCommon](https://developer.rhino3d.com/api/rhinocommon/assembly/rhinocommon/), [NURBS surfaces](https://developer.rhino3d.com/api/rhinocommon/type/rhino.geometry.nurbssurface/), [outlined text](https://developer.rhino3d.com/api/rhinocommon/type/rhino.geometry.textentity/).

## Agent changes

`search_components` returns relevant entries plus the standard slider, preview and point-construction helpers. `add` uses `nodeId` for a fresh UUID and `text` for the returned catalog ID. `integer` makes a slider a bounded whole-number control. Graph edits are limited to 96 operations, the existing 480-object creation ceiling, and two Compute tests. The agent gets fourteen model steps: the old eight-step ceiling could force final validation before component searches and construction were complete. A first draft cannot validate before a successful solve.

Adding the first visible preview preserves previously displayed hidden-preview fallback geometry unless the edits explicitly hide or remove it. Generated input/output names use full UUIDs to prevent collisions between model-generated IDs sharing a prefix. Box, rectangle and circle value types now have finite, plane-aware web previews.

## New C# components

* **Perlin Surface:** width, depth, amplitude, frequency, seed and resolution → NURBS surface. This is gradient Perlin noise sampled into a smooth control-point surface. Resolution 4–64; dimensions at most 10,000; frequency 0.001–10.
* **Populate Surface UV:** untrimmed surface, count and seed → points and frames. Count 0–500. Sampling is uniform in UV, not guaranteed equal-area or minimum-distance. Connect Frames to Sphere Base.
* **Bounds Dimensions:** final geometry, offset, text height and optional unit suffix → dimension curves and numeric X/Y/Z extents. Inputs are flattened to measure all supplied geometry together. Labels are outlined curves so the web renderer can display them. Units are labels only; no implicit conversion. These are world-axis bounding dimensions, not arbitrary aligned dimension entities, fabrication drawings or structural verification.

C# was chosen for these reusable components because the worker and Grasshopper bridge already use .NET and their types can be compiled and checked before deployment. Python remains useful for local prototyping, but switching language alone would not fix the missing creation tool.

The web agent **does not compile or execute arbitrary generated C# or Python**. It composes catalog components. Additional algorithms need a reviewed implementation, bounded inputs, tests, a stable component GUID, a native template, and deployment. Unrestricted generated code needs a separately isolated execution service; this release does not claim that capability. Production scripting endpoints remain disabled. The temporary operator-only runtime used for native exports and integration assertions is stopped after verification.

## Reproducing the benchmark

`benchmarks/geometry-prompts.json` defines 100 distinct prompts and explicit acceptance criteria across ten categories. The owner's source files are not committed to this public repository.

1. `benchmarks/plan-geometry.mjs` runs the actual configured model against native metadata. It writes a candidate graph or an explicit unsupported result. This is a geometry-planning evaluation, not 100 saved user apps.
2. `benchmarks/execute-plans.mjs` applies candidates through the real bridge, prepares them with `/io`, solves through `/grasshopper`, and builds web previews. Each result records its plan SHA-256. A successful nonempty solve is labeled `solved_semantics_unverified`, not a prompt pass.
3. `benchmarks/verify-procedural.cs` checks surface repeatability, seed response, zero amplitude, sphere centers on the surface, count changes, dimension values, text curves and shelf-width response in the actual Rhino runtime.
4. `benchmarks/agent-smoke.mjs` exercises the production agent/tool loop on sphere, noise/population and shelf-dimension requests. Its file-based harness waits for real Linux results; it never fabricates Compute success.

The first complete pass produced 45 solving candidates and 55 explicit unsupported results. Four transient gateway errors were retried. These are **not 45 verified modeling successes**: most acceptance criteria still need semantic or visual checks, and the first box plan used half-extents as full dimensions. Catalog guidance now explains that distinction. The benchmark deliberately retains difficult Boolean, meshing, fabrication and novel-algorithm requests to expose remaining gaps.

The three full agent smoke tests each constructed the requested graph and completed after one successful Compute test. Sphere radius 3→6 doubled its measured diameter; Perlin population produced the requested sphere count with centers on the surface; shelf dimensions tracked a two-unit width change while depth stayed fixed. The test report records the precise evidence separately from broad solve counts.

## Deployment

### Production queue regression, 2026-11-11

The bridge and API accepted 96 edits, but `worker/execute.js` still rejected more than 24. This caused the user's 54- and 44-edit sphere drafts to fail with `Invalid graph edit job`. The worker now accepts the same 96-edit limit and reports distinct state, type and limit errors.

The earlier agent smoke harness called the bridge and Compute directly; it did **not** cover the production queue or the execute.js guard. `tests/worker-edits.test.mjs` now exercises that guard, including 25, 43, 54 and 96 edits, rejection at 97, and immutable candidate storage. All 70 Node tests passed.

`benchmarks/worker-job-linux.mjs` replays saved edits against private copied definitions through real SQS, the production worker, bridge and Compute. With `REGRESSION_EXTERNAL_QUEUE=1` and a unique `REGRESSION_JOB_ID`, an authorized queue producer submits the ID after the JOB record exists; the worker role does not need SendMessage permission. The 44-edit replay passed with 66 preview objects and no errors. The 54-edit replay passed the repaired guard but correctly rejected its unsupported `Sqrt(x)+20` input expression; it is not counted as a successful solve.

`benchmarks/satellite-sweep-linux.mjs` checked the successful candidate against real Compute: one main sphere, one surface and 64 satellites remained present at main radii 10, 23, 50 and 90. Satellite radii decreased to approximately 5.3333, 3.7209, 2.2857 and 1.4545 respectively. These tests use isolated records and leave the user's saved app and source unchanged.

Build `worker/tools/GhBridge` with the embedded catalog and deploy the matching policy. Build `worker/tools/ModolougeGeometry` and install its DLL as `ModolougeGeometry.gha` in the Rhino service user's Grasshopper Libraries directory; restart Compute to load it. `worker/install.sh` includes those steps. Deploy the worker before the frontend starts issuing new edit operations. Keep the source upload and the previous worker/plugin artifacts available for rollback.
