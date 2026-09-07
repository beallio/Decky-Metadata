# Review — clear-removed-activity-news (round 01)

Branch: `feat/clear-removed-activity-news`
Reviewed against: `docs/plans/2026-09-07_clear-removed-activity-news.md`

## Verdict

Reviewed commit `07ad748fd5e208feb984dcab01fbd445f7477316`.
The runtime fix is small and matches the plan. Live removal evidence shows the
old news disappears without reload. Request a test-only revision: two required
behaviors currently have no effective regression protection. Do not expand the
runtime fix, add dependencies, or change backend behavior.

## Gate status

- Quality-gate log: 27 frontend files, 432 tests passed; Rollup, Python checks,
  pytest, and review-note integrity passed.
- Non-launch Deck suite passed, including zero re-render cache writes.
- Live Remove → Save → Done and reopen showed Steam's empty-Activity message.
  Another shortcut retained news. Final stored settings exactly matched the
  pre-test backup; idle-state snapshots contained no running games.
- The game-launch check remains excluded by the user's instruction.
- Review mutation probe:
  `/tmp/Decky-Metadata/issue3-review-mutation.config.mjs`.
  This transforms source only in the test process; repository source is unchanged.
  Both commands incorrectly pass all 32 focused tests:

  ```bash
  ISSUE3_REVIEW_MUTATION=refresh ./run.sh npm test -- --config /tmp/Decky-Metadata/issue3-review-mutation.config.mjs src/steam/activity.test.ts src/steam/metadataPatch.test.ts
  ISSUE3_REVIEW_MUTATION=ownership ./run.sh npm test -- --config /tmp/Decky-Metadata/issue3-review-mutation.config.mjs src/steam/activity.test.ts src/steam/metadataPatch.test.ts
  ```

  The first mutation omits both clear calls in
  `refreshDeckyNativeActivityForApp`. The second changes the clear helper's
  ownership guard from `stored?.__deckyNativeActivity` to `stored`.

## Required changes

1. In `src/steam/activity.test.ts`, exercise empty/absent refresh independently.
   The existing test calls the patched getter before refresh, so the getter
   already removes the stale object. Seed an injected feed, remove/empty its
   metadata, call refresh first, and observe the original native getter's result
   before any patched getter can repair it. Reseed for each transition. The
   `refresh` mutation above must then fail.
2. Prove the ownership guard preserves genuine native Activity stored for the
   same target app being cleared. Preserving an official Steam game's unrelated
   key does not test that guard. Exercise the existing removal/refresh boundary
   with an unmarked native value at the target key and require that same native
   value to remain observable. The `ownership` mutation must then fail.
3. Tighten the existing positive controls rather than adding a large suite:
   assert returned news identity/content for the original, other, and restored
   feeds, not just `__deckyNativeActivity: true`. Avoid new assertions on private
   cache membership or helper call counts. The metadata-application test may
   observe the unpatched native getter instead of reading the map directly.

Keep changes limited to the existing test files and the session record.
Run the focused tests with each mutation (expected failure), then without
mutation (expected pass), and run the normal quality gate. Record actual counts.
No repeated device mutation is needed for a test-only revision: cite the existing
live evidence. Do not launch games. Do not modify or delete this review note;
it is committed by the orchestrator before resumption.

STATUS: CHANGES_REQUESTED
