# Compatibility status defaults

## Date

2026-09-07

## Objective

Implement the `compatibility-status-defaults` plan. Add a persisted global
compatibility default, retain per-game precedence, and add the explicit
`Follow Valve` per-game policy.

## Files changed

- `main.py` and `backend/storage.py`
- `src/types.ts`, `src/backend.ts`, `src/ContentPanel.tsx`, and
  `src/MetadataPage.tsx`
- `src/components/qam/MetadataSection.tsx`
- `src/steam.ts`, `src/steam/core.ts`, `src/steam/metadataPatch.ts`, and
  `src/steam/libraryCompatibilityIndicators.tsx`
- Backend and frontend tests for storage, resolver precedence, cache changes,
  QAM saves, library cards, and metadata editing
- `README.md`, `CHANGELOG.md`, `docs/specs/compatibility-status.md`, and
  `docs/runbooks/on-device-verification.md`
- `dist/index.js` and its generated source map

## Design decisions

- The persisted global value is a numeric category or `null` for Automatic.
  Invalid persisted values and invalid RPC input, including booleans, are not
  accepted as categories.
- Per-game numeric selections have first priority. `Follow Valve` uses only
  a provider category and does not inherit the global value. If provider data
  is unavailable, the plugin restores Steam's original value.
- The global setting is confirmed only after a successful backend save. A
  failed initial load or save leaves the existing runtime policy unchanged.
- Steam App ID removal or replacement clears the cached provider category but
  retains the explicit per-game policy. A later provider refresh also clears
  stale provider data when the provider has no category.
- One shared resolver serves metadata patches and library-card indicators.
  Default changes use one linear pass over native app overviews and do not
  create metadata records.

## Evidence and validation

### Routing and local validation

- `scripts/decky doctor` completed with only the expected dirty-worktree,
  cache, repository-local `node_modules`, and stale local-package warnings.
- `./run.sh scripts/decky verify-change dev --explain` identified the plan as
  a Steam UI change and required the standard local gate plus live-device
  verification before a device deployment.
- Focused frontend validation passed:
  `./run.sh npm test -- src/steam/metadataPatch.test.ts src/steam/libraryCompatibilityIndicators.test.tsx src/MetadataPage.test.tsx src/ContentPanel.updateSettings.test.tsx`
  (`4` suites, `134` tests).
- Focused backend validation passed:
  `./run.sh uv run --with pytest -- pytest -q tests/test_deck_compat.py tests/test_steam_appid_override.py`
  (`22 passed`).
- `./run.sh npx tsc --noEmit` passed before the final project gate.

### Mutation control and performance check

- In an isolated temporary worktree, changing `Follow Valve` to inherit the
  global category caused two `metadataPatch` failures: one showed the global
  category replacing the provider category, and one showed an unavailable
  provider category applying a policy instead of restoring Steam's baseline.
  The failing output is retained at
  `/tmp/Decky-Metadata/compatibility-status-defaults-mutation-control.log`.
- A temporary benchmark used the actual native-overview batch path for 1,000,
  5,000, and 10,000 mixed-policy records. Apply/restore timings were about
  `1.29/0.68 ms`, `2.36/2.25 ms`, and `3.67/4.63 ms`, respectively. The
  temporary worktree was removed. The successful benchmark record is
  `/tmp/Decky-Metadata/compatibility-status-defaults-benchmark.log`.

### Read-only Steam Deck preflight

- `./run.sh scripts/decky doctor --deck` passed Deck reachability and
  read-only state collection. It retained only local working-tree/cache and
  package warnings.
- `./run.sh scripts/decky capture` wrote
  `/tmp/Decky-Metadata/diagnostics/20260907T214037Z`.
- `./run.sh scripts/deck/logs.sh audit --json` synced current logs but reported
  historical fatal groups, including prior Steam DNS-resolution failures and
  existing plugin stack traces. No new bundle was deployed, so those records
  are not evidence about this change.
- No explicit authorization covered package push, plugin installation, setting
  writes, fixture creation or deletion, Steam UI reload, or on-device QAM and
  editor interaction. Those mutation steps and the device smoke suite were
  deliberately not run.

### Final project gate

- `./run.sh scripts/orchestration/run-quality-gates` passed. It ran the
  TypeScript check, regenerated the Rollup artifact, passed `27` Vitest files
  / `445` tests, passed Python byte-compilation and pytest, and reported
  `quality-gates: OK`.
- The wrapper also ran
  `scripts/orchestration/check-review-notes-not-deleted`, which reported
  `no deleted review notes`.

## Review round 02

### Corrections

- Added one shared plugin-lifetime generation. Late global-save acknowledgements,
  settings loads, metadata loads, and bootstrap ticks cannot apply policy after
  dismount. The mounted QAM subscribes to the shared confirmed-setting revision,
  so it recovers after an initial load error when bootstrap later succeeds.
- Restored bounded metadata-record retries during bootstrap and changed metadata
  refresh to resolve native shortcuts once per batch. Global-only baseline IDs
  no longer trigger one full library lookup each. A Follow Valve availability
  change now publishes a revision even when native packed bits already match,
  so mounted Home and grid badges update.
- Scan saves now preserve the latest numeric or Follow Valve choice under the
  data lock. Trusted scan data for a newly matched Steam App ID keeps its newly
  fetched category, while an editor reassignment still clears an old category.
- Provider lookups now distinguish failed/malformed responses from an
  authoritative no-category response. A same-match failure retains a valid
  cached category, including Unknown (0); no value transfers across matches.

### Red-to-green and local validation

- The review regressions first failed in
  `/tmp/Decky-Metadata/compatibility-status-defaults-round2-red-frontend.log`
  (7 failures) and
  `/tmp/Decky-Metadata/compatibility-status-defaults-round2-red-backend.log`
  (5 failures). Their focused replacements passed: 3 Vitest files / 106 tests
  and 27 pytest tests.
