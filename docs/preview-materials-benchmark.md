# Connected Colour Swatch compatibility

The owner's private `e.gh` exposed a false rejection after the mesh-component release. All four Custom Previews have direct Colour Swatch connections, but two M inputs retain old Rhino RDK material defaults. Those defaults are overridden at solve time. The previous global validator rejected their presence before examining the connections.

`PreviewMaterials.Normalize` now removes these ignored defaults from the in-memory archive before validation and component deserialization. It never loads RDK XML, follows a material path, changes a component type, rewires the graph, or writes back to the source. Cleanup requires the known Custom Preview GUID, material port index 1, a consistent source count, and uniquely resolved unlocked Colour Swatch GUIDs for every source. Direct `param_input` and `ParameterData/InputParam` layouts are supported. Missing, ambiguous, disconnected, locked or differently typed sources remain subject to the material restriction. An active unsupported material error now identifies its owning node.

The same file has three embedded curves inside generic Data parameters. Their exact `Grasshopper.Kernel.Types.GH_Curve` type and closed saved-data shape are now accepted, preserving the generic node types. Inspection of the installed Grasshopper readers confirmed that this uses the same built-in curve reader as the supported typed Curve parameter. Nonempty Rhino document references, ObjectWrapper, plugin goo, assembly-qualified names, ambiguous sections and other payload shapes are rejected. This does not enable arbitrary generic-object deserialization.

## Private benchmark

Original SHA-256: `a2049034348f18962e552fe75029cf2fa911948a0ca31a6e548328f25062bf7c`.

- 70 nodes, 82 resolved wires, nine numeric sliders and three unwired Panels.
- Four Custom Previews; two stale M defaults are removed in memory.
- Twelve generic Data nodes, three containing the reviewed embedded curves.
- Every node identity, connection, control and visibility flag is preserved.
- Original visibility renders nine geometry objects with 3,566 mesh vertices on Linux, with no solve or tessellation errors/warnings.

The file's two visible previews use saved Mesh/Brep snapshots. The slider-driven Move/Rotate branches feed hidden previews. Output selection continues to honor that choice: changing a slider need not change the visible saved snapshots. A separate maintenance-only copy swapped those preview visibility flags to exercise the live branches. Defaults produced two meshes/2,928 vertices; changing X to 1251 produced 3,172 vertices; Amplitude A to 42.6 changed the geometry fingerprint with 2,928 vertices. No geometry or wiring edits were made, and this diagnostic is not substituted for the user's original upload. Custom Preview color fidelity is not part of this fix; the web renderer still uses its standard material.

Neither the original, decoded GHX, diagnostic copy nor result geometry may be committed to this public repository.

## Repeating verification

```powershell
dotnet run --project tests/ArchivePolicy/ArchivePolicy.Tests.csproj -- C:/private/shelf.ghx C:/private/e.ghx
dotnet run --project tests/GraphReader/GraphReader.Tests.csproj
```

The policy suite passes 110 assertions with both private archives, and the graph-reader suite passes 12. Negative cases cover incorrect material ports, unresolved/ambiguous sources, locked swatches, disconnected material defaults and unsafe generic persisted types. The original shelf regression also passes its 48/48/54-mesh variants on Linux.

Run `tests/benchmarks/preview-materials-linux.mjs` on the Linux worker with the existing systemd environment loaded, following the [shelf benchmark](shelf-benchmark.md) credential and worker-user instructions. Arguments: private original `e.gh`, protected results directory, optional visibility-only diagnostic GHX. `MODOLOUGE_BRIDGE` selects the staged bridge. It checks finite geometry and original file integrity, saves private reports, and uses real Compute time without public job telemetry. An authenticated production upload and model run separately verify the public API/queue/worker/viewport flow.

Production verification passed on 2026-10-11 (Europe/Madrid): the original binary `e.gh` uploaded through the signed-in public UI, exposed 12 editable inputs, and generated nine viewport objects with a displayed 0.10-second solve. The upload and solve used two ordinary account jobs and normal telemetry. No AI request or public app publication was needed. The deployed Linux bridge SHA-256 is `a79b5eafcbebb4a74bab98766ed84ead12cd28e3906196f75dc1f3e12a07be3b`.
