# Review — persistent-compatibility-badge-refresh (round 02)

Branch: `feat/persistent-compatibility-badge-refresh`
Reviewed against: `docs/plans/2026-08-31_persistent-compatibility-badge-refresh.md`

## Verdict

Changes are still required. The constructor-safe AppOverview replacement, the
read-only lifecycle fallback, and the mounted-grid rewrap changes resolve the
round-01 code findings. The reported cross-context blocker is not valid.

SharedJSContext has a direct SteamUI bridge to the mounted Big Picture browser:
`SteamUIStore.m_WindowStore.GamepadUIMainWindowInstance.m_BrowserWindow`.
Live review from SharedJSContext found its document at
`/routes/library/home`, 34 `[data-id]` cards, a card React fiber, an
`m_refGrid` ancestor at depth 11, and the current `VBC_` plus
`fnOnFocusedColumnChange` fingerprint at depth 13. The repository already uses
the same bridge in `src/steam/appLinks.ts:79-89`.

## Gate status

- Local quality gate: PASS (26 Vitest files, 370 tests, and pytest passed).
- Round-01 constructor and renderer replacement regressions: PASS.
- Steam Deck reachability and required runtime objects: PASS.
- Required badge behavior after hard reload and over time: NOT VERIFIED.
- Negative controls and complete no-launch smoke: NOT VERIFIED.

## Required changes

1. Update `steamUiCardDocument()` to use the established SteamUI browser-window
   bridge. Prefer `MainWindowInstance.m_BrowserWindow.document`, with the
   `GamepadUIMainWindowInstance` path as the compatible fallback. Keep the
   existing fail-closed document checks. Do not add navigation, focus, tab, or
   route-replacement behavior.
2. Add a focused regression test for the actual runtime boundary:
   SharedJSContext/global, parent, and top have no cards, but
   `m_BrowserWindow.document` has the mounted Home card and its React fiber.
   Prove that a compatibility revision finds the grid, replaces its stale
   renderer, recomputes it, and adds the compatibility slot. Prove teardown
   restores the native renderer.
3. Deploy the corrected feature build and complete the plan's live checks:
   SharedJSContext hard reload; Home badge before any detail navigation; Home
   and Library grid badges after at least two minutes and after native
   AppOverview replacement; no badges for official, unmatched, missing,
   unresolved, and Unknown cases; and the no-launch live smoke set.
4. Replace the blocker conclusion in the session record with the implemented
   bridge and exact validation results. Record command results and evidence
   paths. Do not claim a passing check when fixture drift or another failure
   prevents it.

STATUS: CHANGES_REQUESTED