- `./run.sh scripts/orchestration/run-quality-gates` passed after the fixes:
  TypeScript, Rollup, 27 Vitest files / 452 tests, Python compilation, pytest,
  version drift, and review-note retention. Output:
  `/tmp/Decky-Metadata/compatibility-status-defaults-round2-quality-gates.log`.
- The 5,000-shortcut empty-refresh regression exercises the actual numeric
  global apply path followed by an empty metadata refresh. Ten focused runs
  passed with 6-10 ms test bodies; output is
  `/tmp/Decky-Metadata/compatibility-status-defaults-round2-empty-refresh-benchmark.log`.
  The adjacent delayed-overview bootstrap regression covers metadata-first
  arrival; the startup-default regression covers settings-first arrival. These
  checks prove the entry-based path without a timing-sensitive CI assertion.

### Authorized device validation and handoff

- The user authorization in review 01 covered the full device matrix. Fresh
  preflight passed Deck reachability and capture wrote
  `/tmp/Decky-Metadata/diagnostics/20260907T221401Z`. The log audit at
  `/tmp/Decky-Metadata/compatibility-status-defaults-round2-log-audit.log`
  reports historical DNS and older patch records before this build was installed.
- `./run.sh scripts/decky package-push --build --push` passed local archive
  validation, created and delivered `Decky-Metadata.zip` version
  `0.3.14+4581c88`, and reported `INSTALLED_STATE REINSTALL_REQUIRED`.
  `scripts/decky status --deck` confirms that the delivered local package
  represents `HEAD` and the Deck is reachable.
- The required `decky-local-zip-gui-install` skill is not available in this
  session and this repository exposes no supported unattended local-ZIP install
  command. Therefore the delivered ZIP is not installed yet. Do not claim the
  QAM/editor, fixture, teardown, filter, controller-focus, or launch-smoke
  checks passed; install `/home/deck/Downloads/Decky-Metadata.zip` with Decky
  Settings -> Developer -> Install Plugin from ZIP File, then run the authorized
  live matrix and restore fixtures/settings.

## Review round 03

### Corrections

- Editor saves now clear a provider category when a Steam match is removed,
  unless the caller explicitly supplies the same valid positive provider App
  ID. The per-game Follow Valve or numeric choice remains unchanged.
- A successful Valve response that omits `resolved_category` is malformed, not
  an authoritative no-category response. Same-match malformed responses retain
  a cached category, including Unknown (`0`); explicit `null` remains the
  authoritative no-category case.
- Route callbacks, per-app metadata fetches, screenshot enrichment, and
  Activity refreshes now capture the shared plugin lifecycle. A continuation
  that completes after dismount cannot mutate the cache, native overviews, or
  start another request. A later mount receives a new lifecycle and works
  normally.
- Every retained compatibility baseline participates in the existing one-pass
  refresh batch. A restoration that failed while an overview was read-only is
  retried by a later empty refresh without returning to per-shortcut full
  library scans.

### Red-to-green and validation

- New focused tests first failed as intended: five TypeScript failures in
  `/tmp/Decky-Metadata/compatibility-status-defaults-round3-vitest-red.log`
  and four Python failures in
  `/tmp/Decky-Metadata/compatibility-status-defaults-round3-pytest-red.log`.
  The Activity test's first post-fix attempt correctly exposed the existing
  15-minute refresh gate; its focused failure record is
  `/tmp/Decky-Metadata/compatibility-status-defaults-round3-activity-failure.log`.
  The revised test uses a fresh app on the later lifecycle instead of bypassing
  that production rate limit.
- Focused validation passed: 3 Vitest files / 52 tests and 32 backend tests
  across `tests/test_deck_compat.py` and `tests/test_steam_appid_override.py`.
- `./run.sh scripts/orchestration/run-quality-gates` passed after the
  corrections: TypeScript, Rollup, 27 Vitest files / 457 tests, Python
  compilation, pytest, and version-drift checking. Full output:
  `/tmp/Decky-Metadata/compatibility-status-defaults-round3-quality-gates.log`.
  `scripts/orchestration/check-review-notes-not-deleted` also passed.
- `./run.sh npm run package` produced the corrected local
  `Decky-Metadata.zip` with packaged version `0.3.14+8d5ab42`; package output
  is `/tmp/Decky-Metadata/compatibility-status-defaults-round3-package.log`.
  The archive remains local. Per review round 02, the orchestrator retains
  ownership of GUI installation and all live-device actions for this corrected
  package.

## Review round 04

### Correction

- The QAM root now takes its preferred summary focus only once per mounted
  panel. A temporary ref detach before that first focus frame can still retry
  initial focus. Later native ref attachments, including the global
  compatibility dropdown popup return and confirmed-setting refresh, leave
  focus on the launching dropdown. This keeps the existing native navigation
  mechanism and preserves the summary's initial focus on a fresh QAM entry.

### Red-to-green and validation

- The new focused regression first failed with the root ref scheduling
  preferred focus twice after reattachment; output:
  `/tmp/Decky-Metadata/compatibility-status-defaults-round4-focus-red.log`.
  The corrected focused test passed with 7 tests.
- `./run.sh scripts/orchestration/run-quality-gates` passed: TypeScript,
  Rollup, 27 Vitest files / 458 tests, Python compilation, pytest, and version
  checking. `./run.sh scripts/orchestration/check-review-notes-not-deleted`
  and `git diff --check` also passed. Full gate output:
  `/tmp/Decky-Metadata/compatibility-status-defaults-round4-quality-gates.log`.
- `./run.sh npm run package` produced the new local `Decky-Metadata.zip` with
  packaged version `0.3.14+cae8568`; output:
  `/tmp/Decky-Metadata/compatibility-status-defaults-round4-package.log`.
  It was not installed. The orchestrator retains all live Deck verification,
  fixture restoration, and final acceptance work.

