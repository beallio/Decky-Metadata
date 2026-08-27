# Review — controller-type-filtering (round 01)

Branch: `feat/controller-type-filtering`
Reviewed against: `docs/plans/2026-08-26_controller-type-filtering.md`

## Verdict

Changes are required before this branch can be integrated. The core type-102
source-query policy works on the tested Legion Go S, but one cache transition
can remove those layouts again, several defensive/test contracts from the plan
are incomplete, the Legion screenshot does not show the new row, and the
mandatory Steam Deck regression verification has not been completed.

## Gate status

- Reviewed commit: `9c204fca0e1de63b24c3c2aa3f7350f34c0af749`.
- Reviewer reran `scripts/orchestration/run-quality-gates`: TypeScript/build,
  19 Vitest files with 219 tests, Python byte-compilation, and 400 pytest tests
  passed; final output was `quality-gates: OK`.
- `scripts/orchestration/check-review-notes-not-deleted` passed and the feature
  worktree remained clean after the gate.
- Legion Go S evidence proves type `102`, visible filter `true`, and nine matched
  Community layouts. The DOM capture contains the new controller row.
- Steam Deck verification is incomplete because `steamdeck` currently reports
  offline/no route to host. This is a blocking plan item, not an approved
  deferral.

## Required changes

1. **Invalidate a supplemental key after a native source query.**
   `src/steam/controllerLayouts.ts` currently leaves the stored effective
   source key (`false` for type `102`) intact when that source appid is queried
   natively with Steam's visible filter (`true`). Steam overwrites the shared
   cache with the filtered result; returning to the shortcut then sees an
   existing cache plus the stale matching key and skips the required unfiltered
   source query. Invalidate/update the tracked key and supplemental
   classification when a native query targets a known source. Add the explicit
   affected-shortcut -> same native source -> affected-shortcut test and require
   the final shortcut visit to requery the source with `false`. Preserve Search
   isolation and the unaffected/native contracts.

2. **Make controller-store reads fully conservative.**
   `getConnectedControllerTypes` lacks the outer failure guard used by
   `controllerTypeForIndex`; throwing accessors/proxies for `ControllerStore`,
   `GetControllers`, or record fields can escape the mount effect instead of
   rendering `Unknown`. Catch discovery and record-property failures and return
   `[]`. Expand `src/steam/controllerTypes.test.ts` with valid numeric controller
   indexes whose types are string, fractional, negative, and throwing
   properties, plus throwing store/property access. The tests must prove these
   malformed boundaries return `null`/`[]` rather than throw.

3. **Validate and discriminate the new probe diagnostics.**
   In `scripts/deck/js/check_controller_layouts.js`, safely read and require an
   integer `eControllerType` and boolean
   `m_bFilterOtherControllerTypes` before serialization; malformed values must
   hard-fail rather than serialize arbitrary/unbounded boundary objects.
   Strengthen `tests/test_deck_fixture_selection.py`: searching the whole source
   for the identifier names is not discriminating because those names also
   occur before the returned object. Assert that both diagnostics are fields of
   the root serialized payload (or execute and parse the probe) so deleting
   either returned field makes the test fail.

4. **Complete the README contract.**
   The plan requires a user-facing statement that compatible matched-game
   layouts remain available on Legion Go S while Steam's normal visible
   controller-type filter remains enabled. `README.md` currently only describes
   the diagnostic row and says layouts are “expected” to appear. Add the
   promised behavior to the controller-layout section without implying every
   controller type receives the workaround.

5. **Recapture the Legion visual evidence.**
   `/tmp/Decky-Metadata/controller-type-filtering/legos-versions.png` stops at
   the `VERSIONS` heading and does not show any value or the new controller row.
   Scroll the QAM panel until
   `Controller Types: Legion Go S (102)` is visibly rendered, recapture the
   screenshot, and update the session record to name that proof. Keep the DOM
   assertion and focus evidence.

6. **Complete every mandatory Steam Deck check before marking the round
   finished.** Once `steamdeck` is reachable, capture the pre-deploy controller
   and layout baseline while the old bundle is still installed, deploy through
   the committed tooling, then run the post-deploy probe, exact Community
   URL-hash comparison, `run_all.sh --no-launch`, QAM DOM assertion and
   screenshot with `Controller Types: Steam Deck (4)` visible, and initial-focus
   plus one-D-pad-step checks. Record actual artifact paths and PASS/FAIL output
   in the session log. Do not replace this with the earlier planning-session
   observation, infer success from type-102 tests, or mark the round complete
   while the session log still says this work is unverified.

7. Rerun the focused tests, both required mutation checks, the full project
   quality gate, and review-note deletion check after the corrections. Update
   the durable session log with actual tallies, cache-transition regression
   coverage, device results, and any genuinely unverified plan exclusions.

STATUS: CHANGES_REQUESTED
