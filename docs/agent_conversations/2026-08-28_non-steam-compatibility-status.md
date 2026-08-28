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

### Review round 07: stale-menu cleanup and selected-card indicators

- The user reported two installed-runtime defects in `0.3.9+95a541d`: a stale
  `Compatibility status...` context-menu entry and missing compatibility
  indicators for selected shortcuts. The stale item was state retained in a
  reused Steam menu array. The Library grid source suppresses Steam's native
  indicator when `app.BIsModOrShortcut()` is true; Library Home keeps its
  indicator in the third `GameCapsule` child slot.
- The context-menu patch now removes both the current editor key and the legacy
  `decky-metadata-compatibility` key before it inserts the single editor item.
  Its regression test seeds the legacy key and proves it is removed without a
  Steam restart.
- Added the narrow Home and grid renderer patches in
  `src/steam/libraryCompatibilityIndicators.tsx`. They use only the exact
  shortcut overview and its effective category, retain the native no-status
  result for Unknown or unresolved Automatic, do not spoof shortcut identity,
  and unpatch both renderers on plugin dismount. The live target inspection
  confirmed the current `GameCapsule` and `LibraryItemBox` predicates in
  `/tmp/Decky-Metadata/steamui/unknown/assets/chunk~2dcc5aaf7.js`.
- Renderer-level tests found and fixed a Home bug before deployment: the
  wrapper discarded `fnItemRenderer` arguments, so it could not match the card
  App ID. It now forwards those arguments. Tests also cover positive exact
  shortcuts, Unknown and official no-op behavior, Home child preservation, and
  unpatch cleanup.

#### Review round 07 validation

- `./run.sh scripts/decky doctor`, `./run.sh scripts/decky verify-change dev
  --explain`, and `./run.sh scripts/decky doctor --deck` completed before the
  fix. The Deck was reachable.
- `./run.sh npm test -- --run src/steam/libraryCompatibilityIndicators.test.tsx
  src/contextMenuPatch.test.tsx` passed (16 tests), then
  `./run.sh npx tsc --noEmit` passed.
- `scripts/orchestration/run-quality-gates` passed after the change: rollup,
  TypeScript, 330 frontend tests, Python compilation, and pytest. The review
  note integrity check and `git diff --check` also passed.
- `./run.sh scripts/decky verify-change dev --device --explain` rebuilt and
  deployed the frontend. Deck logs recorded `steam patches installed` at
  2026-08-28 12:24:58 PDT with no new compatibility-patch error. Its explicit
  launch check remains deferred because no launch authorization was given.
- Controller-driven Library validation used the committed `cdp.py` input and
  focus probes on shortcut `2155012430` (Warhammer 40,000: Space Marine).
  The Non-Steam grid and Library Home carousel each displayed Steam's Deck
  device icon with the yellow Playable category icon. An official Library card
  retained its native Deck/device icon and green Verified indicator.
  Evidence: `/tmp/Decky-Metadata/screenshots/review-07-space-marine-selected-grid.png`,
  `/tmp/Decky-Metadata/screenshots/review-07-library-home-space-marine.png`,
  and `/tmp/Decky-Metadata/screenshots/review-07-library-all.png`.
- The rendered Space Marine context menu contained exactly one `Decky
  metadata...` item and no `Compatibility status...` item. The native editor
  displayed `Automatic (Valve: Playable)` and the five required choices in
  order. Evidence:
  `/tmp/Decky-Metadata/screenshots/review-07-space-marine-context-menu.png`,
  `/tmp/Decky-Metadata/screenshots/review-07-context-menu-editor-focus.png`,
  and `/tmp/Decky-Metadata/screenshots/review-07-editor-compatibility-options.png`.
- Saving Verified changed the shortcut packed category from `10` (Playable) to
  `15` (Verified) and refreshed both the Home carousel and grid to the green
  Verified icon. Saving Automatic restored packed category `10` and the yellow
  Playable indicator. Evidence:
  `/tmp/Decky-Metadata/screenshots/review-07-library-home-space-marine-verified.png`,
  `/tmp/Decky-Metadata/screenshots/review-07-space-marine-verified-grid.png`,
  and `/tmp/Decky-Metadata/screenshots/review-07-space-marine-automatic-restored-grid.png`.
- `./run.sh scripts/decky package-push --build --push` built
  `Decky-Metadata.zip` version `0.3.9+fe51539`, reported `LOCAL_VALIDATION
  PASS`, `PACKAGE_CREATED PASS`, and `DELIVERY PASS`, and copied it to the
  Deck for human local installation. The tool correctly reported
  `INSTALLED_STATE REINSTALL_REQUIRED`; the live frontend deploy above ran the
  same commit while the full ZIP awaits the Decky reinstall action.

### Review round 08: teardown-safe selected-card indicators

- Replaced the Home path's `createReactTreePatcher` use with a plugin-owned
  wrapper. It replaces only the exact carousel element in a returned Home tree,
  reads its current props at render time, and becomes inert before either
  renderer patch is removed. A cached card therefore cannot retain a previous
  plugin closure through dismount and reinstall.
- Home and grid installation is now transactional. Target resolution requires
  unique source matches, callable writable `render` and `type` methods, a
  callable indicator component, and the expected non-empty style exports. A
  failed grid installation immediately disables and removes Home.
- Compatibility siblings now have stable plugin keys. Existing native
  indicators or plugin-keyed indicators are left unchanged, without dropping
  unrelated false/null slots, fragments, or grid icon-row children.

#### Review round 08 validation

- Test-first evidence is saved at
  `/tmp/Decky-Metadata/library-compatibility-indicators-red.log`: the old
  implementation failed the faithful two-phase test because its inner Decky
  tree wrapper escaped cleanup. The focused green run passed 24 tests at
  `/tmp/Decky-Metadata/library-compatibility-indicators-green.log`.
- The focused suite covers two recycled App IDs, repeat renders, cached-card
  cleanup, reinstall without duplicate badges, native/plugin indicator
  idempotence, false/null/fragment preservation, missing/renamed/swapped/
  ambiguous targets, non-callable or non-writable targets, and rollback after
  grid installation failure.
- `./run.sh scripts/orchestration/run-quality-gates` completed after commit
  `408c45a`: TypeScript, rollup, 342 frontend tests, Python compilation, and
  all backend tests passed. `scripts/orchestration/check-review-notes-not-deleted`
  and `git diff --check` passed.
- The review-required `./run.sh scripts/decky verify-change dev --device
  --explain` completed its local quality stage, but deployment failed twice at
  SSH tunnel setup with `No route to host` for `10.168.168.20`. The exact
  captured output is
  `/tmp/Decky-Metadata/round08-device-verify-error.log`. A subsequent
  `./run.sh scripts/decky doctor --deck` reported the Deck offline; DNS still
  resolved and the tunnel was confirmed down. No new visual, badge-count, or
  log evidence was claimed from the prior round's screenshots.
- `./run.sh npm run package` produced a new full local package,
  `Decky-Metadata.zip` version `0.3.9+408c45a` (SHA-256
  `06f8bea7c22eefbcd89f64a4d50a680980415a386d597873905fb823072caecf`).
  Delivery, live status cycling, dismount/reinstall checks, and human local
  installation remain blocked by the offline Deck. Do not create the
  round-complete marker until those live checks pass.