### Post-review test correction and live boundary

- Removed the mock-only focus test from
  `src/ContentPanel.updateSettings.test.tsx`. It manually invoked a root ref
  and asserted animation-frame and `BTakeFocus` call counts without opening a
  dropdown or observing controller focus. No replacement unit test claims to
  prove the real QAM focus behavior; that check remains part of Main's live
  validation.
- No production change or package was made for this test-only correction.
- `./run.sh npm test -- src/ContentPanel.updateSettings.test.tsx` passed with
  `1` test file / `6` tests. The complete
  `./run.sh scripts/orchestration/run-quality-gates` pass reported `27` Vitest
  files / `457` tests, TypeScript, Rollup, Python compilation, pytest, and
  version checking. Review-note retention and `git diff --check` also passed.
- Main's live evidence root is
  `/tmp/Decky-Metadata/compat-defaults-live-4wys8ngy/`. The baseline file is
  `restricted/settings-before.json` with mode `0600`.
- The last confirmed installed version was `0.3.14+4581c88`. Installation of
  final `0.3.14+cae8568` was started through the GUI but was not confirmed
  after the Deck lost network connectivity.
- Before the connectivity failure, runtime checks passed for global
  inheritance, matched and unmatched Follow Valve, Valve Unknown, fixed
  Unsupported and Unknown, metadata removal, a late-added no-record shortcut,
  and unchanged regular Steam categories. A native-grid screenshot shows a
  green check on a focused inheriting card.
- The temporary global setting is Unsupported (`1`). App IDs `2312439508`,
  `3462906031`, and `3015223078` use Follow Valve; their original overrides
  were `null`, `null`, and `2`, respectively. The disposable native shortcut
  `3168609012` still displays as `true`: its test metadata was removed, but
  the native shortcut still requires removal. The original global baseline was
  Automatic because the key was absent.
- Restoration must change only these settings and fixtures. Do not replace the
  whole settings file, and verify the original shortcut set and compatibility
  values after restoration. Device connectivity, final install confirmation,
  corrected controller-focus behavior, final smoke checks, and restoration
  remain blocked; this implementer round has no device-action permission.

## Review round 05

### Correction

- The global dropdown now arms a module-scoped, one-shot return intent through
  its supported `onMenuWillOpen(showMenu)` lifecycle. It arms before invoking
  the native menu, so both selecting an option and cancelling the native popup
  take the same return path without changing the existing save callback.
- The QAM entry handoff consumes that intent before it tries native focus. It
  finds the dropdown's `button[role="combobox"]` in the returned QAM content
  and calls the established gamepad-navigation `BTakeFocus` path. It uses no
  raw DOM focus, timeout, or polling. While the intent is pending, the root
  does not select the preferred summary entry; a fresh QAM entry with no
  intent still starts at that summary.
- The intent clears when consumed and at both plugin lifecycle start and
  dismount. An unsuccessful native lookup therefore cannot direct a later,
  unrelated QAM entry to the global dropdown.

### Local validation and package handoff

- `./run.sh npm test -- src/ContentPanel.updateSettings.test.tsx
  src/components/qam/MetadataSection.test.tsx` passed: 2 files / 8 tests. The
  coverage observes initial-summary focus, a remounted popup return reaching
  the native combobox exactly once, a later fresh entry returning to the
  summary, and lifecycle ordering before the native menu opens.
- `./run.sh npx tsc --noEmit`, `git diff --check`, and the full
  `./run.sh scripts/orchestration/run-quality-gates` passed. The full gate
  regenerated the committed bundle, passed 28 Vitest files / 459 tests, and
  passed Python compilation and pytest. Review-note retention also passed.
- Commit `0a4ac3c` (`fix(qam): restore compatibility dropdown focus`) contains
  the code, tests, and regenerated bundle. `./run.sh npm run package` created
  `/home/beallio/Dropbox/Scripts/Decky-Metadata/Decky-Metadata.zip` with
  packaged version `0.3.14+0a4ac3c`.
- This round performed no Deck action. Main retains ownership of ZIP install,
  real select/cancel controller-focus validation, launch verification, and
  fixture/settings restoration.

## Review round 06

### Native popup return correction

- The global dropdown now only arms its module-scoped return state in
  `onMenuWillOpen`. Steam's native `ToggleMenu()` supplies the one `ShowMenu()`
  call, so the plugin no longer opens the popup twice.
- Return state distinguishes a native popup opening from a completed return.
  A control ref detach records the hidden QAM content, and the returned QAM
  document's `visibilitychange` to `visible` starts the cancel handoff. A
  successful global save separately starts the selection handoff after the
  backend has confirmed and rendered the new policy.
- Both paths use only the existing gamepad-navigation `BTakeFocus()` API. They
  wait through a bounded native render transition, require focus to remain on
  the combobox for three frames, then consume the return state. There is no
  DOM `.focus()`, `setTimeout`, or unbounded poll.
- Removed the rejected mock/ref tests from
  `src/ContentPanel.updateSettings.test.tsx` and
  `src/components/qam/MetadataSection.test.tsx`. The retained settings,
  persistence, error, and policy tests remain. Native menu return behavior is
  proved on the Deck instead of by test doubles.

### Local validation

- `./run.sh npm test -- src/ContentPanel.updateSettings.test.tsx` passed:
  1 Vitest file / 6 tests.
- `./run.sh npx tsc --noEmit` passed.
- `./run.sh scripts/orchestration/run-quality-gates` passed. It regenerated
  `dist/`, passed 27 Vitest files / 457 tests, Python byte-compilation,
  pytest, version checks, and review-note retention. Full output is
  `/tmp/Decky-Metadata/compatibility-status-defaults-round06-final-quality-gates.log`.

### Authorized focused Deck verification

