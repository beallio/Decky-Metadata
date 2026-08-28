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

### Review round 09: reachable Deck, package delivery, and live-smoke blocker

- `./run.sh scripts/decky doctor --deck` at 2026-08-28 13:18 PDT confirmed
  that the Deck is reachable and the feature branch is clean. The previous
  round-complete marker was cleared before the review work started.
- `./run.sh scripts/decky verify-change dev --device --explain` rebuilt and
  deployed the current frontend bundle, hard-reloaded SteamUI, and passed the
  local quality stage: TypeScript, rollup, 342 frontend tests, Python
  compilation, and the backend suite. Its explicit launch smoke was deferred
  because this run did not authorize `--allow-launch`.
- The dispatcher stopped on two unrelated live-fixture assertions. The
  rerun output is retained at
  `/tmp/Decky-Metadata/non-steam-compatibility-status-round09-quicklinks-failure.log`
  and
  `/tmp/Decky-Metadata/non-steam-compatibility-status-round09-controller-layouts-failure.log`.
  Raw probes at
  `/tmp/Decky-Metadata/non-steam-compatibility-status-round09-delisted-quicklinks.json`
  and
  `/tmp/Decky-Metadata/non-steam-compatibility-status-round09-controller-layouts-raw.json`
  show that the existing Deadpool shortcut (`2783271568`) has no rich rendered
  metadata and its source app (`224060`) returns zero Community layouts. The
  listed fixture still returns 31 matching Community layouts. This feature did
  not change the quick-links or controller-layout code, so no unrelated code
  change was made to hide the drift.
- `./run.sh scripts/decky package-push --build --push` confirmed
  `LOCAL_VALIDATION PASS`, `PACKAGE_CREATED ALREADY_CURRENT`, and
  `DELIVERY ALREADY_CURRENT` for `Decky-Metadata.zip` version
  `0.3.9+6507256` (SHA-256
  `ac0c6415df0ee63f1fd7e44fdceb1e4aa0507f524918925de1177755e370e05c`).
  `./run.sh scripts/decky status --deck --json` confirms that the downloaded
  ZIP matches it, but the installed manifest remains `0.3.9+95a541d`.
  `INSTALLED_STATE REINSTALL_REQUIRED` therefore requires a human local-ZIP
  installation through Decky before the owned-wrapper lifecycle and selected-
  card matrix can be claimed.
- The round-complete marker remains intentionally absent. Required next state:
  install `/home/deck/Downloads/Decky-Metadata.zip` through the Decky UI, then
  rerun the live matrix with the installed package and replace the stale
  delisted fixture or restore its required metadata/layout data. Close the
  tunnel after this blocked checkpoint.
- `./run.sh scripts/deck/tunnel.sh down` closed the verification tunnel and a
  following `status` reported `tunnel: down`. The final
  `./run.sh scripts/orchestration/run-quality-gates` pass again completed the
  TypeScript check, rollup build, 342 frontend tests, Python compilation, and
  the backend suite. `scripts/orchestration/check-review-notes-not-deleted`
  and `git diff --check` also passed before this log was committed.

### Review round 09 continuation: current package and device-state evidence

- At 2026-08-28 14:03 PDT, the resumed implementer cleared the required
  round-complete marker. `scripts/decky doctor --deck` then confirmed the
  Deck was reachable and the feature branch was clean.
- `scripts/decky verify-change dev --device --explain` rebuilt, deployed, and
  hard-reloaded the current frontend. Its retained dispatcher log is
  `/tmp/Decky-Metadata/diagnostics/round09-device-dispatcher.log`. The local
  stage passed TypeScript, rollup, 342 frontend tests, Python compilation, and
  the backend suite. The no-launch re-render smoke passed. The generic
  delisted-shortcut quick-links and controller-layout smokes failed again
  because fixture `2783271568` has no rich rendered metadata and source app
  `224060` has no Community layouts; no quick-links or layout code was changed
  because those systems are outside this plan.
- `scripts/deck/logs.sh audit --json` and `scripts/decky capture` created
  `/tmp/Decky-Metadata/diagnostics/round09-deck-log-audit.json` and
  `/tmp/Decky-Metadata/diagnostics/20260828T210956Z`. The audit found no new
  fatal compatibility-patch failure; its reported historical reload and
  network errors do not identify a feature regression.
- After the Deck disconnected, `scripts/decky package-push --build --push`
  still created `Decky-Metadata.zip` version `0.3.9+0ac0afa`, but reported
  `LOCAL_VALIDATION PASS`, `PACKAGE_CREATED PASS`, `DELIVERY OFFLINE`, and
  `INSTALLED_STATE UNKNOWN`. The exact output is
  `/tmp/Decky-Metadata/diagnostics/round09-package-push.log`.
