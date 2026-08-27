# Review — controller-layout-tab-preservation (round 03)

Branch: `feat/controller-layout-tab-preservation`
Reviewed against: `docs/plans/2026-08-26_controller-layout-tab-preservation.md`

## Verdict

The live feature behavior passed on both devices, but one production scoping
predicate is broader than the observed Steam IDs and the permanent verifier
still has completion, cleanup, and stale-evidence false-positive paths. The
durable session record also omits required commands/tunnel shutdown and reports
the wrong final test tally. Resolve these before integration.

## Gate status

- Reviewed commit: `5a4b522d632aa9dadcfc4ffd3243b8910e9fbe18`.
- Typed live smokes reached the intended shortcuts/controllers and showed
  Community retained at 52 rows on Legion type `102` and Steam Deck type `4`.
- Reviewer reran `scripts/orchestration/run-quality-gates` on the committed
  branch: TypeScript/build, 20 Vitest files / 253 tests, Python
  byte-compilation, and 400 pytest tests passed with `quality-gates: OK`.
- Worktree and review notes were clean/intact after the gate.

## Required changes

1. **Canonicalize only the observed generated tab prefix.**
   `tabSignature` currently accepts any id ending in `templates`, `community`,
   or `search`, so unrelated ids such as `mytemplates`, `notcommunity`, and
   `research` can satisfy chooser scope and mutate the real remembered key.
   Strip only Steam's observed generated prefix form (for example `«r7e»`) and
   then require exact semantic ids `Templates`, `Community`/`Community
   Layouts`, and `Search`. Add negative tests for misleading suffixes plus
   positive tests for multiple observed generated prefixes.

2. **Tie query completion to the requested result, not any cache mutation.**
   The current loop can stop on an unrelated/loading mutation because direct
   queries leave `BConfigurationQueryInFlight` false. Require the displayed
   cache/getter result to reach a query-specific stable state after mutation
   (bounded consecutive stable samples/quiet window and, for these explicit
   Show All fixtures, the expected expanded getter result) before returning.
   Then let the DOM settle. Add a test where an early unrelated in-place
   mutation occurs, remains briefly stable, and the real delayed result arrives;
   the probe must not return before the real result. Preserve the missing-update
   timeout test.

3. **Arm visible-filter cleanup before issuing the query.**
   The shell currently learns/arms `original_filter` only after the successful
   query payload is captured and parsed. If transport or parsing fails after the
   query leaves the filter false, the EXIT trap cannot restore it. Add a
   read-only pre-query phase that captures the original filter (or an equivalent
   reliable pre-query capture), validate it, and arm restoration before the
   direct query. Test that query transport/payload failure still restores the
   original filter and exits nonzero.

4. **Invalidate old evidence before the first probe.**
   Remove/create the target evidence path with a non-passing
   `started`/`pending` state before `dom-select`. A failure in dom-select, query,
   or dom-observe must never leave a prior `status: passed` artifact at the same
   path. Add a regression/mutation check for rerunning against an existing pass
   file followed by an early probe failure.

5. **Complete the durable audit record.**
   Record the exact final doctor/deploy/smoke/screenshot/run-all commands for
   both hosts, dedicated ports, and explicit final tunnel down/status results.
   Correct the final quality tally to 20 Vitest files / 253 tests and name the
   matching final log. Distinguish the dedicated passing smokes from the recorded
   unrelated stale/quick-link run-all failures without calling those suites
   passed.

6. Rerun focused tests, probe/shell syntax checks, required mutations, and the
   full gate after correction. Because both production scoping and the verifier
   change, redeploy to both available devices and rerun the typed smokes,
   screenshots, restoration checks, and no-launch captures. Update the session
   evidence, close both tunnels, commit the regenerated bundle/session record,
   and mark finished only after the final artifacts report the corrected commit.

STATUS: CHANGES_REQUESTED