- Frontend-only focus iterations used the review-authorized dedicated
  `CDP_PORT=18088` connection and `scripts/deck/deploy.sh`; no fixtures,
  metadata records, shortcuts, or unrelated plugin settings were changed.
- A fresh Decky Metadata entry focused the summary. A native popup cancel
  returned focus to `Automatic — use matched Steam status`. Selecting
  `Verified` returned focus to the `Verified` combobox. Selecting Automatic
  again returned focus to its combobox, and a later fresh entry again focused
  the summary. The final global value is Automatic.
- Screenshots are under
  `/tmp/Decky-Metadata/compatibility-status-defaults-round06-live/`, including
  `visibility-after-cancel.png`, `selection-saved-after-verified.png`,
  `long-selection-restored-automatic.png`, and
  `final-genuine-fresh-entry.png`. The controller focus dumps were captured
  with the committed `scripts/deck/cdp.py` and `js/gpfocus_dump.js` probes.
- The dedicated `18088` tunnel must be closed after the local ZIP handoff.

## Review round 07

### Mounted Game Info correction

- Reproduced the reported fault before validating the correction. From an
  isolated worktree at the committed pre-change bundle, the real QAM
  Automatic-to-Verified save for shortcut `2312439508` replaced the mounted
  Game Info content with Steam's non-Steam placeholder. The screenshot is
  `/tmp/Decky-Metadata/compatibility-status-defaults-round08-live/prechange-reproduced-automatic-to-verified.png`.
- Compatibility updates now keep the exact native `AppOverview` object in the
  app map. They mutate only its packed compatibility field, arm the existing
  route-scoped shield for the exact matched detail route, and publish one
  compatibility revision after the global batch. The mounted native Game Info
  component listens for that revision and re-renders in place, so its rich
  details state and the 64-bit shortcut identity remain intact.
- Added regressions for identity-preserving compatibility mutation and the
  mounted native Game Info refresh. The latter observes a real changed packed
  category while the same enriched overview remains attached; it does not pin
  source text or mock a dropdown flow.

### Authorized Deck validation and restoration

- Built and deployed the correction with `CDP_PORT=18088`. On the continuously
  selected Game Info tab for `2312439508`, Verified to Automatic changed the
  packed category from `15` to Valve Playable `10`, then Automatic to Verified
  changed it back to `15`. Description, developer, publisher, quick links,
  selected tab, and Steam Deck Compatibility content remained visible in both
  directions. Screenshots are in
  `/tmp/Decky-Metadata/compatibility-status-defaults-round08-live/`.
- Existing no-record shortcut `3245664592` (Heroic Games Launcher) changed
  from native `0` under Automatic to `15` under Verified and returned to `0`.
  The final restricted capture confirms `deck_compat_default: null`, 14
  metadata records, and no metadata record for that shortcut:
  `/tmp/Decky-Metadata/diagnostics/20260908T040224Z/`.
- `MATCHED_APPID=2312439508` passed both committed device suites. The full
  suite passed quick links, rerender churn, community fallback, and the real
  launch smoke with a 64-bit game ID. The no-launch suite also passed the
  controller-layout isolation check. Logs:
  `/tmp/Decky-Metadata/compatibility-status-defaults-round08-full-device-suite.log`
  and
  `/tmp/Decky-Metadata/compatibility-status-defaults-round08-nolaunch-device-suite.log`.
- The focused Vitest run passed 2 files / 50 tests. The project quality gate
  passed TypeScript, Rollup, 27 Vitest files / 459 tests, Python compilation,
  pytest, version checks, and review-note retention. Full output:
  `/tmp/Decky-Metadata/compatibility-status-defaults-round08-quality-gates.log`.
- Commit `445373d` (`fix(steam): preserve mounted game info on compatibility
  updates`) contains the correction, tests, and regenerated bundle.
  `./run.sh npm run package` produced
  `Decky-Metadata.zip` with version `0.3.14+445373d`.

## Review round 08

### Correction

- A compatibility revision now arms the existing route shield at the exact
  mounted native Game Info `forceUpdate()` boundary. This covers a global
  policy change even when Follow Valve or a fixed per-game category leaves the
  packed value unchanged. The existing in-call launch-truth priority remains
  unchanged.
- SteamUI document lookup is now shared by card and Game Info consumers. It
  searches the established SteamUI/webpack host bridge and its Main/Gamepad
  browser documents before Decky's local document. A Game Info instance that
  was mounted before the plugin hook can therefore be captured from the real
  Big Picture document without a navigation or remount.
- After each completed compatibility write batch, changed exact native
  shortcuts are again published through Steam's native `m_mapApps` with a
  constructor-valid replacement. This restores native compatibility-filter
  invalidation while preserving constructor-owned state, the exact shortcut
  AppID, and untouched official Steam entries. Packed writes complete before
  the first map publication, and one plugin revision follows the batch.

### Red-to-green and local package

- The new focused regressions failed before the correction: the pre-mounted
  split-document Game Info instance was not refreshed, and native map entries
  kept their original identity after a compatibility write. The fixed focused
  run passed `3` Vitest files / `109` tests. It covers Follow Valve and fixed
  exceptions after an expired shield, the real patched classification path,
  in-call launch truth, a pre-mounted Big Picture Game Info instance, and
  batched native publication with an unchanged official title.
- `./run.sh scripts/orchestration/run-quality-gates` passed: TypeScript,
  Rollup, `27` Vitest files / `460` tests, Python byte-compilation, pytest,
  version checks, and review-note retention. `git diff --check` and
  `scripts/orchestration/check-review-notes-not-deleted` also passed.
- Commit `1bc0a43` (`fix(steam): refresh native compatibility consumers`)
  contains the source, tests, shared bridge, and regenerated bundle.
  `./run.sh npm run package` produced the local
  `Decky-Metadata.zip` with version `0.3.14+1bc0a43` and SHA-256
  `6323d78e7f5603d3650c019a72acb35fc48b985d13d226bd02cb37b5149fe619`.

