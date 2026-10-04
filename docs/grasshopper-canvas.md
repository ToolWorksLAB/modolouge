# Grasshopper canvas and NodePen research

Reviewed 4 October 2026. Implementation: Modolouge public workspace, on its existing Linux Compute backend.

## What NodePen does

NodePen describes a browser authoring and sharing platform backed by Rhino Compute, with a separate live 3D view, publishing controls, multiplayer collaboration and version history. Its current site lists importing existing Grasshopper files, groups, clusters and scripting/plugin support on its roadmap. Those are product claims and roadmap entries, not independently verified capabilities. [Official product site](https://nodepen.io/).

The current public repository is a **viewer library**, not the entire hosted platform. Its README explicitly describes the local preview as offline and unable to run solutions. This differs from older indexed README/architecture pages for the previous monorepo. We inspected commit `06ab7c5c2f4cf8d6b3829c1517f4afa8ea61346e` (2 October 2026). [Current README](https://github.com/nodepen/nodes/blob/06ab7c5c2f4cf8d6b3829c1517f4afa8ea61346e/README.md).

The library's document model stores nodes, groups, clusters, controls and settings. Each node carries template and instance IDs, position/dimensions, source connections keyed by input IDs, input/output maps, saved values, configuration, and optional archive state. This allows a browser document to describe Grasshopper semantics without running the solver in JavaScript. [Document schema](https://github.com/nodepen/nodes/blob/06ab7c5c2f4cf8d6b3829c1517f4afa8ea61346e/src/types/Document.ts), [node schema](https://github.com/nodepen/nodes/blob/06ab7c5c2f4cf8d6b3829c1517f4afa8ea61346e/src/types/DocumentNode.ts).

Rendering uses React and SVG, with camera properties and layers for nodes and annotations. Wires are Bezier paths; their rendering varies with data structure and selection. The public package uses Zustand for state. The precise deployed backend, persistence and collaboration architecture cannot be established from this repository alone. [Canvas renderer](https://github.com/nodepen/nodes/blob/06ab7c5c2f4cf8d6b3829c1517f4afa8ea61346e/src/views/document-view/DocumentViewContent.tsx), [wire renderer](https://github.com/nodepen/nodes/blob/06ab7c5c2f4cf8d6b3829c1517f4afa8ea61346e/src/components/annotations/wire/Wire.tsx), [package](https://github.com/nodepen/nodes/blob/06ab7c5c2f4cf8d6b3829c1517f4afa8ea61346e/package.json).

## Modolouge implementation

We use an independently implemented SVG viewer rather than importing NodePen's editor/state architecture. It adds no frontend dependency and keeps the existing upload → reviewed archive → Linux Compute → geometry path.

1. GH_IO reads the bounded `.gh` or `.ghx` archive. `GraphReader.cs` extracts saved positions, node names, input/output IDs, source connections, original groups and plain panel/scribble text before synthetic Compute I/O groups are inserted. This metadata step does not instantiate a Grasshopper document.
2. The existing prepare job returns the graph alongside controls. Controls now include their original node instance ID. Graphs live in the same private, expiring S3 results as their definitions; owner checks and signed result URLs remain in force.
3. The browser draws the saved topology. Selecting a component highlights its immediate connections and exposes port descriptions. Search finds names, nicknames and saved panel text. Pan, cursor-centred zoom, fit, keyboard navigation and two-pointer touch navigation run locally.
4. A selected slider/toggle shares state with the existing control panel. Changing a value does not enqueue work. **Update geometry** remains the explicit metered solve action. View switching keeps both the graph and model mounted; hidden 3D views skip rendering.

The graphic system uses ToolWorksLab's charcoal chrome, cream surface, monospace labels and magenta controls. The canvas adds a pale green grid, compact Grasshopper capsules, labelled side ports, curved wires, green selection, yellow panels and saved group colours. These are deliberate visual cues, not a claim of affiliation with McNeel.

## Scope and limits

- This release views topology; it does not add, remove, reposition or rewire components. Parameters can be changed through the existing controls.
- Saved archive metadata is shown, not per-component runtime data trees, live panel outputs or evaluation diagnostics. Wires do not claim a single/list/tree structure without runtime evidence.
- Existing component allowlist, script/plugin/cluster exclusions and quotas still apply. Maximum 500 objects, 128 ports per direction per node and 10,000 wires; display text and coordinates are bounded. Unresolved archive wire endpoints are reported in Canvas notes instead of guessed.
- Older prepared results lack graph metadata; re-upload the definition to obtain the canvas. Standard prepare and solve allowances apply to that upload. Viewing an already loaded canvas uses no additional geometry run.
- Development-only `/design/canvas` uses a real saved archive and Compute geometry fixture; it returns 404 in production.

## Verification

Run `npm test` and `dotnet run --project tests/GraphReader/GraphReader.Tests.csproj -- worker/examples/parametric-sphere.ghx`. Archive tests cover original layout, groups, exact port IDs, floating parameters, alternate parameter storage, disabled flags, inert text, bounded coordinates and unresolved wires. Browser checks cover selection/search, slider synchronization, keyboard navigation, view switching and geometry preservation. The Linux bridge was tested with both `.ghx` and binary `.gh`, then the prepared example was solved through Rhino Compute.
