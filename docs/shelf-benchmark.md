# Shelf compatibility benchmark

The owner's `shelf.gh` exposed a compatibility gap on 2026-10-10: Rectangle and 17 other standard component types were missing from the public worker's allowlist. The previous error incorrectly implied that an unlisted component must be a plugin.

The policy now contains 48 reviewed built-in component types. IDs and implementations were checked against the installed McNeel Rhino 8 Grasshopper assemblies. This is a bounded compatibility expansion, not support for every built-in component.

## Expected archive and geometry

The original benchmark is private and must not be committed, nor should its decoded archive or generated geometry. Its SHA-256 is `e189d2b1ad1166d079526164dc86b926d00107d7c1dab70c24df30b96fe2d215`.

- 86 saved objects: 60 nodes and 26 groups; 70 resolved wires.
- Six numeric sliders, plus six unwired Panel inputs.
- One saved Bezier Graph Mapper and an arithmetic input expression, `-x`.
- Three final Brep parameters connected to two hidden Custom Preview components.
- Default: 48 meshes. X Size 9.9 → 11.9: 48 meshes and two extra units of width. Count 5 → 6: 54 meshes.

The first live Linux test returned all three variants without solve or tessellation warnings/errors. Solve plus tessellation took 274 ms initially and 59 ms for each variant; these are individual observed server timings, not a latency guarantee or browser/queue timings. The current renderer uses its standard material rather than Custom Preview colors.

Production browser verification also passed on 2026-10-10: a normal signed-in upload prepared successfully, Model generated 48 objects, and changing Count to 6 then pressing Update produced 54 objects. The real shelf was inspected in the 3D viewport. This used the public API, S3 and queued Linux worker; it did not bypass account limits. AI generation remains a separate provider-activation check.

## Output selection and boundaries

Explicit `RH_OUT` groups still take precedence. Otherwise, when Custom Preview exists, output selection uses its connected geometry sources, excluding its material input. Visible unlocked previews take precedence; if all previews are hidden, their geometry is used with a warning. This recovers the intended shelf instead of showing intermediate construction curves.

Saved Bezier Graph Mapper data is supported; interactive graph editing and other graph types are not included in this release. Input expressions use a closed arithmetic grammar (`x`, finite numbers, parentheses, unary signs and `+ - * / % ^`), with length/depth limits. Functions, scripts, clusters, panel file streaming and arbitrary persisted generic Data/Relay objects remain rejected. The ordinary resource, authentication and trial limits still apply.

## Repeat the checks

From the repository root, run the self-contained policy tests. Optionally append the path to a privately decoded shelf GHX for the archive-specific assertions:

```powershell
dotnet run --project tests/ArchivePolicy/ArchivePolicy.Tests.csproj -- C:/private/shelf.ghx
dotnet run --project tests/GraphReader/GraphReader.Tests.csproj
```

For the real solve, copy `tests/benchmarks/shelf-linux.mjs` and the private original file to a protected directory on the Linux worker. Run as the worker user with the existing Compute environment loaded by systemd (never print or copy the credential into the command):

```sh
systemd-run --quiet --wait --pipe --collect \
  -p User=modolouge-worker -p Group=modolouge-worker \
  -p EnvironmentFile=/etc/rhino-compute/environment \
  -p RuntimeMaxSec=300 --setenv=COMPUTE_TIMEOUT_MS=90000 \
  /usr/local/bin/node /private/shelf-linux.mjs /private/shelf.gh /private/results
```

The output directory must be writable by that user. This maintenance test uses the installed bridge and the actual local Rhino Compute geometry pipeline. It creates private JSON results and validates mesh counts, finite bounds and slider-dependent geometry. `MODOLOUGE_WORKER`, `MODOLOUGE_BRIDGE` and `DOTNET` may override paths for a staged build. It does not test browser authentication, S3/queue transport or the AI provider, and it does not create public job/usage records; it does consume the running server's compute time.

After a worker release, also upload through the signed-in production UI, run the model, change a slider, and inspect its canvas and viewport. Keep that evidence separate from the AI drafting test, which requires an activated provider.
