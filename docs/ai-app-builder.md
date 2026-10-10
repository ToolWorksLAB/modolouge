# AI app builder

Implemented 2026-10-10. This replaces manual-first authoring with upload → brief → draft → try/refine → publish. Model and advanced layout tools remain available. “Publish” means a shareable `/a/[slug]` URL, not an installable application.

## Product contract

- A file is prepared by the existing reviewed-component policy. Scripts, clusters and unreviewed plugins remain unsupported. AI cannot make them compatible.
- The model reads saved controls, node labels, descriptions, bounded panel text, groups, ports and connections through two read-only tools. It does not receive the binary archive, credentials or geometry. This is metadata interpretation, not full code comprehension.
- The output is a validated blueprint, never executable JavaScript or arbitrary HTML. All controls must bind to real exposed inputs; duplicates and invented bindings are rejected. Missing inputs remain in the final step with a warning.
- A small definition should stay one step. Larger definitions can use up to six task-based steps. Back/Next retains values. Steps are UI organization, not independent Grasshopper solutions. Update runs the entire definition once.
- Users can edit titles, descriptions, labels, help text, step membership, surface, accent and layout. AI refinements start from a saved revision. Concurrent edits cannot silently overwrite each other.
- Publishing requires a verified member and explicit public-sharing confirmation. Public pages omit the graph, private brief, AI reasoning and source archive. Default control values and output geometry are public. Unpublish blocks new submissions; accepted jobs may finish. Editing a draft does not mutate a published snapshot.

## Architecture

`components/AIStudio.jsx` authors the blueprint. `AIAppRunner.jsx` renders it in the editor and public app. `lib/ai-blueprint.js` owns validation and bounded model context. `lib/ai-builder.js` uses AI SDK 7 `ToolLoopAgent`, structured output and Vercel AI Gateway with `openai/gpt-5.4-mini`. It permits at most three model calls, 6,000 output tokens per call and a 100-second generation timeout.

`lib/ai-apps.js` saves private archives to Supabase Storage bucket `modolouge-apps`. Approved archive bytes come from the worker's `prepared/` S3 objects, never client-submitted JSON. Supabase retains the archive after the original 24-hour definition expires. On reopen/run it restores a temporary copy under AWS `uploads/` and a one-day DynamoDB definition record. No worker code change is required. The Vercel app role has the additional scoped permission `s3:GetObject` on `prepared/*`; its existing `uploads/*` write permission is reused.

Private `modolouge_apps` rows hold drafts and revisions. `modolouge_publications` holds the reviewed snapshot, an unguessable slug, active flag and private archive pointer. Only the server reads these tables: RLS is enabled and anon/authenticated grants are revoked. Every owner operation checks the verified server session or its linked guest ownership. A visitor can submit only an active server-resolved publication; supplying a definition ID does not grant access. Existing visitor/account/global compute limits apply, plus 60 accepted publication attempts per app per rolling day.

## AI billing and operations

- Vercel OIDC authenticates the Gateway. No API key belongs in the browser or repository. Local OIDC tokens can be obtained with a project-scoped `vercel env pull`; local AWS access is deliberately denied by the production-only AWS trust policy.
- Gateway requires a valid card before free credits can be used. The initial live test on 2026-10-10 returned HTTP 403 requiring card verification; balance was zero. Provider activation must be verified before claiming live AI generation works. No Pro upgrade or auto-top-up was configured.
- A credit preflight avoids consuming the visitor's free draft while the provider is inactive.
- The manager's AI section records every reserved request, model, input/output/cache/reasoning tokens, duration, status, generation IDs, per-request IP and approximate location. Per-person and monthly sums query all ledger rows; the recent request table is limited to 100.
- Reported cost uses Gateway generation info. Where unavailable, a labeled estimate uses the checked mini catalog rates: $0.75/M input, $0.075/M cached input and $4.50/M output. Reasoning is already included in output. Missing usage after an interrupted/failed request keeps a reservation and is never presented as free.
- One global SQL row serializes reservations. Default daily UTC cap is $5, with $0.30 reserved per generation. Members have 10 attempts/day; guests one/day and one per network in 30 days. No new generation starts while the same actor has a request active for under three minutes. Context and output bounds are part of the reserve calculation; revisit it before changing the model, tools, prices or limits.
- Manager can pause new AI calls and change the daily cap ($0–$100). Compute shutdown also pauses AI. Re-enabling compute does not silently re-enable AI: use Enable AI drafting. In-flight calls can finish. These controls do not remove fixed storage/hosting costs.
- Full request IPs are pruned after 30 days; AI ledger rows after 13 months. Archives remain until deletion is requested. There is a 20-app creation cap per actor. Archive deletion/self-service account deletion is not included in this release.

## Maintenance and verification

Apply the two `ai_app_builder` and `ai_request_connection_retention` migrations before deploying. They are additive and were applied to the ToolWorksLab project `nkifgvjtfwsojchttdvk`. Never apply to Plantar3D. The app and manager repositories deploy separately to their existing company Vercel projects.

Run `npm test` and `npm run build` with Node 24. Unit tests cover blueprint bindings, context limits, token aggregation, private ownership, publication confirmation, public-data filtering and blocked publishers. Transactional live SQL checks verify budget rejection, concurrent-actor rejection and revoked client privileges. Browser fixture `/design/ai` exercises authoring and step navigation using simulated responses and saved geometry; it returns 404 outside development. Fixture success is not evidence of a live LLM response.

Release smoke test: normal guest upload/prepare → AI draft → review binding coverage → run geometry → verify account → publish → visit as another actor → run with changed input → reopen after the temporary definition expires → unpublish → reject new visitor submissions. Check ledger totals against Gateway generation IDs and manager totals. Also check unauthenticated manager access, foreign-origin POST rejection and cross-owner archive rejection.

Future work should follow observed usage: richer read-only analysis of unsupported archives, design-specific component presentation, output cards, a truly versioned public-app library, safe staged solving where the actual graph supports it, richer model evaluations and ledger reconciliation for delayed Gateway costs. MCP is not necessary for the internal graph tools; exposing them to other clients can be a separate authenticated MCP adapter later.
