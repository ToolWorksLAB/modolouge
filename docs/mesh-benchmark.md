# Mesh compatibility benchmark

The owner's private `tset4.gh` revealed another compatibility gap on 2026-10-10. Its 72 nodes include nine numeric sliders, fourteen previously unlisted McNeel built-in types, and one Weaverbird Catmull-Clark Subdivision component. The old first-six error hid the plugin among the remaining types.

The reviewed policy now has 62 types. Added: Mesh Surface, Construct Domain, Point, Pull Point, Remap Numbers, Bounds, Sine, Deconstruct Mesh, Construct Mesh, basic Material/Shader parameter, Mesh parameter, Orient Direction, Rotate 3D and Pi. IDs and solve/read behavior were checked against the installed Rhino 8 assemblies and exercised on Linux using a separate test copy. Unknown types still fail before Grasshopper deserialization. Weaverbird is identified by its GUID, independently of a saved display label, and gets an explicit compatibility message.

## What remains incompatible in the original

- Weaverbird is not enabled on this service. Removing it silently would change the model, so the original remains rejected.
- Three generic Data parameters have internalized `GH_Curve` values. Generic persisted object deserialization remains blocked; use typed Curve parameters instead.
- Two material parameters contain Rhino RDK material XML. Public uploads now reject nonempty RDK XML, material-file paths and document material IDs. Use a Colour Swatch or basic display material. This is not a rendering-material fidelity release.
- The original's two visible Custom Previews show internalized Mesh/Brep snapshots. Its two live, slider-driven previews are hidden. The bridge correctly honors that visibility; the web copy explicitly changes it.

[McNeel's Linux guide](https://developer.rhino3d.com/guides/compute/compute-linux-getting-started/) describes restricted third-party plugin loading. [Weaverbird's author](https://www.giuliopiacentino.com/weaverbird/) describes the Catmull-Clark operation. Neither establishes that this exact plugin works on our Linux installation; no plugin was installed for this release.

## Private test copy

Original SHA-256: `15c52697da0ac93b7cb2fc7666ded8a731496421e59cf5a11193e6444c032971`.

Web-copy GHX SHA-256: `2891684fcc36fc9a25b8f6f7e9a32c3ff2c093a6ca8c3f33e3c2cea18e333425`.

The separate, clearly named `tset4-modolouge-unsmoothed.ghx` bypasses subdivision, reconnects both consumers to the original constructed mesh, converts the three stored curves to typed Curve parameters, removes RDK references and the unused Weaverbird manifest, enables the two live previews and hides the two saved snapshot previews. It has 71 nodes, 82 resolved wires and nine numeric sliders. It retains the underlying data and the original file is untouched. This is an unsmoothed alternative, not a geometry-equivalent replacement for Weaverbird.

Neither source file, decoded archive nor result geometry belongs in this public repository.

## Verification

Local archive policy tests passed 63 assertions including the previous shelf benchmark; graph-reader tests passed 12. The staged Linux bridge prepared the web copy and solved three variants with two mesh objects, finite coordinates, no solve errors and no preview warnings:

| Variant | Vertices | Solve + preview time |
|---|---:|---:|
| Saved defaults | 2,928 | 121 ms |
| X 1151 → 1251 | 3,172 | 97 ms |
| Amplitude A 32.6 → 42.6 | 2,928 | 67 ms |

Both edited variants changed the geometry fingerprint. These are individual maintenance timings, not browser latency guarantees. Two selected transform components expose four Compute output ports: two Geometry and two Transform. Only the geometry is rendered.

The shelf regression also passed its default/wider/count variants (48/48/54 meshes). The original tset4 file was separately confirmed to fail with the new specific Weaverbird explanation. The Linux build retains existing warnings about Rhino's Drawing dependencies referencing .NET 10 metadata; the bridge and actual solves completed on .NET 9.

After deployment, the signed-in production browser uploaded the web copy, exposed all nine sliders, rendered two meshes, and completed X 1151 → 1251 through the public queued API. The viewport was visually inspected. These three normal jobs (prepare, default solve, changed-width solve) used account quotas and regular telemetry. No AI generation or public app publication was part of this check.

Repeat the private mesh test using `tests/benchmarks/mesh-builtins-linux.mjs`, the web-copy GHX, and a protected results directory. As with the shelf test, load Compute credentials using the existing systemd environment file and run as `modolouge-worker`; never embed credentials. `MODOLOUGE_BRIDGE` can select a staged build. Maintenance tests consume Compute time but do not create public usage/job records. Verify the authenticated upload and viewport separately before claiming an end-to-end release.
