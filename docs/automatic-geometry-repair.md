# Automatic geometry-only archive repair

The worker can prepare a separate geometry-only copy of an archive containing unsupported components. The private uploaded original is never overwritten.

Repair runs on inert GH_IO XML before Grasshopper deserialization. It uses explicit RH_OUT groups first; otherwise it uses the same visible/unlocked Custom Preview selection as the existing output policy, with the existing hidden-preview fallback. RH_IN group members are also protected. It retains the complete upstream dependency closure, including preview material inputs. Unsupported components required by that closure still reject the upload.

Repair is conservative: absent output anchors, context-bake outputs, nested definitions, unresolved wires, duplicate identifiers, missing objects, inconsistent source counts, or unrecognized connection layouts prevent automatic pruning. Ordinary component and payload validation runs after repair. No new component is allowlisted, no approximation is made, and resource/authentication limits remain unchanged.

When unsupported components exist only outside selected outputs, preparation removes the unused branches, cleans group membership and archive counts, and records a warning listing every removed component type and count. This warning appears in File notes, reaches the AI agent as archiveWarnings, and is retained through subsequent graph edits. The agent must disclose omitted annotations/styling rather than claim they are supported.

Validation:

- `dotnet run --project tests/ArchivePolicy/ArchivePolicy.Tests.csproj`
- `npm test` using Node 24
- `npm run build`

The owner's Shelf_Clean3.gh is private and is not included in this repository. Its 102 original objects contain 11 instances of seven unsupported types. Repair removes 30 non-group objects outside the shelf previews, retaining 43 nodes and 55 wires. The five shelf sliders and two shared Panel inputs remain available. Live package versions and solve evidence are recorded after deployment.

## Production verification — 10 November 2026

Rhino.Compute was upgraded from 9.0.26266.5560-wip to 9.0.26313.10120-wip; Rhino from 9.1.26277.7009 to 9.2.26313.9079. Both match the refreshed McNeel APT candidates. The old packages and worker are retained in a private server rollback directory.

The original Shelf_Clean3.gh (SHA-256 fd0f5557037e32a815eedf3100e813095bc29157a478ae9191ccc6c75e614ac4) passed the installed Linux bridge and upgraded Compute. Default: 48 objects, 261 ms; X Size 9.9 to 11.9: 48 objects and exactly two additional units of width, 72 ms; Count 5 to 6: 54 objects, 64 ms. All three had finite geometry and zero solve/tessellation errors or warnings. These are individual server timings, not browser latency guarantees. The preparation warning deliberately discloses the removed branches.

The automatic repair's nodes, wires and controls were also compared against the previously tested manually prepared geometry-only copy and were identical. The original binary file remains unchanged. Private input files and geometry results are not committed.