### Device handoff

- This correction round made no Deck call, package push, setting change,
  fixture change, navigation action, or device smoke run. Main retains device
  and power/network recovery ownership. The next live check must keep Great
  on Deck mounted for Automatic -> Verified -> Automatic and require native
  Verified shortcuts `4 -> 16 -> 4` with collection membership `34 -> 46 ->
  34`, while confirming the mounted Game Info, a Follow Valve exception, a
  fixed exception, and an ordinary Steam title remain correct.

## Review round 10

### Mounted observer-wrapped renderer discovery

- Read the live renderer evidence at
  `/tmp/Decky-Metadata/resumed-native-gameinfo-renderers.json`. The observed
  native Game Info class has an observer-wrapped `prototype.render`, so its
  wrapper source lacks the semantic fingerprint while `String(class)` retains
  both `BIsModOrShortcut` and `GetDescriptions`.
- Compatibility revision subscription now starts independently of module
  discovery. Renderer identification retains the React-class and semantic
  checks, first tests the render source, then uses the cached full-class source
  fallback. A bounded scan of real Big Picture document `div` fibers captures
  the mounted class even when the compatibility heading is absent in Steam's
  placeholder view. It follows only explicit DOM and fiber-return links.
- Once captured, the class receives mount/unmount lifecycle tracking. Cleanup
  cancels retries, unsubscribes the revision callback, unpatches lifecycle
  hooks, and drops captured instances. No compatibility policy, native filter,
  launch-truth, or controller-focus behavior changed.

### Local validation and package handoff

- The requested behavioral regression was red before the correction:
  `/tmp/Decky-Metadata/routerPatches-round10-red.log` records that a
  module-finder miss and observer-wrapped renderer left the mounted Game Info
  placeholder unchanged. The fixed focused command,
  `./run.sh npm test -- src/steam/routerPatches.test.ts`, passed 1 Vitest file
  / 6 tests. It proves a heading-free real-document fiber capture updates the
  rendered content and category through the normal revision path and that
  cleanup detaches that subscription.
- `./run.sh scripts/orchestration/run-quality-gates` passed. It regenerated
  `dist/`, passed TypeScript, Rollup, 27 Vitest files / 461 tests, Python
  byte-compilation, pytest, version checks, and review-note retention. Full
  output: `/tmp/Decky-Metadata/compatibility-status-defaults-round10-quality-gates.log`.
  `git diff --check` and `scripts/orchestration/check-review-notes-not-deleted`
  also passed.
- Commit `d134ea4` (`fix(steam): discover mounted game info renderer`) contains
  the focused source, test, and regenerated bundle. `./run.sh npm run package`
  produced `Decky-Metadata.zip` with version `0.3.14+d134ea4` and SHA-256
  `59b68e0cfe6caadf0f4a9f8ead5cc9de1edef317349071005f4c3bab5244621c`.
- This correction round made no Deck connection, deploy, installation,
  navigation, fixture, settings, or shortcut mutation. Main retains device
  ownership for the next full-ZIP validation: mounted Game Info recovery from
  the placeholder, unchanged Follow Valve and numeric exceptions, pre-mounted
  reload behavior, and native collection checks.

## Review round 11

### Native-publication frame handoff

- The compatibility revision listener now coalesces work into one animation
  frame from the real Steam browser document returned by the shared SteamUI
  bridge. It does not capture a Game Info instance or arm the route shield
  until that frame runs. The existing refresh then captures the current
  mounted native renderer, verifies its native shortcut and active route,
  arms the existing shield, and calls its native update method.
- Cleanup cancels an outstanding frame through its owning browser window,
  clears both frame references, then retains the existing unsubscribe,
  lifecycle-unpatch, and mounted-instance cleanup. No fixed delay, polling,
  filter-publication, category-policy, or device behavior was added.

### Red-to-green and local package handoff

- The requested regression was red before the correction:
  `/tmp/Decky-Metadata/routerPatches-round11-red.log` records that the old
  revision listener did not defer a native Game Info refresh. The focused
  command `./run.sh npm test -- src/steam/routerPatches.test.ts` passed 1
  Vitest file / 7 tests. Its replacement-view case sends Verified then
  Playable revisions before native publication, replaces the visible native
  instance, and verifies the rendered Game Info result is Playable after the
  one queued main-window frame.
- `./run.sh scripts/orchestration/run-quality-gates` passed: TypeScript,
  Rollup, 27 Vitest files / 462 tests, Python byte-compilation, pytest,
  version checks, and review-note retention. Full output is at
  `/tmp/Decky-Metadata/compatibility-status-defaults-round11-quality-gates.log`.
  `git diff --check` passed before the gate.
- `./run.sh npm run package` produced the local `Decky-Metadata.zip` with
  version `0.3.14+2991f79` and SHA-256
  `f50efb52930c3198ee0ce987ebaa823a95c004fe6b4eb1da17bae611a686f746`.
  Commit `0139c86` (`fix(steam): defer native compatibility refresh`) contains
  the source, regression, and regenerated bundle.
  This round made no Deck connection, deployment, installation, setting,
  fixture, navigation, or device smoke run. Main retains all live validation.

## Review round 12

### Reload-lifetime correction

- A Decky Loader in-place import now retains the original compatibility
  baselines across the old module's dismount. The replacement module adopts
  them before it loads the persisted default, so an unchanged setting does not
  create another synthetic `AppOverview` publication. A failed replacement
  import restores the retained baselines.
- Retained Game Info fibers now reject a `forceUpdate` when their overview is
  no longer the current native map entry. Retained quick-link wrappers delegate
  to the current module lifetime rather than nesting wrappers or mutating a
  mounted React element during teardown.
