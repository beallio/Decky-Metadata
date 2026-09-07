# Review — per-game-steam-shortcut-names (round 04)

Branch: `feat/per-game-steam-shortcut-names`
Reviewed against: `docs/plans/2026-09-06_per-game-steam-shortcut-names.md`

## Verdict

Changes required at `a7be48a`. Round-03 enrichment reconciliation and captured
restore cleanup are corrected. Live installation now succeeded, but the
production native boundary and emergency cleanup use an invalid receiver.

## Gate status

- Independent full gates passed: 427 frontend and 505 backend tests.
- Orchestrator completed Decky Loader GUI Browse/ZIP/Install on Steam Deck.
  Capture `/tmp/Decky-Metadata/diagnostics/20260907T054832Z/doctor.json`
  confirms installed `0.3.13+a7be48a` and bundle SHA256
  `3d6f0c48df9e3fde1c7c3edcdb6a168d07a739ec018afd27ba5ecc958404b345`.
- Delisted Deadpool editor correctly showed no Use Steam name control and
  `Steam did not return an official name`.
- Listed smoke failed: `FAIL: editor never exposed expected control`, then
  `FAIL: cleanup could not restore the exact original shortcut name and sort_as`.
  Direct native/backend probes afterward confirmed original name and sort key
  unchanged, no history, no running game.
- Running the actual emergency helper with the original name returned
  `Error: Unknown method` at its detached setter call. Calling
  `SteamClient.Apps.SetShortcutName(appid, currentName)` directly succeeded.
  This is a reproduced receiver requirement, not speculative API behavior.

## Required changes

### R1 — Preserve the native SteamClient Apps receiver

`src/steam/shortcutNames.ts:56-61` and
`scripts/deck/js/restore_shortcut_name.js:7-11` extract SetShortcutName then
invoke it without its Apps receiver. The real binding rejects this with
`Error: Unknown method`. Call as an Apps method or use `.call(apps, ...)`.
Add a receiver-sensitive native mock and execute the actual emergency helper
with a receiver-sensitive transport. Do not let a permissive vi.fn hide this.
Rerun live UI rename/restore and forced cleanup when reachable.

### R2 — Preserve exact original bytes in the production path

`nativeShortcutName` trims display_name at line 22 and
`setShortcutNameAndWait` trims expected/target at lines 49-50. This loses
leading/trailing whitespace before storing/restoring the original, treats
external whitespace edits as unchanged, and violates the plan's exact-name
state classification. Return/compare/write the exact strings; clean only the
Steam-provided proposal upstream. Use a separate trim check for unusable input,
without changing a valid original. Cover exact whitespace-bearing originals,
restoration and whitespace-only external divergence. Remove the inaccurate
comment declaring surrounding whitespace presentation noise.

### R3 — Wait for actual editor prerequisites and isolate backfill per entry

The real smoke navigates from Deadpool to Assassin's Creed then immediately
clicks a control without waiting for asynchronous metadata/management/backfill.
Add bounded readiness polling before each editor/modal control activation;
this must distinguish absent/unavailable from still loading, with clear error
output. Extend the fixture with delayed editor readiness, not only delayed
native observation.

During this run Assassin's Creed's editor showed no official name even though
the real backend get_metadata RPC returned steam_appid 15100 and
steam_store_name `Assassin's Creed: Director's Cut Edition`. Investigate the
cross-entry initial state: the app-ID route changes while metadataRef may still
hold Deadpool's prior match, and the backfill effect can mark the new entry
attempted using that old match before initial hydration completes. Start
backfill only from metadata hydrated for the current entry; no prior-entry form
may consume the new entry's one-time attempt. Add a Deadpool-to-listed
navigation case using delayed load/backfill and assert a valid proposal becomes
available without reopening the editor. Do not synthesize the official name or
disable ordinary editing during genuine background enrichment.

### R4 — Finish live verification without replacing it with local assertions

The GUI install is possible and was completed by the orchestrator; use the
available skill when reachable and install the corrected full package before
smoke. Keep the current original names restored. Legion verification remains
pending; no merge or approval while required device checks are unverified.

STATUS: CHANGES_REQUESTED
