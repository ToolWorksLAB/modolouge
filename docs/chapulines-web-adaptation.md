# Chapulines → Modolouge application studio

Reviewed 4 October 2026, against Chapulines source at commit `a86dbe1` and its published verification examples. This is a browser adaptation of the editor's workflow, not a binary port of Rhino.Inside or its Windows compiler.

## Inventory: 17 current toolbox elements

The authoritative inventory is `src/Chapulines.App/MainForm.DesignerExperience.cs`: five layout/content elements, nine inputs, three outputs. Four older containers (Panel, GroupBox, FlowLayout and TableLayout) remain deserializable; they are not additional current toolbox entries. Experimental instrument playgrounds are also excluded from this count.

| Desktop element | Web implementation |
|---|---|
| Section | Titled container with padding and gap |
| Stack | Vertical flow or horizontal wrapping |
| Grid | One to three columns, equal or 1:2 / 2:1 proportions, responsive stacking |
| Text | Plain text and heading styles; no HTML execution |
| Image | Embedded PNG/JPEG/WebP, description and contain/cover |
| Grasshopper Slider | Number input/range bound by stable Grasshopper instance ID |
| Viewport interaction | **Native binding pending.** Browser orbit/pan/zoom work in the viewport; point/plane gumballs do not |
| Button | **Adapted:** explicit Update geometry action, not a native momentary Boolean input |
| Toggle | Native Boolean Toggle input, including its original initial value |
| Moving ruler | Drag numeric values, Shift for fine movement, arrow keys and exact numeric entry |
| Point slider | **Native binding pending.** The desktop MD Slider's domains and Z/mode are not approximated with unrelated controls |
| Graph mapper | **Native binding pending.** Editing the actual Bezier GraphMapper needs a specialized solver binding |
| Text input | Unwired Panel text. Wired Panels remain outputs |
| File / folder path | **Adapted to File content:** text/CSV/JSON content ≤10 KB into a Panel. No Windows path or server filesystem access |
| Rhino Viewport | Three.js geometry view with orbit, pan, fit, wireframe and image export; up to three views per layout |
| Value display | Current input or latest solved text/numeric/Boolean output |
| Quick graph | Latest solved numeric list, including numeric Panel text; ordered branches, invalid gaps, negative/constant/single-item handling |

That gives **14 usable web elements and 3 explicitly marked native bindings pending**. The existing read-only Grasshopper node/wire canvas remains in Explore definition.

## Layout techniques carried across

- Toolbox → application canvas → Layers / Inspector, with a distinct Run preview.
- Nested containers own their children's placement. CSS grid/flex replace WinForms pixel bounds, docking and DPI calculations.
- Container changes preserve children. Grid columns collapse at narrow artboard sizes. Horizontal stacks wrap at their minimum basis.
- Drag from toolbox; move an existing element using its header; insert between siblings or append inside a group. Parent selection and Up/Down provide keyboard alternatives.
- Stable element IDs, reparenting cycle checks, depth/element limits, hide/lock, duplicate, bounded undo/redo history.
- Minimum-height drag handle commits one undo step at pointer release; pointer cancellation restores the previous size. Exact sizing is also available in the Inspector.
- Independent Wide / Tablet / Phone artboards; Paper and Graphite surfaces inside the charcoal and magenta ToolWorksLab shell.

Desktop multi-selection, group bounding-box scaling, editable column dividers, guides/snapping and Windows application compilation are not implemented in this release. Account saves are private editable layouts, not published standalone application URLs. `.chapulines` files embed native definition/binding state and cannot be imported as runnable web applications; rebuild their presentation in the studio and load a compatible `.gh` / `.ghx` file.

## Runtime and persistence

Layout editing and camera navigation never submit solve jobs. Preview controls update the same values as Explore; Update geometry is explicit and uses the existing queue, authorization, usage accounting and trial limits. Uploading a new definition still performs its normal initial solve.

Controls bind by Grasshopper instance GUID. Importing a layout against a different definition shows a mismatch note; missing or mismatched inputs remain unbound until explicitly reconnected. Uploaded Grasshopper files still expire after 24 hours; saved layouts do not contain or extend these files.

Device drafts use versioned browser storage. Export/import uses validated `.modolouge.json` presentation files. Verified accounts can save 20 private slots to `modolouge_designs` in the existing ToolWorksLab Supabase project. Routes obtain ownership from current verified Auth and use revision checks to prevent stale overwrites. The table has RLS enabled and no browser-role grants or policies, intentionally denying direct Data API access. Server credentials remain server-side.

Layout bounds: 150 elements, eight nesting levels, three viewports, 900 KB payload, raster images ≤250 KB each. Initial layouts generate at most 100 controls; all available definition controls remain selectable as bindings. Outputs are capped at 200 named output trees, 2,000 primitive items per output, 10,000 total items and 100,000 text characters. Raw geometry/object payloads are never passed to readouts. Definition geometry limits still apply separately.

## Linux compatibility and security

The bridge reads GH archives using GH_IO and validates reviewed component GUIDs before Compute. Panel support was reviewed against `GH_Panel` and `GH_PanelProperties`, including serialization and solve paths. Panels can stream to disk in desktop Grasshopper, so archives with enabled `Stream` or nonempty `StreamPath` are rejected before any solve. The public component allowlist remains enforced; scripts, clusters and native Chapulines binding plugins are not enabled.

The existing Supabase leaked-password-protection advisory predates this change; this product's normal sign-in uses email codes. The new table's no-policy informational advisory is intentional for server-only access ([Supabase guidance](https://supabase.com/docs/guides/database/postgres/row-level-security)).

## Source study

The adaptation was informed by the desktop Core `DesignerProject` / `CompiledFormDesign` models, `MainForm.DesignerExperience`, section builder, project loading, and the documents `UX-REVIEW`, `FINAL-INSTRUMENTS`, `DATA-ELEMENTS`, `MULTI-SELECTION`, `GROUP-SCALING`, `EDGE-RESIZE`, `CANVAS-MOTION`, `SECTION-INSERTION` and `SECTION-COMPRESSION`. Published Designer, DataElements and SectionBuilder screenshots were inspected to compare hierarchy and proportions. No client Grasshopper files, private images or desktop source were copied into this public repository.