- A changed packed compatibility value on the selected Game Info object is
  rendered through the existing native-frame handoff, but its observable-map
  replacement is deferred until a real history transition leaves that app. The
  deferred transition still publishes the native map entry, so Steam's filter
  consumers receive their invalidation without replacing the object below a
  selected renderer.
- When an installed plugin decorates `m_mapApps.set` and exposes its native
  setter as `originalSet`, Decky Metadata uses that native setter only for its
  fully copied synthetic replacement. This avoids replaying a foreign
  decorator's side effects while retaining the native map publication.

### Red-to-green and validation

- New regressions cover a retained quick-link wrapper, a stale Game Info fiber,
  publication through a preserved native setter, retained baseline adoption,
  and deferring the active Game Info map replacement until navigation. The
  focused command passed 2 Vitest files / 57 tests. The full quality gate
  passed TypeScript, Rollup, 27 Vitest files / 466 tests, Python compilation,
  pytest, and review-note retention.
- Authorized Deck testing used the dedicated `CDP_PORT=18088` connection and
  frontend-only deploy loop. On shortcut `2312439508`, two consecutive
  Automatic -> Verified -> Automatic retained-reload cycles remained
  responsive. The selected Game Info tab showed the expected category while
  retaining rich details, Store Page, Community Hub, Discussions, and Guides.
  The final restored global value is Automatic.
- The active Automatic Game Info map object remained in place while selected.
  After navigation to Library Home, the deferred native map publication
  replaced that exact object with packed category `10`; returning to Game Info
  remained Playable with all rich content intact.
- `MATCHED_APPID=2312439508 scripts/deck/verify/run_all.sh` passed quick
  links, rerender churn, community fallback, and the real launch smoke with a
  64-bit game ID. The matching `--no-launch` suite passed those checks plus
  controller-layout isolation. Evidence is under
  `/tmp/Decky-Metadata/verification/20260908T232102Z/`; recovery captures are
  `/tmp/Decky-Metadata/diagnostics/20260908T231238Z` and
  `/tmp/Decky-Metadata/diagnostics/20260908T231605Z`.
- Commit `bd383f3` (`fix(steam): preserve compatibility reload state`) contains
  the correction, regressions, generated bundle, and this implementation
  record. `./run.sh scripts/decky package-push --build --push` created and
  delivered `Decky-Metadata.zip` version `0.3.14+bd383f3`; archive validation
  passed and the Deck reports `REINSTALL_REQUIRED` for the delivered local ZIP.

## Review round 13

### Active Game Info deferral

- The approved behavior now holds the active native Game Info object's packed
  compatibility nibble. It no longer changes that object and then delays only
  the observable-map publication. Other eligible native shortcuts still update
  in the same confirmed policy batch.
- Pending work is keyed by exact native shortcut App ID and stores only the
  held nibble. On a real Game Info exit it resolves the current overview and
  current policy. A direct history callback location wins over stale joined
  route tokens. Closing QAM or a context-menu overlay remains on Game Info;
  opening the metadata editor releases pending work, and its later explicit
  Save takes priority.
- Incoming native overview replacement preserves the held nibble. Pending work
  is retained with compatibility baselines across an in-place reload and is
  cleared on a real plugin teardown before baselines restore. The retired
  mounted-renderer frame refresh was removed because this policy does not need
  an active-view force update.

### Local evidence and package handoff

- The new held-status regression failed before the change with the active
  shortcut changed from `0xa0` to `0xaf`. The focused metadata suite now has
  54 passing tests. It covers other shortcuts updating immediately, repeated
  choices collapsing to the latest policy, editor-exit precedence, incoming
  native replacement, reload reconstruction, and real-teardown cancellation.
- `./run.sh scripts/orchestration/run-quality-gates` passed TypeScript, Rollup,
  27 Vitest files / 467 passing tests, Python compilation, pytest, version
  checks, and review-note retention. The full output is
  `/tmp/Decky-Metadata/compatibility-status-defaults-round13-quality-gates.log`.
- Deck reachability, log audit, and capture ran before packaging. The audit
  contains historical network and older patch errors; it is retained at
  `/tmp/Decky-Metadata/compatibility-status-defaults-round13-log-audit.json`.
  `./run.sh scripts/decky package-push --build --push` built and delivered
  `Decky-Metadata.zip` version `0.3.14+8c1571c` and reported
  `INSTALLED_STATE REINSTALL_REQUIRED`.
- The full local ZIP install requires Decky Settings -> Developer -> Install
  Plugin from ZIP File confirmation. The required local-ZIP GUI installer skill
  is not available in this session, so this candidate is delivered but not
  installed. The live active-view, reload, collection/filter, controller, and
  launch checks remain unrun; no fixture or user setting was changed.

## Review round 14

### Active replacement and route-context corrections

- An incoming native overview now keeps the active Game Info view's held low
  compatibility nibble even when the current effective policy already equals
  that held state and no deferred exit flush is needed. The incoming object's
  higher packed bits and exact native App ID remain unchanged.
- A replacement native overview found after an in-place reload now receives an
  adopted pending held nibble in place. The pending policy still waits for a
  real Game Info exit, and this reconciliation does not publish another active
  `m_mapApps` identity.
- History-listener route context now joins the callback's pathname, search, and
  hash. A query or hash-selected Game Info tab remains protected; a real
  different-tab event releases the pending update without consulting stale
  browser route tokens.

### Red-to-green and local package handoff

- The new focused regressions failed before the correction with four failures:
  repeated global changes that return to the held state, numeric Unknown on an
  incoming replacement, reload adoption after a native replacement, and a
  query/hash Game Info history event. Output:
  `/tmp/Decky-Metadata/compatibility-status-defaults-round-14-red.log`.
- The corrected focused run passed `2` Vitest files / `61` tests (`4` existing
  skips):
  `/tmp/Decky-Metadata/compatibility-status-defaults-round-14-targeted.log`.
