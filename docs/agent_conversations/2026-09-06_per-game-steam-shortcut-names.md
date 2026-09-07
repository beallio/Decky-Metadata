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

## Review round 02 follow-up

- The editor now merges a delayed initial metadata response field by field: a
  field changed after the request started remains local, while untouched fields
  (including the pinned Steam match) hydrate from storage. A later normal Save
  therefore cannot erase a match that arrived after a user began typing.
- Applying a Steam App ID now reconciles the saved Steam-owned identity into
  the current form and cache without replacing newer editable fields. Clearing
  an ID uses `null` consistently, so the completion path still refreshes
  compatibility surfaces and reports the saved result without starting a
  needless enrichment request.
- Every editor visit carries a monotonic entry token. Rename, restore, forget,
  delayed management reloads, modal callbacks, toasts, and busy completion use
  that token. A first visit to A cannot put its history into a later A after
  navigating A/B/A, even when the applied names are identical.
- The shortcut smoke now uses the installed `@decky/api` source contract:
  `deckyLoaderAPIInit.connect(version, "Decky Metadata")` followed by the
  connection's scalar `call(route, appId)`. Its fixture executes the real
  helper with receiver and argument validation rather than recognizing a
  helper filename. It also polls delayed history clearing separately from the
  native restore, reloads `SharedJSContext` before persistence probes, and
  preserves the raw display name for snapshot, comparison, and cleanup.

Round-02 red/green evidence:

- New editor cases first failed for delayed hydration, delayed Steam-ID save,
  clear-to-null completion, and A/B/A rename state. They pass after the
  reconciliation and entry-token changes.
- The RPC/reload/probe contract test first failed against the old detached
  loader call and Big Picture reload. The corrected smoke fixture passes
  delayed history clear, missing-loader, wrong-argument, and whitespace-name
  forced-cleanup cases.
- `./run.sh npx tsc --noEmit` — passed.
- `./run.sh npx vitest run src/MetadataPage.test.tsx` — 28 passed.
- `./run.sh uv run --with pytest -- pytest -q tests/test_shortcut_name_smoke.py`
  — 8 passed.
- `bash -n scripts/deck/verify/smoke_shortcut_name.sh` and `git diff --check`
  — passed.
- `./run.sh scripts/orchestration/run-quality-gates` — passed: 423 frontend
  tests and 505 backend tests collected.

The earlier statement that the ZIP flow was blocked because a human click is
inherently required was inaccurate. The historic package/capture results above
remain a record of that attempt, but the technical blocker for current device
acceptance is reachability and authorization, not an unavoidable manual click.
This round ran read-only `scripts/decky doctor --deck` checks for `steamdeck`
and `steamdeck-legos`; both report the optional Deck offline. No full-ZIP
installation, persistent mutation, focus test, controller-cache query, or
launch was attempted without explicit per-device authorization. Those required
acceptance checks remain pending and are not represented as approval.

## Review round 03 follow-up

- Steam enrichment now reconciles the complete successful response into the
  editor form and cache. It keeps only values that the user changed while the
  Steam-ID save or enrichment request was pending. This includes the companion
  developer, publisher, release-date, and rating text fields, so a later Save
  cannot overwrite descriptions, compatibility data, categories, DLC, or other
  untouched Steam fields with stale form data.
- A confirmed restore now clears history for the captured shortcut AppID even
  when the user navigates away before Steam reports the native result. Entry
  tokens still prevent the older operation from changing the later editor's
  form, management state, toast, or busy state. A failed cleanup retains the
  original shortcut's safe restored-history record without affecting the later
  editor.

Round-03 red/green evidence:

- The new delayed-operation assertions first failed: full enrichment was
  reduced to identity fields, a legacy backfill discarded all non-edited Steam
  fields, and both A-to-B restore cases returned before clearing A's history.
- `./run.sh npx vitest run src/MetadataPage.test.tsx` — 32 passed.
- `./run.sh npx tsc --noEmit` — passed.
- `./run.sh scripts/orchestration/run-quality-gates` — passed: 27 frontend
  files / 427 tests, Rollup build, Python byte-compile, and the complete pytest
  suite. A direct `./run.sh uv run --with pytest -- pytest -q` rerun passed.
- `./run.sh scripts/orchestration/check-review-notes-not-deleted` and
  `git diff --check` — passed.

Current device acceptance state:

- Fresh read-only checks found `steamdeck` reachable and `steamdeck-legos`
  offline. The current local package was built and copied to the reachable
  Deck's Downloads directory: local validation, package creation, and delivery
  passed; Decky reports `INSTALLED_STATE REINSTALL_REQUIRED` and its installed
  manifest remains version `0.3.12`.
- The required `decky-local-zip-gui-install` skill is not available in this
  session, and the repository has no supported unattended replacement for the
  Deck Developer UI ZIP confirmation. The delivered ZIP was not installed.
  Therefore the persistent editor smoke, focus/cancel checks, safe-surface
  checks, controller smoke, and all `steamdeck-legos` install/UI checks remain
  unverified. No direct VDF write, automatic rename, or game launch was used.

## Review round 04 follow-up

- The production native rename boundary and the emergency cleanup helper now
  call `SetShortcutName` through Steam's `Apps` object. This preserves the
  receiver required by the real binding instead of invoking a detached method.
- Native shortcut names now remain byte-for-byte exact in the editor boundary:
  leading and trailing whitespace is neither trimmed before state comparison
  nor lost during restore. Empty or whitespace-only targets still fail before
  any native write.
- Legacy Steam-name backfill now begins only after the current editor entry's
  metadata RPC hydrates its form. A stale A entry cannot consume B's one-time
  backfill attempt while B is loading.
- The persistent smoke polls each editor and confirmation-modal control before
  clicking. It reports a known unavailable reason separately from an editor or
  modal that is still loading. Its fake transport executes the actual cleanup
  helper with a receiver-sensitive Apps mock.

Round-04 red/green evidence:

- New contracts first failed for trimmed native names, detached Apps calls,
  the A-to-B pre-hydration backfill race, and missing editor/modal readiness
  polling.
- `./run.sh npx vitest run src/steam/shortcutNames.test.ts src/MetadataPage.test.tsx`
  — 43 passed.
- `./run.sh uv run --with pytest -- pytest -q tests/test_shortcut_name_smoke.py`
  — 10 passed.
- `bash -n scripts/deck/verify/smoke_shortcut_name.sh`,
  `./run.sh npx tsc --noEmit`, and `./run.sh npm run build` — passed.

Device installation and persistent UI verification are recorded after the
corrected package is built and installed. No direct VDF write, bulk rename,
automatic rename, global setting, second context-menu item, or game launch is
introduced by this round.
