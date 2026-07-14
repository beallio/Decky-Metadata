# Review — controller-layout-displayed-shortcut-search-isolation (round 02)

Branch: `feat/controller-layout-displayed-shortcut-search-isolation`
Reviewed against: `docs/plans/2026-07-14_controller-layout-displayed-shortcut-search-isolation.md`

## Verdict

Review round 01 is resolved and all independent local gates pass. The first
explicitly approved no-launch Deck run deployed commit `a050a6c`, hard-reloaded
SteamUI, and exposed one current-SteamUI compatibility defect in the test probe
before it could issue controller queries. Production controller targets remain
available and no plugin breaker/error signature appeared.

## Gate status

- Independent focused Vitest after round 01: 96 tests passed.
- Independent full quality gate after round 01: 149 Vitest tests plus complete
  build/TypeScript/Python/version/review-note checks passed.
- Read-only Deck status and log audit: reachable; `fatal: false`; no known or
  unknown error groups.
- Approved `scripts/decky verify-change dev --device --explain` deployed and
  hard-reloaded the feature bundle. Re-render and Community smokes passed; no
  game launched.
- The generic quick-links smoke failed to find a row for auto-selected listed
  fixture `2312439508`; this is outside the controller-layout change and must not
  expand this task.
- Controller smoke stopped before any query with
  `Error: controller list unavailable`; diagnostic bundle:
  `/tmp/Decky-Metadata/diagnostics/20260714T200550Z`.
- Read-only CDP evidence after the reload shows lowercase
  `globalThis.controllerStore` is undefined, while capitalized
  `globalThis.ControllerStore.GetControllers()` exists and reports one
  controller (`nControllerIndex: 15`, `eControllerType: 4`).

## Required changes

1. Update `scripts/deck/js/check_controller_layouts.js` to resolve the controller
   list store defensively from the currently observed capitalized
   `globalThis.ControllerStore` and the legacy lowercase
   `globalThis.controllerStore`. Use one local reference, validate
   `GetControllers` before calling it, and preserve the existing bounded failure
   if neither contract is available. Do not enumerate either store and do not
   add discovery via React trees, MobX instances, or webpack module scans.
2. Update `tests/test_deck_fixture_selection.py` so the static verifier contract
   requires both supported global spellings and the bounded fallback. Preserve
   every forbidden-operation assertion and all privacy constraints.
3. Update the session record with the accurate outside-sandbox Deck status, the
   approved deployment/reload, passed smokes, the unrelated quick-links failure,
   the pre-query controller-probe failure, sanitized capitalized-store evidence,
   diagnostic path, and the fact that no controller query or game launch
   occurred. Replace the earlier blanket offline conclusion; do not claim the
   controller fix is live-verified yet.
4. Regenerate the bundle only if production source changes (none are expected),
   rerun focused/static/full local gates, commit this review note and correction,
   and recreate the round-complete marker. Do not access or modify the Deck in
   this correction round; the targeted controller smoke remains separately
   approval-gated.

STATUS: CHANGES_REQUESTED
