# Review — non-steam-compatibility-status (round 09)

Branch: `feat/non-steam-compatibility-status`
Reviewed against: `docs/plans/2026-08-28_non-steam-compatibility-status.md`

## Verdict

Round 08 resolves the independent reviewers' static no-ship findings: Home now
uses an owned inert-on-cleanup wrapper, installation is transactional and
fail-closed, the test models both render phases, and injected siblings have
stable keys. The revised wrapper has not run on the Deck because the device
went offline, so integration remains blocked on live lifecycle and navigation
proof.

## Gate status

- Reviewed commits: `408c45a` and `fe1132f`.
- The full quality gate passed with 342 frontend tests and the complete backend
  suite; focused red/green logs and target/lifecycle tests are recorded in the
  session log.
- Static tests cover recycled App IDs, repeat renders, cleanup, reinstall,
  duplicate prevention, target ambiguity/non-callability/non-writability, and
  partial-install rollback.
- `Decky-Metadata.zip` version `0.3.9+408c45a` was built locally.
- Device deployment and delivery failed with `No route to host`; the session
  log correctly makes no visual claim for the new wrapper.

## Required changes

1. Keep the Steam Deck awake and reachable, then run the committed device
   dispatcher. Build and push the current full package, install it through
   Decky's local ZIP UI, and confirm the installed version contains runtime
   commit `408c45a` or its code-identical successor.

2. Repeat the selected-card matrix on the installed owned-wrapper build:
   Playable, Verified, Unsupported, Unknown/no badge, and Automatic in both
   Library Home and the Library grid. Capture exact App ID, native shortcut
   identity, stored override, packed/effective category, resolved target
   fingerprints, and badge count/classes/labels. Compare an official card and
   prove it is unchanged.

3. Exercise controller focus and virtualization after the wrapper change:
   navigate across Home cards and grid cards, scroll enough to recycle cells,
   alternate two shortcuts with different categories, and confirm there is no
   stale badge, identity bleed, focus loss, duplicate icon, spacing regression,
   or React key/render warning.

4. Prove lifecycle cleanup on-device: dismount/disable the plugin and rerender
   Home/grid with no plugin badge, then reinstall/remount and rerender with
   exactly one badge. Confirm the stale compatibility menu item is gone and one
   metadata editor entry remains without restarting Steam.

5. Finish the editor contract on the same installed package: save and persist
   each dropdown choice, hard-reload, return from the editor to Home and Game
   Info, retain enriched details, restore Automatic, and prove
   removal/dismount baseline restoration.

6. Record all commands and evidence paths in the session log, close the tunnel,
   rerun the full quality gate, commit the log, and mark the round complete. If
   the Deck or human ZIP confirmation is unavailable, leave the marker absent
   and report the exact blocker.

STATUS: CHANGES_REQUESTED
