# Non-Steam Compatibility Status Implementation

Date: 2026-08-28

## Objective

Implement the `non-steam-compatibility-status` plan. Add a per-shortcut
compatibility dropdown to the metadata editor. It does not change official
Steam games.

## Changes

- Added the nullable `deck_compat_override` record field. The backend accepts
  only `0` through `3` or `null`.
- Preserved manual overrides through fetched metadata, Steam enrichment, scan
  saves, direct manual saves, and Steam App ID changes. `0` remains an explicit
  Unknown choice.
- Added effective-category precedence and low-nibble baseline restoration.
  The plugin restores the original category on metadata removal and dismount.
- Added a native Decky `DropdownItem` to the existing `Decky metadata...`
  editor. It uses the existing `save_metadata` RPC and does not update cache or
  runtime state after a failed save.
- Used one plugin-owned compatibility revision signal and a same-route history
  replacement to request a normal SteamUI render without replacing an app-store
  object.
- Documented that Automatic uses Valve's matched category. ProtonDB is not a
  source.

### Review round 01 corrections

- Added `getNativeOverview()`, which reads the exact `appStore.allApps` entry
  instead of the intentionally patched AppID getter. Context-menu insertion,
  override saves, compatibility application, and baseline restoration now use
  that native object. An official AppID cannot mutate a matched shortcut.
- Waited for `ensureMetadataCache()` before the selector opens and at the save
  boundary. A save now copies the loaded record, so it cannot replace rich
  metadata with a blank shell during bootstrap.
- Removed the unused compatibility event. Same-route history replacement is
  the sole refresh mechanism, with its path, query, hash, state, and
  missing-router behavior covered by tests.
- Corrected the context-menu patch header to describe the one injected entry.

### Review round 05: editor dropdown cutover

- The user replaced the separate compatibility context-menu item and modal
  with a dropdown in the existing metadata editor. The menu now has one
  deduplicated `Decky metadata...` entry.
- Deleted the modal component and its tests. No compatibility-menu key, modal
  export, or modal focus code remains.
- Added the native dropdown with the required order: Automatic, Verified,
  Playable, Unsupported, and Unknown. Automatic displays the resolved Valve
  category when one exists. Numeric `0` stays an explicit Unknown choice.
- The normal Save action now writes the complete editor record, updates the
  cache and effective compatibility state, and requests the safe SteamUI
  refresh only after `save_metadata` succeeds. A failed save leaves persisted,
  cached, and runtime compatibility unchanged.

## Validation

- `./run.sh uv run --with pytest -- pytest -q tests/test_steam_appid_override.py tests/test_deck_compat.py` — passed (15 tests).
- `./run.sh npm test -- --run src/steam/metadataPatch.test.ts` — passed (15 tests).
- `./run.sh npm test -- src/MetadataPage.test.tsx src/contextMenuPatch.test.tsx` — passed (8 tests): native option order, Automatic and explicit Unknown display, successful save and refresh, failed-save safety, one menu entry, App-ID isolation, and official-game exclusion.
- `./run.sh npx tsc --noEmit` and `./run.sh npm run build` — passed after the editor dropdown cutover.
- `./run.sh scripts/orchestration-hooks/quality-gates` — passed after all source and documentation changes (312 frontend tests and all backend tests).
- `./run.sh scripts/decky doctor --deck` at 2026-08-28 07:19 PDT — the Deck was offline. The required device verification and screenshot/JSON evidence remain outstanding. Do not create the round-complete marker until they pass.
- Prior modal validation is superseded by the editor-dropdown validation above.
- `./run.sh scripts/orchestration/run-quality-gates` and the local stage of
  `./run.sh scripts/decky verify-change dev --device --explain` passed:
  build, type check, 317 frontend tests, and backend pytest all passed.
- `./run.sh scripts/decky doctor --deck` at 2026-08-28 07:50 PDT still
  reported the Deck offline. The verification dispatcher then stopped before
  deployment with `ssh: connect to host 10.168.168.20 port 22: No route to
  host`. No on-device checks, screenshots, or focused JSON evidence could be
  collected. This external blocker leaves the round incomplete; do not create
  the round-complete marker.

### Package handoff for review round 05

- `./run.sh scripts/decky status --deck` at 2026-08-28 11:03 PDT confirmed
  that the Deck was reachable and the feature branch was clean.
- `./run.sh scripts/decky package-push --build --push` built
  `Decky-Metadata.zip` with version `0.3.9+95a541d` and reported
  `LOCAL_VALIDATION PASS`, `PACKAGE_CREATED PASS`, and `DELIVERY PASS`.
- The delivery tool reported `INSTALLED_STATE REINSTALL_REQUIRED`. The ZIP is
  ready for the required human local installation. Do not mark the round
  complete until that install is done and the editor-dropdown live contract is
  verified with focused evidence below `/tmp/Decky-Metadata`.
