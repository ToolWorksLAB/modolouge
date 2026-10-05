# A shorter path from Grasshopper to a usable app

5 October 2026. This is a heuristic review of the shipped interface and proposed task flows, not a user study. The product owner chose to serve both authors and people unfamiliar with Grasshopper, with optional editing tools.

## Stories and decisions

| Story | Previous friction | New path | Acceptance |
|---|---|---|---|
| I have a definition and want to see it | Empty parameters, node graph, viewport, mode switches and trial messaging compete before upload | One prominent file drop; first successful solve opens the model with its controls | No editor knowledge or sign-in needed within the trial |
| I am curious and have no file | An example is buried inside the editor | Try an example beside the file action; an explicitly browser-only form study is available immediately | Service availability and run cost are visible before choosing a cloud example |
| I want to change the result | Every click offers another solve; the picture gives no indication of unapplied values | Change several controls, see a pending-change count, then Update model once | No solve on drag; no duplicate solve when values match the last successful result; retry remains possible after failure |
| I want an app for someone else | Fourteen tools, nesting and binding require a layout lesson | Customize the generated interface: name, heading, theme, arrangement and visible controls; Preview checks the result | Existing bindings and children survive layout presets; full layout editor remains available |
| I know Grasshopper and need to inspect logic | Split canvas is the default for everyone | Geometry first; Grasshopper and Split view are explicit options | Graph and geometry use the same values |
| I want to save what I made | Save triggers sign-in, then profile, occupation, intent and a welcome screen; original action is lost | Email → code → return to the pending save or saved-layout list | No automatic paid solve after sign-in; model and layout stay in memory |
| I am returning to a saved layout | Library is buried in the toolbox and the missing GH file is confusing | Saved layouts at the workspace entrance; open layout, then choose its matching GH file directly | Transferred layout survives definition loading; account ownership and conflict checks remain enforced |
| Something fails or compute is offline | Disabled controls and a generic error appear far from the action | State and error are next to the current action, with retry; exploration and layout editing remain possible | Failed replacement leaves the previous working model available; trials and access checks remain enforced |

## Alternatives considered

1. A mandatory multi-step wizard: clear at first, but becomes a repeated tax for experienced users and makes backtracking awkward.
2. A full desktop-style editor from the start: flexible, but exposes implementation concepts before the user has an outcome.
3. **Chosen: progressive disclosure around a working model.** Open and explore first; customize when useful; advanced layout tools on demand. No tutorial must be completed.

## Product boundaries

Cloud examples and uploaded definitions still use the real Linux worker and existing metering. The home-page form study is labeled as an illustration running locally in the browser. Saved layouts remain private presentation documents; they do not retain GH uploads beyond their existing expiry and are not public standalone app links. Native Chapulines bindings remain outside this release.

## How to evaluate this with people

Ask a first-time explorer to open the example and change one dimension; ask an author to open a GH file, hide a control, change the app heading and save; ask a returning author to reopen a layout and reconnect its file. Observe time to first geometry, unnecessary solves, mistaken mode switches, success without help and whether they understand what is saved. This release verifies behavior and accessibility in the browser; it does not claim measured improvement in human task time.

## Verification for this release

- 35 automated tests pass, covering existing authorization and metering boundaries plus unapplied/reverted values and preservation of bindings, children, visibility and locks under arrangement presets. Production build passes.
- Browser walkthrough: example → geometry-first workspace → one pending edit → update → up-to-date state → quick customization → heading/arrangement/visibility changes → optional Grasshopper canvas and full layout editor.
- An isolated development fixture verifies email → code → pending save, email → code → library, opening a saved layout, reconnecting its file without losing the layout, and updating its existing save. Authentication and storage in this fixture are simulated; it sends no emails and makes no cloud calls. It is unavailable in production.
- That walkthrough caught an old-account save reference being reused for a fresh layout. A persistent fresh-draft marker now prevents that fallback until an explicit save or library selection establishes a reference.
- Phone checks verify geometry appears before the controls, customization offers settings with a separate Preview, and neither view overflows horizontally. The Grasshopper canvas loads only when requested.
- These changes do not alter the compute worker, database schema, authentication verification, account ownership rules or trial limits.
