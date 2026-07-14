# Review — matched-non-steam-controller-layouts (round 01)

Branch: `feat/matched-non-steam-controller-layouts`
Reviewed against: `docs/plans/2026-07-13_matched-non-steam-controller-layouts.md`

## Verdict

The implementation is structurally strong and the defensive adapter, circuit
breaker, one-time warning, transactional descriptor rollback, local-only
packaging, and read-only device tooling all match the plan. One policy defect
must be corrected before integration because it changes Steam's native shortcut
result instead of limiting modification to supplemental matched records.

## Gate status

- Fresh `scripts/orchestration/run-quality-gates`: PASS
- TypeScript/Rollup: PASS
- Vitest: 8 files, 85 tests passed
- Python/pytest and version drift: PASS
- `scripts/orchestration/check-review-notes-not-deleted`: PASS
- `git diff --check dev...HEAD`: PASS
- Working tree contains only the preserved pre-existing untracked
  `docs/review/2026-07-13_gpt-5_dev_thermo-nuclear-review.md`.
- Live verification remains explicitly authorized as
  `DEFERRED: awaiting user-installed bundle`; no Deck state was changed.

## Required changes

1. **Preserve every native base record exactly; deduplicate supplemental records
   only.** In `src/steam/controllerLayoutPolicy.ts:56-64`, the merge loop skips a
   later native record when its URL is already in `seen`. That rewrites Steam's
   native shortcut result, contrary to plan lines 244-259, which require native
   ordering to be preserved and explicitly say not to reject or rewrite the
   native base. Start the merged result as a full shallow copy of `nativeBase`
   (or always append every native record) while seeding `seen` from its valid
   URLs. Continue suppressing matched supplemental URLs that collide with any
   native or earlier supplemental URL.

   Update `src/steam/controllerLayoutPolicy.test.ts:50-64` so two native records
   with the same URL both remain in their original order, while the colliding
   supplemental record is omitted and the unique supplemental record is
   appended. Retain the frozen-input immutability checks and rerun focused tests
   plus the full quality gates.

STATUS: CHANGES_REQUESTED