- `./run.sh scripts/orchestration/run-quality-gates` passed TypeScript, Rollup,
  `27` Vitest files / `470` passing tests, Python byte-compilation and pytest,
  plus version-drift checking. The review-retention audit reported `no deleted
  review notes`. Output:
  `/tmp/Decky-Metadata/compatibility-status-defaults-round-14-quality-gates.log`
  and `/tmp/Decky-Metadata/compatibility-status-defaults-round-14-review-audit.log`.
- `./run.sh npm run package` produced the local, ignored
  `Decky-Metadata.zip` with version `0.3.14+5bd9551` and SHA-256
  `ac07ed5c4e79b23618e7da7c99198e3d0d08de754e37a6f06caf670929e158a8`.
  Package output is
  `/tmp/Decky-Metadata/compatibility-status-defaults-round-14-package.log`.
  This correction round made no Deck connection, deployment, installation,
  fixture, setting, navigation, merge, push, release, or history rewrite.

## Review round 15

### Retained held-state collapse after reload

- Both native-overview paths now capture the authoritative held compatibility
  nibble before queueing an active Game Info update. If the latest policy
  returns to that held state, queue collapse can remove the pending entry
  without letting a replacement object's native low nibble replace the held
  value.
- Regressions cover an in-place reload replacement and an incoming protobuf
  replacement. In each case, retained Playable (`0xa`) is restored over a
  replacement's native `0` nibble, and leaving Game Info does not replay a
  stale update.

### Verification and package handoff

- The two new focused regressions failed before the correction: both observed
  replacement packed value `0x70` instead of the retained `0x7a`. After the
  correction, `./run.sh npm test -- src/steam/metadataPatch.test.ts` passed
  `57` tests. The red-to-green run is recorded in this session transcript.
- `./run.sh scripts/orchestration/run-quality-gates` passed TypeScript, Rollup,
  `27` Vitest files / `471` passing tests (`4` existing skips), Python
  byte-compilation, pytest, version checks, and review-note retention. Logs:
  `/tmp/Decky-Metadata/compatibility-status-defaults-round-15-quality-gates.log`
  and `/tmp/Decky-Metadata/compatibility-status-defaults-round-15-review-audit.log`.
- Commit `0a4f385` (`fix(steam): retain held compatibility on reload`) was
  packaged locally. `./run.sh npm run package` produced ignored
  `Decky-Metadata.zip`, version `0.3.14+0a4f385`, SHA-256
  `fade56f498d3bfdcf45e5b3f07cb9c7c6057b8b20394be613abdca34e6278e6e`.
  Output: `/tmp/Decky-Metadata/compatibility-status-defaults-round-15-package.log`.
  This correction made no Deck connection, deployment, installation, fixture,
  setting, navigation, merge, push, release, or history rewrite.

## Review round 16

### Editor return rendering correction

- A completed editor Save already applied the correct native packed category,
  but Game Info could render Steam's non-Steam placeholder on return. The
  history re-entry shield was armed for the exact Game Info destination, then
  ignored because joined Steam route tokens still contained the metadata-editor
  route.
- `canRecoverStaleGameDetailRoute()` now permits that shield only when its
  target is the exact same app's Library detail route and no current token
  explicitly names Home, a controller page, a collection, or another game.
  Generic route templates cannot recover stale tokens. The existing in-call
  truth window still wins, and ordinary outside-detail calls keep their native
  shortcut result.
- The focused regression models editor Save applying Unsupported, Done using
  the patched history `goBack()`, stale editor tokens during the first native
  renderer call, and a rich matched Game Info result with Unsupported retained.
  Existing Home and controller tests retain their fail-closed, unspent-shield
  boundary.

### Red-to-green and local package handoff

- Before the correction, the focused stale-editor renderer regression failed
  with `non-Steam placeholder` instead of `rich matched Game Info`:
  `/tmp/Decky-Metadata/round16-regression-failure.log`.
- The focused run passed `3` Vitest files / `80` tests (`4` existing skips):
  `./run.sh npm test -- src/steam/metadataPatch.test.ts
  src/steam/routerPatches.test.ts src/steam/spoofDecision.test.ts`.
- `./run.sh scripts/orchestration/run-quality-gates` passed TypeScript,
  Rollup, `27` Vitest files / `473` passing tests (`4` existing skips), Python
  byte-compilation, pytest, version checks, and review-note retention. Output:
  `/tmp/Decky-Metadata/compatibility-status-defaults-round16-quality-gates.log`.
- `./run.sh npm run package` produced the ignored local
  `Decky-Metadata.zip`, version `0.3.14+a7ce0aa`, SHA-256
  `43404646ad5dd42855a91a3f0160ac12c8e85cd7f7562be47ce9b8e903fcba56`.
  Output: `/tmp/Decky-Metadata/compatibility-status-defaults-round16-package-final.log`.
  This correction made no Deck connection, deployment, installation, fixture,
  setting, navigation, integration, push, release, or history rewrite.

## Review round 17

### Editor-return publication race

- A confirmed editor Save updates the correct packed compatibility value, but
  publishing a replacement into `m_mapApps` while the editor route is still
  current lets Steam synchronously classify that replacement as a shortcut.
  The editor now writes the native value and refreshes the plugin's
  compatibility surfaces without publishing that replacement from any of its
  save, Steam App ID, fetch, or remove paths.
- The route-render hook also renewed a return shield with a Decky route
  template such as `/library/app/:appid`. That template cannot pass the
  exact-app recovery check, so it could overwrite a concrete history shield
  during the first Game Info render. It now renews the shield with the actual
  shortcut App ID.
