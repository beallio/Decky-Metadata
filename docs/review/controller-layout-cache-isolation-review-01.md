# Review — controller-layout-cache-isolation (round 01)

Branch: `feat/controller-layout-cache-isolation`
Reviewed against: `docs/plans/2026-07-14_controller-layout-cache-isolation.md`

## Verdict

The production implementation is narrowly scoped and the current gates pass,
but the defensive test matrix is incomplete in two plan-mandated failure paths.
These tests are release-blocking because this adapter runs against unstable
SteamUI internals and the accepted fallback is native UI, never an escaping
plugin exception.

## Gate status

- `scripts/orchestration/run-quality-gates`: PASS as recorded by the implementer
  (8 Vitest files / 104 tests plus the full TypeScript, build, Python, version,
  and review-note gates).
- `git diff --check dev...HEAD`: PASS.
- Working tree: clean for implementation output; the pre-existing untracked
  `docs/review/2026-07-13_gpt-5_dev_thermo-nuclear-review.md` remains untouched.
- Live Deck verification: correctly deferred as
  `DEFERRED: awaiting user-installed bundle`.

## Required changes

1. Add an adapter test that makes plugin-only Search filtering throw after the
   captured native `GetAllConfigs()` has returned successfully. Prove that the
   exact native value is returned, the native Search original ran once, the
   shared breaker trips once with section `search`, one warning is requested,
   and every later controller-layout wrapper is native-only. The plan explicitly
   requires coverage for both rejected Search shapes and thrown filtering work;
   the current malformed-result test covers only the first case.
2. Extend the failure-reporting/toast test so `reportFailure` throws as well as
   `notify`. Prove neither exception escapes, disabled state is already set,
   the secured native result is preserved, no native original is retried, and
   later calls remain pass-through. The current test injects only a throwing
   notifier, while the plan explicitly requires both logging/reporter and
   notifier failure injection.
3. Re-run the focused controller-layout suite and the complete orchestration
   quality gates, update the session log's final test count if it changes,
   commit the review note with the fixes, and recreate the round marker.

STATUS: CHANGES_REQUESTED
