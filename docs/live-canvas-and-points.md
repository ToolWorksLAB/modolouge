# Live build canvas and point manipulation

11 October 2026. This release adds a live Grasshopper activity panel, actual XYZ gumballs, preview visibility edits and expressive app styles.

## User workflow

Upload a definition, describe the desired app, and watch the agent read the graph, share a short plan, inspect components and test proposed changes. Highlighted nodes and wires correspond to actual tools. The graph updates after a candidate passes Compute; pending edits are listed as proposals. Failed attempts stay visible and do not replace the saved app. The owner can pan, search and inspect the canvas or disable camera following. The panel collapses after the new draft opens. Reduced-motion preferences disable activity animation.

Single embedded, unwired Point parameters are exposed automatically. Select a point in the viewport and drag an axis or plane, or use the equivalent XYZ fields. Dragging changes local inputs only. Update model submits one solve. Reset restores the saved position; unchanged coordinate arrays do not create false pending changes. Gumballs work in Model, AI-generated apps, published apps and the advanced layout preview. Point lists, computed points, referenced Rhino points and noncanonical trees remain intact and are not exposed as single positions.

Older drafts retain their prior metadata. Ask the agent to enable point gumballs; an empty-edit test reparses the retained archive and refreshes the real bindings, without requiring permission to alter geometry. If visible Custom Previews contain stored snapshots and the live parametric branch is hidden, the agent must inspect connections and, with definition editing enabled, switch the appropriate preview flags and pass a real solve. It must not claim a visible snapshot changes with an attractor.

## Implementation and bounds

- `PointInputs.cs` reads only the exact reviewed Point parameter with one embedded Coordinate, branch `{0}`, no source and no extra reference fields. Finite coordinates are bounded to ±1,000,000. `Program.cs` adds Compute input groups and preserves visible point outputs.
- `worker/compute.js` validates XYZ arrays and serializes `Rhino.Geometry.Point3d`. The browser uses Three.js TransformControls; orbit is disabled during dragging. The point selector occupies its own area rather than covering the handles.
- `AgentActivity.jsx` consumes the existing authenticated NDJSON stream. Events have stable IDs, phases, timestamps, touched-node IDs and bounded edit summaries. Graph snapshots stream to the owner; audit rows keep summaries rather than duplicate graph payloads. Legacy empty event messages receive a useful label.
- The agent has up to eight model steps, two Compute tests, 6,000 output tokens per step and a 120 KB message-context guard. The existing $3 reservation remains unchanged: the reduced context bound offsets the extra model steps. Usage and provider costs continue through the existing manager ledger.
- The `preview` graph operation changes a node's saved visibility only and accepts 0/1. All candidates still pass archive policy and Compute before adoption. Failed final tests still preserve the previously saved revision; this release does not silently commit earlier partial edits.
- Branding supports Studio, Storybook, Blueprint and Gallery presentation. Storybook adds a serif heading, decorative stars, rounded controls and accent buttons. References and provisional brand status remain honest; this is not verified third-party branding. No arbitrary code generation or new component installation is enabled.
- No database migration, new provider or hosting-plan change is required. Public pages continue to omit the private conversation and Grasshopper graph.

## Verification

The private `e.gh` archive remains outside Git. It exposes 14 controls, including two points, while retaining 70 nodes and 82 wires. The Linux benchmark `tests/benchmarks/point-gumballs-linux.mjs` checks the original nine-object preview, then a separate visibility-only diagnostic with two live outputs. Moving either attractor independently changes the actual geometry fingerprint. Initial staged solves took 60–79 ms without geometry errors. Node tests cover point payloads, malformed input rejection, dirty-state comparisons and action merging. Native tests cover point/reference/tree distinctions and visibility edits.

The isolated `/design/ai` fixture exercises visible progress and dragging without cloud charges. It is clearly labeled simulated and returns 404 in production. A real browser drag changed X from -8 to 4.856173 without changing Y/Z. Production acceptance passed on the company domain: GPT-6.1 Sol inspected the graph, changed four Custom Preview visibility flags, solved two live objects in 80 ms and saved a one-step Storybook app with both gumballs. Dragging Attractor 1 in the actual production viewport changed X from -376.387678 to 384.236195; Update completed and returned an up-to-date two-object pattern. No public app was published during this test. The manager ledger recorded 83,758 input tokens (62,654 cached), 3,388 output tokens (390 reasoning) and $0.09283040 Gateway-reported cost. Failed-candidate safeguards and the older-draft empty-edit refresh are covered by automated tests. Final coverage is 55 Node tests plus 120 archive-policy assertions; the production build passed.

## Release and rollback

Deploy the worker bridge and compute serializer together, then the company Modolouge Vercel project. Worker staging is `/opt/modolouge-staging/live-points-20261011`; backup is `/opt/modolouge-worker-backups/live-points-20261011`. Gracefully stop the worker, restore `compute.js` and `tools/GhBridge` from that backup, and restart it to roll back. Restore the prior Vercel production deployment separately. Do not change Rhino licensing or owner archives.


## Optional live compute

The Live compute switch is available beside the run controls in Model and generated/published apps, and above Advanced layout. Manual Update remains the default. Enabling Live compute generates the first result if needed, then schedules a solve 650 ms after the latest input change and pointer release. Sliders, text/number/boolean inputs, resets and point gumballs share the existing solve endpoint. No AI call is needed. Every solve consumes the normal geometry allowance and is recorded by the existing usage system.

The scheduler deduplicates unchanged values, allows one automatic request at a time, cancels pending work when switched off or unmounted, and suspends while a job/AI action is busy, the page is hidden, sign-in is open, compute is offline or the allowance is exhausted. Switching off does not cancel a job already accepted by the server. A failed solve switches live mode off; re-enabling it explicitly permits a retry. Opening a different definition or revision resets the option to off. No preference is persisted in the database or browser storage.

`components/LiveCompute.jsx` owns the session switch and pointer/visibility listeners; `lib/live-compute.js` owns the request scheduler. Six scheduler tests cover batching, input release, availability, overlap prevention, failure handling, cancellation and mixing manual with automatic solves. The isolated AI preview displays a simulated solve counter to verify the UI without cloud usage.
