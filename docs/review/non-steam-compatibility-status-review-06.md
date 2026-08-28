# Review — non-steam-compatibility-status (round 06)

Branch: `feat/non-steam-compatibility-status`
Reviewed against: `docs/plans/2026-08-28_non-steam-compatibility-status.md`

## Verdict

The user-directed cutover is structurally correct: one context-menu entry now
opens the metadata editor, the separate modal is deleted, and the editor uses a
native dropdown with save-time persistence and refresh. The code is ready for
the required updated package installation and live dropdown validation.

## Gate status

- Reviewed runtime commit: `95a541d`.
- The complete reviewer quality gate passed with 23 frontend files and 317
  frontend tests plus the complete backend suite, build, and typecheck.
- `Decky-Metadata.zip` contains version `0.3.9+95a541d`.
- The current Deck installation is the superseded modal build
  `0.3.9+307fe86`; it cannot validate the dropdown.
- README, changelog, generated bundle, tests, and session-log handoff are
  present. The clean-cut deletion removed both modal source and modal tests.

## Required changes

1. Change the stale context-menu test description
   `does not add either Decky Metadata entry` to describe the single-entry
   design. Do not change its assertions.

2. The human must install the delivered `Decky-Metadata.zip` version
   `0.3.9+95a541d` through Decky's developer-mode local ZIP installer.

3. After installation, complete the revised plan's live contract. Prove one
   context-menu entry, the editor dropdown's initial focus and D-pad option
   order, all five saved choices, backend persistence across a hard reload,
   poster and Game Info return-path refresh, retained enriched details,
   Automatic/removal/dismount restoration, alternating-App-ID isolation, and
   official-game exclusion.

4. Record exact commands, focused JSON/screenshots, package version, packed
   values, stored overrides, and results in the session log. Include the
   existing dev-baseline classification for the two unrelated no-launch smoke
   failures. Close the tunnel, run the full quality gate, regenerate the full
   package if the source changes, commit the session log, and mark the round
   complete.

STATUS: CHANGES_REQUESTED