- To recover the local test cache quota, only disposable npm, uv, pytest, and
  compile caches were moved to recoverable trash at
  `/home/beallio/.local/share/Trash/files/Decky-Metadata-cache-20260828T1405-0oUBLz`.
  The rerun full gate passed; its output is
  `/tmp/Decky-Metadata/diagnostics/round09-quality-gates.log`. The tunnel was
  closed with `scripts/deck/tunnel.sh down` and reported `tunnel: down`.
- The round-complete marker remains absent. Completion is blocked until the
  Deck stays reachable, the new ZIP is installed through Decky's local ZIP UI,
  and the plan's selected-card, lifecycle, menu, editor, and baseline-restoration
  checks can be captured on the installed package. The delisted fixture must
  also be restored or replaced before its generic rich-metadata/layout smokes
  can pass.

### Review round 09 continuation: reachable Deck, full package retry, and UI-install block

- At 2026-08-28 14:40 PDT, the resumed implementer cleared the required
  round-complete marker. `./run.sh scripts/decky doctor --deck` and
  `./run.sh scripts/decky status --deck` confirmed a clean feature branch and
  a reachable Deck. The doctor reported only the expected cache-policy and
  intentionally retained `node_modules` warnings.
- `./run.sh scripts/decky package-push --build --push` built or confirmed the
  full package `Decky-Metadata.zip` version `0.3.9+0ed07e3` (SHA-256
  `605818a4f4ed94c3314c315c989a9f77071e0a50aad4ded159fa4cdee23f5638`)
  in `/home/deck/Downloads/Decky-Metadata.zip`. It reported
  `LOCAL_VALIDATION PASS`, `PACKAGE_CREATED ALREADY_CURRENT`,
  `DELIVERY ALREADY_CURRENT`, and `INSTALLED_STATE REINSTALL_REQUIRED`.
  `git diff --name-only 408c45a..HEAD -- main.py src dist/index.js` produced
  no paths, so this package contains a code-identical successor to runtime
  commit `408c45a`.
- The post-delivery `./run.sh scripts/decky status --deck --json` check shows
  the downloaded ZIP with the above hash, but the installed manifest remains
  `0.3.9+6507256`. The local-ZIP install is a Decky developer-mode UI prompt
  that requires confirmation on the Deck; no approved unattended local-package
  installer exists. Therefore the full package is not installed and no visual
  result below is claimed as full-package validation.
- `./run.sh scripts/decky verify-change dev --device --explain` passed its
  local quality gate: TypeScript check, rollup build, 342 frontend tests,
  Python compilation, and the backend suite. It deployed the current frontend
  and hard-reloaded SteamUI. The retained dispatcher output is
  `/tmp/Decky-Metadata/non-steam-compatibility-status-review-09-verify-change.log`.
  The no-launch re-render smoke passed with zero cache writes. The generic
  delisted shortcut `2783271568` still failed quick-links and controller-layout
  checks because it has no rich metadata and its source app `224060` has no
  Community layouts. Those fixtures are outside this compatibility-status plan.
- `./run.sh scripts/decky capture` wrote
  `/tmp/Decky-Metadata/diagnostics/20260828T214535Z`; the log audit synced the
  Deck logs to `/tmp/Decky-Metadata/deck-logs/steamdeck/20260828-144542`.
  `./run.sh scripts/deck/tunnel.sh down` completed and a following status
  reported `tunnel: down`.
- The round-complete marker remains absent. Required next state: confirm the
  local ZIP installation in Decky's UI, verify that the installed manifest is
  `0.3.9+0ed07e3` or a code-identical successor, and then run the selected-card,
  controller/virtualization, lifecycle, editor, and baseline-restoration matrix
  on the installed package. Use the known compatible Space Marine shortcut
  `2155012430` for the compatibility matrix because the generic delisted
  fixture cannot provide the required rich-metadata/layout evidence.

### Review round 10: installed-package compatibility matrix

- The committed review-10 decision confirmed that the installed full package
  `0.3.9+6507256` contains the same runtime code as `408c45a`. Per that
  decision, this round did not rebuild, package, push, reinstall, or replace an
  app-store object. `./run.sh scripts/decky doctor --deck` confirmed the Deck
  and a clean branch were reachable. The existing tunnel was reused, then
  closed with `./run.sh scripts/deck/tunnel.sh down` and verified down.
