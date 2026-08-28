# Review — non-steam-compatibility-status (round 05)

Branch: `feat/non-steam-compatibility-status`
Reviewed against: `docs/plans/2026-08-28_non-steam-compatibility-status.md`

## Verdict

The user has superseded the separate context-menu selector design. Compatibility
status must be part of the existing `Decky metadata...` editor as a native
dropdown. The revised committed plan at `33c20a2` is the source of truth for
this round.

## Gate status

- The persisted override, exact native identity guard, packed-bit application,
  baseline restoration, and safe refresh work remain in scope.
- The current installed package `0.3.9+307fe86` proves the prior modal design
  only and is now obsolete.
- The working tree was clean when the revised plan was committed.

## Required changes

1. Remove the separate `Compatibility status...` context-menu item. Restore the
   menu patch to one deduplicated `Decky metadata...` entry and keep its
   stale-App-ID and official-game guards.

2. Delete the compatibility modal component and modal-specific tests. Do not
   leave aliases, dead exports, modal focus code, or compatibility-menu keys.

3. Add a native Decky `DropdownItem` Compatibility status section to the
   metadata editor opened by `Decky metadata...`. The option order is
   Automatic, Verified, Playable, Unsupported, Unknown. Automatic displays the
   resolved Valve status when available, `null` is Automatic, and numeric `0`
   remains explicit Unknown.

4. Treat the dropdown as editor form state. The existing Save action must
   persist the complete record through `save_metadata`, update `metadataCache`,
   apply the effective compatibility category, and invoke the safe SteamUI
   refresh only after a successful save. A failed save must leave persisted,
   cached, and runtime compatibility unchanged.

5. Replace the modal/context-menu tests with focused editor/dropdown tests for
   option order, selected value, Automatic, explicit Unknown, save success,
   failed-save rollback, refresh, one menu entry, App-ID isolation, and
   official-game exclusion. Preserve all backend and packed-bit regression
   tests.

6. Update README and changelog wording to describe the dropdown inside the
   metadata editor, regenerate `dist/index.js`, run the complete quality gate,
   and update the session log with this user-directed cutover.

7. Build and deliver a new full package because both frontend and backend remain
   part of the feature. Stop for human ZIP installation when required. After
   installation, repeat the final live contract from the revised plan using the
   editor dropdown, record focused evidence below `/tmp/Decky-Metadata`, close
   the tunnel, commit the session log, and mark the round complete.

STATUS: CHANGES_REQUESTED
