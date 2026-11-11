# Agent streamlining: 11 November 2026

The observed failed sphere turn spent about 157 seconds across 14 model steps,
including eight serial component searches. Its repaired 44-edit candidate solved
in 413 ms. This case identifies discovery/orchestration and failed validation as
useful optimization targets; it does not establish general Compute latency.

## First implementation

- `search_component_set` accepts one to eight precise queries, returns up to three
  typed matches per distinct query, and returns shared helpers once. Existing
  single-query search remains available for ambiguous or missing matches.
- The agent is instructed to batch discovery and reuse metadata rather than spend
  a separate model step on each helper component.
- Expression preflight mirrors the native closed arithmetic grammar. Unsupported
  expressions return edit/node/input context and correction guidance before
  archive restoration, queue submission or Compute test consumption. It does not
  evaluate expressions or replace the authoritative worker policy. A failed
  preflight invalidates success for the current request but retains the prior
  candidate without applying the invalid edits.
- AI budget errors distinguish AI spending from remaining Compute jobs, explain
  the UTC reset, and identify administrator reservation review as a recovery path.
  Budget amounts and reservation/account limits are unchanged.

## Verification boundary

73 Node tests and the Next.js production build passed. The actual SDK tool loop is
tested with a mock language model, including batched discovery and typed results.
Graph-session tests verify zero restore/submission/attempt consumption on failed
preflight and successful correction. This is not a live-model latency benchmark
or evidence that the model will always choose the new tool. No worker or database
schema changes are required for this release.

The previous production queue regression and satellite parameter sweep are
documented in `component-authoring-and-benchmark.md`. They cover the worker fix;
they do not measure these new agent orchestration changes.

## Next work, not implemented here

1. Idempotent settlement of fully accounted terminal AI requests, retaining
   uncertain timeout exposure and auditing every release. The specific failed
   14-step request was repaired manually; general settlement remains unfinished.
2. Separate visible AI availability and Compute allowances, reset time in the
   user's locale, and actionable recovery before submitting a prompt.
3. Tested construction recipes for sphere, population, noise and dimensions;
   preserve general graph composition and validate parameter semantics.
4. Broader preflight for IDs, ports, references and cycles with native parity
   tests, then a mandatory production-queue release regression for worker edits.
5. Simpler phase-level progress with expandable technical evidence and a retained
   last valid preview. No fabricated completion or automatic publication.
6. Semantic review of the remaining benchmark cases before reporting success.

Compare identical briefs/files/model/runtime versions in at least five repeated
runs per case. Record median/p95 first valid preview time, model steps, discovery
calls, tokens/cost, queue wait, solve/tessellation time, retry and semantic success
rates. One batched discovery call for up to eight concepts and zero submissions
for preflight-rejected expressions are design targets. End-to-end speed gains
remain unmeasured.

The detailed project plan and incident evidence live in the project's Notion
Status, decisions & roadmap and AI app builder pages.
