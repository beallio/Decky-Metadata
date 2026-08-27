# Review — controller-type-filtering (round 02)

Branch: `feat/controller-type-filtering`
Reviewed against: `docs/plans/2026-08-26_controller-type-filtering.md`

## Verdict

The round-01 source, test, probe, and README findings are resolved and the
corrected branch passes the full quality gate. Integration is still blocked
solely by the mandatory hardware evidence: neither configured device is
currently reachable, so the Steam Deck regression matrix and the corrected
Legion visual/deployment checks remain incomplete.

## Gate status

- Reviewed commit: `ffd9ee5db84c9c8cc4f5425a0bebbd6487ed9f8c`.
- The native-source cache transition now invalidates the supplemental key and
  has explicit type-102 regression coverage.
- Controller boundary access and malformed types are fail-conservative with
  discriminating tests; probe scalar validation/serialization tests and the
  required README behavior statement are present.
- Reviewer reran `scripts/orchestration/run-quality-gates`: 19 Vitest files /
  225 tests, 400 pytest tests, TypeScript/build, and Python byte-compilation all
  passed; final output was `quality-gates: OK`. Review notes were intact and the
  tree stayed clean.
- Reviewer reran both device doctors. `steamdeck` and `steamdeck-legos` each
  reported `deck-reachability: Optional Deck is offline`.

## Required changes

1. When `steamdeck` is reachable, complete the plan's full type-4 sequence:
   pre-deploy controller/layout baseline on the old installed bundle, explicit
   deployment of the corrected bundle, post-deploy probe, exact Community
   URL-hash comparison, `run_all.sh --no-launch`, QAM DOM assertion and
   screenshot with `Controller Types: Steam Deck (4)` visible, and initial
   focus plus one D-pad move.
2. When `steamdeck-legos` is reachable, deploy the corrected round-01 bundle,
   rerun the explicit type-102 Deadpool probe (including native/source-return
   isolation), recapture the DOM text, and replace the screenshot with one that
   visibly contains `Controller Types: Legion Go S (102)`. Preserve the focus
   evidence and do not use the stale Assassin's Creed fixture.
3. Update the durable session record with the actual new artifact paths,
   commands, PASS/FAIL output, and final hardware status. Remove the statements
   that the round is incomplete only after every named check genuinely passes.
4. Rerun the focused tests and full quality/review-note gates after any changes,
   commit the evidence record and generated bundle if deployment rebuilds it,
   then recreate the round-complete marker. Do not mark the round complete while
   either required device sequence remains unverified.

STATUS: CHANGES_REQUESTED