- The regression exercises the observed order: an editor Save changes the
  native status to Unsupported, `NavigateBack` enters Game Info while the
  browser still reports the editor route, the real route-render hook runs,
  and the first native identity check must retain rich matched Game Info.
  Before the concrete shield fix it failed with `non-Steam placeholder`; the
  test also fails if an editor save publishes the native map replacement.

### Validation and package handoff

- Focused editor/Steam validation passed:
  `./run.sh npm test -- src/MetadataPage.test.tsx src/steam/metadataPatch.test.ts src/steam/routerPatches.test.ts`
  (`3` files, `98` passing tests, `4` existing skips). The plan's broader
  focused frontend run passed `4` files / `156` tests, and the focused backend
  run passed `32` tests.
- `./run.sh scripts/orchestration/run-quality-gates` passed TypeScript,
  Rollup, `27` Vitest files / `473` passing tests (`4` existing skips), Python
  byte-compilation, pytest, version checks, and review-note retention. Output:
  `/tmp/Decky-Metadata/compatibility-status-defaults-round17-quality-gates.log`.
- `./run.sh npm run package` produced the ignored local
  `Decky-Metadata.zip`, version `0.3.14+bdf0248`. Output:
  `/tmp/Decky-Metadata/compatibility-status-defaults-round17-package.log`.
- Per review 17, no Steam Deck, SSH, debugger, deployment, installation,
  fixture, setting, or navigation command ran. Main retains the documented
  fixture baseline restoration and next live validation once connectivity is
  available.

## Review round 18

### Editor-return collection publication

- Editor-originated compatibility writes still update the exact native overview
  immediately, but now retain one publication request until the matching Game
  Info route-render callback has armed its concrete return shield. That callback
  then replaces the native `m_mapApps` entry once, so Steam compatibility
  collections observe the update without classifying the returning view as a
  non-Steam placeholder.
- The request is app-ID keyed, retries if the observable map is temporarily
  unavailable, survives an in-place reload, and is cleared on real teardown.
  A missing native overview or an official alias is discarded rather than
  recreated. This keeps a confirmed editor choice authoritative while retaining
  the existing route, launch-identity, and cross-game guards.
- The route-transition regression now proves both halves in the real order:
  the first return render remains rich matched Game Info with Unsupported, and
  its preserved native map setter receives exactly one replacement. The new
  assertion first failed with zero publications, recorded in
  `/tmp/Decky-Metadata/compatibility-status-defaults-round18-tdd-failure.log`.

### Validation and package handoff

- `./run.sh npx tsc --noEmit` passed. The focused editor and compatibility run
  passed `3` Vitest files / `98` tests (`4` existing skips):
  `./run.sh npm test -- src/steam/metadataPatch.test.ts
  src/steam/routerPatches.test.ts src/MetadataPage.test.tsx`.
- `./run.sh scripts/orchestration/run-quality-gates` passed TypeScript, Rollup,
  `27` Vitest files / `473` passing tests (`4` existing skips), Python
  byte-compilation, pytest, and version checks. The independent review audit
  reported `no deleted review notes`. Logs:
  `/tmp/Decky-Metadata/compatibility-status-defaults-round18-quality-gates.log`
  and `/tmp/Decky-Metadata/compatibility-status-defaults-round18-review-audit.log`.
- `./run.sh npm run package` produced the ignored local
  `Decky-Metadata.zip`, version `0.3.14+bc9a72e`, SHA-256
  `9ecad00434285176cd93348c6e96b90dde8005a0c4f312bd5fc45154ceb6e86f`.
  Output: `/tmp/Decky-Metadata/compatibility-status-defaults-round18-package.log`.
  Per review 18, no Steam Deck, SSH, debugger, deployment, installation,
  fixture, setting, or navigation command ran.

## Review round 19

### Editor-route render identity

- The confirmed live failure did not replace the native observable-map entry.
  It occurred when a packed compatibility write re-rendered the still-mounted
  Game Info tree while its exact `/decky-metadata/<appid>` editor route was
  current. The generic Library-detail predicate rejected that route, so Steam
  rendered the native non-Steam placeholder for that mounted tree.
- `isCurrentMatchedRenderRoute()` now has a deliberately separate editor-route
  branch. It accepts only the exact editor route for the same shortcut, and
  rejects a different app, an unmatched shortcut, extra editor path segments,
  and joined conflicting route tokens. `isCurrentGameInfoRoute()` remains
  unchanged for compatibility deferral, so entering the editor still releases
  the held update and a later editor Save remains authoritative.
- The red-to-green regressions cover a packed-changing editor save retaining
  the matched render identity, plus distinct and unmatched shortcuts retaining
  native identity. The existing deferred-update test continues to cover editor
  exit and latest-editor-choice precedence. The new tests initially failed:
  nine absent-predicate assertions and two editor-identity assertions;
  after the change, `./run.sh npx vitest run src/steam/core.test.ts
  src/steam/spoofDecision.test.ts src/steam/metadataPatch.test.ts` passed
  `3` files / `119` tests.

### Validation and package handoff

- `scripts/orchestration/run-quality-gates` passed TypeScript, Rollup,
  `27` Vitest files / `484` passing tests (`4` existing skips), Python
  byte-compilation, pytest, version checks, and the independent review-retention
  audit (`no deleted review notes`). Output:
  `/tmp/Decky-Metadata/compatibility-status-defaults-round-19-quality.log`.
- Commit `b807338` (`fix(steam): preserve editor route identity`) was packaged
  locally. `./run.sh npm run package` produced the ignored
  `Decky-Metadata.zip`, version `0.3.14+b807338`, SHA-256
  `71547dc8b04524b6ba4a1f3b4745075a696fc865b353fced991f7cefff966802`.
  Output: `/tmp/Decky-Metadata/compatibility-status-defaults-round19-package.log`.
  Per review 19, no Steam Deck, SSH, debugger, deployment, installation,
  fixture, setting, navigation, integration, push, release, or history rewrite
  command ran.
