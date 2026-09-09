# Review — compatibility-status-defaults (round 04)

Branch: `feat/compatibility-status-defaults`
Reviewed against: `docs/plans/2026-09-07_compatibility-status-defaults.md`

## Verdict

One test-quality correction is required before the local review can close.
Reviewed HEAD: `ea56407188f6cab4cb2cb0092c22d2cf61dfdd5d`.
The small focus guard is reasonable, but its new test asserts implementation
call counts instead of the focus behavior named by the test. Final live
acceptance and restoration are separately blocked by device connectivity.

## Gate status

- The latest local gate recorded 27 Vitest files / 458 tests plus the
  existing TypeScript/build/Python/version gates.
- Main delivered `0.3.14+cae8568` and confirmed the final GUI Install prompt.
  The Deck then became unreachable (`ssh`: No route to host). Installation
  completion/version, corrected focus behavior, final smoke suite, and
  restoration have not yet been verified. Do not describe them as passed.
- Main retains device ownership and is asking the user to restore access.
  No device actions are permitted in this implementer round.

## Required changes

### R1 — Remove the implementation-pinning focus test

`src/ContentPanel.updateSettings.test.tsx:271-301` names a focused dropdown
but never opens a menu or observes which control is focused. It manually
invokes the root ref with a stand-in object and asserts
`requestAnimationFrame` / `BTakeFocus` call counts.

The plan explicitly requires removing tests that pin implementation wiring
and proving controller focus on the actual surface. Delete this test
instead of re-pinning its expected call counts. Remove any mocks/imports
introduced only for that test and retain all meaningful existing settings,
save, failure, and lifecycle behavior tests. Do not replace it with another
mock-echo or source-text test merely to retain a test count. The real
select/cancel focus regression remains owned by Main's live validation.

Run the project gate after this test-only correction, record the actual
new test tally, commit, and mark the round complete. No production change
or new package is needed for deleting a test. Do not merge the feature.

### Record the current validation and restoration boundary

Update the session log with the known live evidence and blocker:

- Main's evidence root is
  `/tmp/Decky-Metadata/compat-defaults-live-4wys8ngy/`.
- Baseline file: `restricted/settings-before.json` (mode 0600).
- Last confirmed installed version was `0.3.14+4581c88`; final
  `0.3.14+cae8568` installation was initiated through the GUI but not
  confirmed after connectivity failed.
- Actual runtime checks passed for global inheritance, matched/unmatched
  Follow Valve, Valve Unknown, fixed Unsupported/Unknown, metadata removal,
  a late-added no-record shortcut, and unchanged regular Steam categories.
  Native grid screenshot shows a green check on a focused inheriting card.
- Temporary global setting is Unsupported (1). Modified per-game choices
  are Follow Valve for app IDs 2312439508, 3462906031, and 3015223078.
  Their original overrides were null, null, and 2 respectively.
- Disposable native shortcut ID 3168609012 is displayed as `true`.
  Its test metadata was already removed, but the native shortcut still
  needs removal. Global baseline was Automatic (key originally absent).
- Restore only changed fields/fixtures; do not overwrite unrelated updates
  by blindly replacing the whole saved-settings file. Verify the original
  shortcut set and compatibility values after restoration.

These items are outstanding obligations, not user-owned follow-up work.
Main will resume validation/restoration when connectivity returns. Local
round completion is not permission to integrate with these gates unresolved.

STATUS: CHANGES_REQUESTED