- The review fixture was `2155012430` (Warhammer 40,000: Space Marine). Its
  native shortcut identity stayed true in every state probe. Controller input
  entered the editor heading, Save control, form fields, and native
  Compatibility status combobox. Opening that combobox showed exactly the
  required order: Automatic, Verified, Playable, Unsupported, Unknown. The
  initial popup had Verified selected. Evidence:
  `/tmp/Decky-Metadata/review-10/editor-dropdown-options.png`,
  `editor-dropdown-options.json`, `editor-dropdown-initial-focus.json`, and
  `editor-dropdown-playable-focused.png`.
- Native editor saves persisted each non-Automatic value and applied the
  expected packed category while retaining the shortcut identity: Playable
  (`deck_compat_override: 2`, packed `10`), Verified (`3`, `15`), Unsupported
  (`1`, `5`), and explicit Unknown (`0`, `0`). The `0` result is direct live
  evidence that Unknown is not treated as a false value. The JSON probes are
  under `/tmp/Decky-Metadata/review-10/space-marine-metadata-*.json` and
  `space-marine-native-state-*.json`; editor screenshots use the same prefix.
- Saving Automatic displayed `Automatic (Valve: Playable)`, persisted a null
  override with fetched category `2`, and applied packed category `10`.
  Removing the metadata then removed the record and restored the runtime's
  captured original low nibble (`0`). The final state is therefore Automatic,
  has no metadata record, and has packed category `0`. Evidence:
  `editor-automatic-display.json`, `space-marine-metadata-automatic.json`,
  `space-marine-native-state-automatic.json`,
  `space-marine-metadata-removed.json`, and
  `space-marine-native-state-removed.json`.
- Library Home and the Non-Steam grid were captured after the changes at
  `/tmp/Decky-Metadata/review-10/library-home-playable.png`,
  `library-home-metadata-removed.png`, `library-grid-nonsteam.png`, and
  `library-grid-space-marine-automatic-removed.png`. The direct state probes
  confirm no map replacement and no stale record after removal. The captured
  log audit and diagnostic bundle are
  `/tmp/Decky-Metadata/review-10/deck-log-audit.json` and
  `/tmp/Decky-Metadata/diagnostics/20260828T223046Z`; they contain historical
  reload and network noise but no new compatibility render or controller-key
  error for this round.

### Review round 11: lazy Library target retry

- The Library indicator installer now retries boundedly when Steam has not
  loaded its lazy Home or grid modules yet. It resolves only the exact current
  Steam exports, requires one matching source fallback, and accepts Steam's
  writable memo object for the grid renderer. An unresolved or ambiguous target
  remains unpatched until a later retry resolves one unique target.
- Cleanup is registered before target discovery. It cancels a pending retry,
  makes a raced callback inert, disables existing wrappers, and unpatches both
  renderer targets. The focused suite covers delayed availability, ambiguity
  becoming unique, a thrown lazy source lookup, the retry bound, cleanup before
  resolution, one install only, exact shortcut identity, positive categories,
  official-game pass-through, and cached-wrapper teardown.
- `./run.sh npx vitest run src/steam/libraryCompatibilityIndicators.test.tsx`
  passed 34 tests. The final project quality gate and review-note integrity
  check are recorded with this round's commit.
- `./run.sh scripts/deck/deploy.sh --no-build` pushed the regenerated bundle
  and hard-reloaded SteamUI. The live plugin log records
  `library compatibility indicators installed resolutionAttempts='1'` at
  2026-08-28 16:40 PDT. Evidence:
  `/tmp/Decky-Metadata/non-steam-compatibility-status/round-11-final-install-log.txt`.
- Native controller focus selected the Space Marine fixture (`2155012430`) in
  the Non-Steam grid. The focused grid card visibly shows the white Deck icon
  and yellow Playable indicator in
  `/tmp/Decky-Metadata/non-steam-compatibility-status/round-11-grid-space-marine-selected.png`;
  the paired focus JSON identifies the card by title. Library Home shows the
  same selected fixture and both indicators in
  `/tmp/Decky-Metadata/non-steam-compatibility-status/round-11-installed-space-marine-home.png`.
- The fixture was restored through the normal Metadata editor: controller
  focus selected `Automatic`, then the existing Save control persisted it.
  The native shortcut probe subsequently reported packed compatibility `0`
  and low nibble `0`, its original state. Evidence:
  `round-11-automatic-selected-before-save.png`,
  `round-11-automatic-saved.png`, and
  `round-11-restored-packed-status.json` below
  `/tmp/Decky-Metadata/non-steam-compatibility-status/`.
- `./run.sh scripts/deck/verify/run_all.sh --no-launch` again passed the
  re-render and community checks, skipped the launch check, and failed only
  the existing delisted fixture's rich-metadata and matched-source Community
  layout assertions. The compatibility implementation does not touch those
  systems. Exact output:
  `/tmp/Decky-Metadata/non-steam-compatibility-status/round-11-run-all-no-launch.log`.
