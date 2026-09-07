# Per-game Steam shortcut names

Date: 2026-09-06

## Objective

Implement `per-game-steam-shortcut-names`: let one matched non-Steam shortcut
preview Steam's official cleaned title, apply it only after confirmation and
native observation, and restore its exact original title later.

## Implementation

- Added `steam_store_name` as Steam-owned metadata. The appdetails provider
  cleans HTML entities, marker glyphs, whitespace, and edge whitespace without
  changing Steam's remaining case or punctuation. The editable `title` keeps
  its pre-existing behavior.
- Sanitization accepts only non-empty string store names without NUL bytes and
  at most 512 code points. Steam-owned names are retained when an existing
  positive Steam match is pinned, and are cleared before a changed or cleared
  manual Steam App ID is enriched.
- Added a separate top-level `shortcut_names` map. Its records contain
  `original_name`, `applied_name`, `steam_appid`, and `updated_at`. Metadata
  removal and cache clearing do not affect it. Saves preserve the first valid
  original name; restores clear the record only after Steam reports the native
  restore.
- Added management RPCs with a strict response shape. Eligibility requires an
  explicit VDF AppID whose unsigned normalized value equals the native shortcut
  ID. This correctly accepts normal high-bit shortcut IDs while rejecting
  missing or name-derived CRC IDs. The RPC never returns a VDF path, executable,
  or Steam user ID.
- Added the narrow Steam Client `Apps.SetShortcutName` boundary. It reads the
  exact native `display_name`, writes once, and polls for no more than three
  seconds. `undefined` from the native method is not success.
- Added the `Shortcut name` editor panel after `Steam App ID`. It has
  independent metadata/management loads, one-time legacy backfill, state-first
  rename, observed restore, diverged-history forget, confirmation modals, and
  the existing busy/focus rules. No context-menu route changed.
- Added `smoke_shortcut_name.sh` and small CDP helpers. Normal smoke actions
  use visible editor controls; the failure trap carries base64-only names to a
  native emergency restore. Evidence stores hashes and state only.

## Contract evidence

The required red baseline was recorded before production edits.

- Backend red: `steam_store_name` was absent from provider output and
  sanitization; the new management/state RPC methods and legacy
  `shortcut_names` map did not exist.
- Frontend red: the shortcut-name boundary module did not exist, and the
  editor had no panel after `Steam App ID`.

Focused green checks after implementation:

- `./run.sh uv run --with pytest -- pytest -q tests/test_steam_appdetails.py tests/test_shortcut_name_state.py` — 40 passed.
- `./run.sh npx vitest run src/steam/shortcutNames.test.ts src/MetadataPage.test.tsx` — 31 passed in 2 files.

Mutation controls all failed as required and were immediately restored:

1. Removing the provider assignment made both direct appdetails and real
   provider-to-enrichment preservation tests fail.
2. Resolving immediately after `SetShortcutName` made the no-overview-update
   timeout test fail because it resolved instead of rejecting.
3. Overwriting an existing original name made the immutability test fail.
4. Treating a diverged native name as unmanaged made both the pure classifier
   and the editor fail-closed test fail.

Restored focused checks returned to the green tallies above. Full checks:

- `./run.sh npx tsc --noEmit` — passed.
- `./run.sh npm run build` — passed; `dist/index.js` and map regenerated.
- `./run.sh uv run --with pytest -- pytest -q` — 501 collected tests passed.
- `./run.sh npm test` — 27 files and 418 tests passed.
- `./run.sh scripts/orchestration/run-quality-gates` — passed.
- `./run.sh scripts/orchestration/check-review-notes-not-deleted` — passed.
- `./run.sh git diff --check` — passed.
- Shell fixture controls for missing AppID, empty target, equal target, and
  absent editor control each emitted their named `FAIL:` message and exited 2.

## Package and device evidence

- `steamdeck` was reachable during `scripts/decky doctor --deck`.
- `DECKY_DECK_HOST=steamdeck ./run.sh scripts/decky package-push --build --push`
  built `0.3.13+a1ae9d1`, validated the archive, and delivered it to Downloads.
  It reported `INSTALLED_STATE REINSTALL_REQUIRED`.
- `scripts/decky capture` created read-only diagnostics below
  `/tmp/Decky-Metadata/diagnostics/20260906T215214Z`.
- `steamdeck-legos` was offline. Its package delivery reported
  `DELIVERY OFFLINE`; no device files were installed or changed there.

The QAM local-ZIP installation and both persistent UI smokes remain deferred:
the required `decky-local-zip-gui-install` skill is not available in this
session, and installing through Decky's Developer UI requires a human device
action. Therefore no shortcut name, controller-cache query, game launch,
screenshot, QAM focus trace, `run_all.sh`, or controller-tab smoke was run.
The delivered Steam Deck ZIP is ready for that install. The plan's exclusions
remain intact: no bulk rename, automatic rename, global setting, second
context-menu item, direct VDF write, or game launch was implemented or used.

## Review round 01 follow-up

- Guarded `enrich_steam_app` at the persistence boundary. It now captures the
  metadata record before the provider call and saves only if the same record
  still exists at completion. A delayed-response test proves that a later user
  save with a different Steam ID and title survives unchanged.
- Guarded the editor's legacy name backfill by editor entry, Steam match, and
  form revision. Delayed-response tests cover an unsaved edit, changed Steam
  ID, metadata removal, and navigation to another shortcut. Late data is
  discarded without replacing form state or cache data.
- Added a synchronous busy lock so duplicate modal confirmation and another
  editor action cannot overlap a pending rename. A rejected management load
  disables name writes without disabling normal metadata save. The panel now
  shows an unavailable native-API state before it offers a rename; managed
  restore history remains visible.
- Replaced fixed-error smoke modes with a bounded fake-CDP test harness that
  executes the real shell script. It covers parsing, equal-target preflight,
  absent control, delayed observed success, forced restore failure, and an
  explicit cleanup failure. The real smoke now polls rename and restore
  observations and places evidence below a device-specific path.

Round-01 local checks:

- `bash -n scripts/deck/verify/smoke_shortcut_name.sh` — passed.
- Focused frontend: 31 tests passed in 2 files.
- Focused backend/smoke checks: 49 passed.
- `./run.sh npx tsc --noEmit` — passed.

Round-01 `scripts/decky doctor --deck` checks report the optional Deck offline
for both `steamdeck` and `steamdeck-legos`. No installation, smoke, focus test,
or release claim is made by this follow-up until the hosts are reachable and the
required local-ZIP GUI installer is available.
