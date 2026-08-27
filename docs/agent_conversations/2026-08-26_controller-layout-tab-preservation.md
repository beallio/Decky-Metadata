# Controller layout tab preservation

## Date

2026-08-26 to 2026-08-27

## Objective

Implement `controller-layout-tab-preservation`: retain the currently selected
controller-layout chooser tab when the verified Legion Go S type `102` toggles
Show All for a matched non-Steam shortcut. Steam's native default remains in
control for fresh chooser queries and for every other device/context.

## Files changed

- `src/steam/controllerTabPersistence.ts`
- `src/steam/controllerTabPersistence.test.ts`
- `src/steam/controllerLayouts.ts`
- `src/steam/controllerLayouts.test.ts`
- `scripts/deck/js/check_controller_tab_persistence.js`
- `scripts/deck/verify/smoke_controller_tab_persistence.sh`
- `tests/test_deck_fixture_selection.py`
- `docs/runbooks/on-device-verification.md`
- `docs/agent_conversations/2026-08-26_controller-layout-tab-preservation.md`
- `README.md`
- `CHANGELOG.md`
- generated `dist/index.js` and `dist/index.js.map`

## Design decisions

- The new controller-tab module is independent of the layout merge/search
  policy. It discovers a webpack module only when a sibling header function
  contains `activeTab`, `tabs`, and `onShowTab`, and then swaps the exact own,
  writable/configurable memo `type` descriptor. Discovery remains lazy so a
  chooser chunk loaded after plugin startup can be patched by a later direct
  input query.
- The render wrapper scopes itself to the chooser's `Community` and `Search`
  tab-content app ID/controller index, a matched non-Steam context, and
  controller type `102`. It recognizes Steam's generated tab-ID prefixes while
  preserving exact IDs. The static `Templates` tab is deliberately allowed to
  have no app context, matching the live chooser shape. It wraps `onShowTab`
  with the original receiver, arguments, return value, and error behavior,
  recording only an available tab ID. A missing remembered tab is deleted rather
  than invented.
- The input wrapper samples `BConfigurationQueryInFlight` before Steam's native
  call. A store-driven query clears the matching memory; a direct filter query
  preserves it. Both query origins attempt lazy tab installation before the
  store-driven path clears its exact key, so the first chooser render can capture
  the user's initial selection. Tab discovery, rendering, and cleanup failures
  are optional/fail-open and cannot trip the existing controller-layout
  disable/toast path.
- The permanent smoke is intentionally separate from `run_all.sh`. It uses the
  real chooser tab DOM plus the SharedJSContext input/cache boundary, emits only
  scalar state and hashed identities, restores the visible filter and original
  tab, and contains no preview, selection, apply, launch, route, controller
  input, raw URL, or account-data operation.

## Baseline and device evidence

- `scripts/decky doctor` passed required local checks with its expected cache
  and local-package warnings. `scripts/decky verify-change dev --explain`
  routed the initial plan commit to the quality gate and passed it: 19 Vitest
  files / 225 tests and the Python suite.
- The same current `dev` bundle was deployed successfully to both dedicated
  ports before source edits. On the Steam Deck shortcut `2155012430`, controller
  index `15`, type `4`, selected Community Layouts stayed selected across the
  direct unfiltered query. On Legion shortcut `3213262460`, index `0`, type
  `102`, the same direct query set the visible filter to `false` and reset the
  chooser from Community Layouts to Your Layouts. Reselecting Community rendered
  52 DOM layout cards on both hosts. The Legion SharedJSContext getter returned
  50 current source identities, while its rendered view contained the two
  shortcut records plus that source set. Both filters and their original tabs
  (Steam Deck Your Layouts; Legion Templates) were restored; both baseline
  tunnels were closed.
- For review-02 both hosts returned to service and the rebuilt bundle was
  deployed before final capture. An early navigation attempt selected the first
  duplicate Space Marine shortcut returned by Steam search, which belonged to
  the other host; the strengthened probe now checks the active store app ID, and
  that discarded attempt was not used as evidence. The final captures used
  Legion shortcut `3213262460` / controller index `0` / type `102` and Steam
  Deck shortcut `2155012430` / controller index `15` / type `4`.
- Both final typed smokes passed with Community selected before and after the
  direct filter query. Legion rendered `14` then `52` cards, and Steam Deck
  rendered `23` then `52`; both getters reported `52` after the query. Both
  restored the filter to `true` and restored Community. Steam mutated its
  displayed cache entry in place rather than replacing its identity on both
  hosts (`cacheMutated: true`, `cacheReplaced: false`), so the probe accepts
  either observable completion form. Legion's pre-query hashes remained in its
  expanded result; Steam Deck's native type-4 filter returned a non-monotonic
  hash set, which is recorded but not treated as a preservation failure.
- Safe final evidence and before/after screenshots live below
  `/tmp/Decky-Metadata/controller-layout-tab-preservation/`: `legos.json`
  (`12fd9a6026bdb37baf35f3f4ca65406219c407d2546132b31771d54138fb9625`),
  `steamdeck.json`
  (`e93042cfe5cc034bcc72cb6353995b82198390a685e1272d09a89fe7b92d9fcd`),
  `legos-final-proof-community-{before,after}.png`,
  `steamdeck-final-proof-community-{before,after}.png`, and the matching
  `*-final-proof-smoke.log` files. No account data, raw URLs, selection,
  preview, apply, export, save, route, or launch action was included.
- `scripts/deck/verify/run_all.sh --no-launch` was also rerun using unique
  `DECKY_VERIFY_RUN_ID` values to prevent its shared default staging path from
  colliding across the two simultaneous hosts. Legion passed rerender, Community,
  and controller-layout checks but retained the unrelated quick-links fixture
  failure `developer metadata missing from a Game Info page`. Steam Deck passed
  rerender and Community but retained unrelated quick-links `delisted game lost
  rich metadata` and controller-layout `delisted matched source Community
  results are empty` fixture failures. These pre-existing fixture outcomes are
  isolated in `legos-run-all-no-launch-final.log` and
  `steamdeck-run-all-no-launch-final.log`; they do not alter the dedicated typed
  smoke result.

## Red, green, and mutation evidence

- The initial typed seam avoided a missing-module red result. The completed red
  Vitest run recorded six named behavior failures (chooser key, structural memo
  target, active-tab capture/restore, direct-query preservation, callback-throw
  memory, and lazy installation) in
  `/tmp/Decky-Metadata/controller-layout-tab-preservation/red-vitest-full.log`.
  The probe contract red run failed on the required `DISPLAY_APPID` field, not
  syntax or a missing file, in
  `/tmp/Decky-Metadata/controller-layout-tab-preservation/red-probe-safety.log`.
- Review-01 red tests failed as intended: a fresh store query did not install
  the tab wrapper (2 named Vitest failures) and the old probe/smoke contract
  lacked the required serialized payload/completion contract. Outputs are
  `review-01-red-vitest.log` and `review-01-red-probe.log` below
  `/tmp/Decky-Metadata/controller-layout-tab-preservation/`.
- The corrected focused positive control passed 2 Vitest files / 85 tests and
  the fixture safety file's 11 tests; outputs are
  `review-01-focused-green-vitest.log` and
  `review-01-focused-green-pytest.log` below
  `/tmp/Decky-Metadata/controller-layout-tab-preservation/`. The probe test
  runs the emitted query phase with a delayed displayed-cache replacement and
  proves the bounded missing-completion timeout.
- Mutation controls were restored without committing them:
  - removing store-driven installation produced 2 named first-render failures
    in `review-01-mutation-store-install.log`;
  - forcing direct filter queries to clear memory produced 3 named preservation
    failures in `review-01-mutation-direct-clears.log`;
  - suppressing remembered `activeTab` substitution produced 3 named remount
    restoration failures in `review-01-mutation-active-tab-substitution.log`;
  - changing the type scope from `102` to `4` produced 7 failures, including
    the Steam Deck native-pass-through contract, in
    `review-01-mutation-type-four-scope.log`.
- Review-02 mutation controls were also restored without committing them:
  - making every query clear memory produced 3 named direct-query preservation
    failures in `review-02-mutation-direct-clears.log`;
  - suppressing remembered `activeTab` substitution produced 4 named remount
    restoration failures in `review-02-mutation-active-tab-substitution.log`;
  - changing the type scope from `102` to `4` produced 11 failures, including
    Steam Deck native pass-through, in
    `review-02-mutation-type-four-scope.log`.
- The review-02 focused green control passed 2 Vitest files / 88 tests and the
  fixture safety file's 13 tests in `review-02-focused-green.log` and
  `review-02-fixture-green.log`. The permanent full quality gate was rerun
  after the restored controls and documentation changes.
- `./run.sh bash -n scripts/deck/verify/smoke_controller_tab_persistence.sh`,
  `./run.sh node --check scripts/deck/js/check_controller_tab_persistence.js`,
  and `./run.sh scripts/orchestration/run-quality-gates` passed after the
  restored controls. The full gate regenerated both committed bundle artifacts
  and passed TypeScript, Rollup, 20 Vitest files / 250 tests, Python
  byte-compilation, the full pytest suite, and the review-note deletion check.

## Explicitly unverified

- Layout preview, selection, application, and game launch remain untested by
  design. Types other than `4` and `102`, physical multiple-controller switching,
  hot-plug behavior, and webpack shapes outside the structurally tested current
  build remain unit-only/fail-open.

## Review-03 correction and evidence (2026-08-27)

- Tab scoping now removes only Steam's observed generated `«r…»` prefix and
  accepts the exact semantic IDs `Templates`, `Community`/`Community Layouts`,
  and `Search`. It rejects misleading suffixes such as `mytemplates`,
  `notcommunity`, and `research`; it remains covered for observed `«r7e»` and
  `«r99»` prefixes.
- The permanent query probe no longer accepts an arbitrary cache change. After
  a cache mutation it requires an expanded Community getter result and three
  consecutive stable cache/getter/hash samples before allowing the DOM settle
  phase. A read-only `capture-filter` phase arms cleanup before the direct
  query, and the shell atomically overwrites supplied evidence with `started`
  before its first probe so an old `passed` file cannot survive an early error.
- Focused restored controls passed `2` Vitest files / `93` tests and the
  fixture/probe file's `17` tests. Syntax checks passed for the probe and smoke.
  The final local gate in `review-03-quality-gates.log` passed TypeScript,
  Rollup, `20` Vitest files / `258` tests, Python byte-compilation, and the
  review-note integrity check; the matching explicit final Python run in
  `review-03-final-pytest.log` passed `410` tests.
  The deliberate, uncommitted mutations all failed as required: broad
  tab-suffix matching (1 failure), direct-query memory clearing (3), suppressed
  active-tab substitution (4), type-`4` scope (12), one-sample query completion
  (3 fixture failures), unarmed filter cleanup (transport restoration failure),
  and a premature `passed` evidence state (transport and stale-evidence failures).
  Outputs are `review-03-{red-tab-signature,red-probe-contracts,focused-green-vitest,focused-green-pytest,mutation-*}.log` below
  `/tmp/Decky-Metadata/controller-layout-tab-preservation/`.

### Current-device execution record

Both device doctors were reachable and reported only the expected dirty-worktree,
cache-policy, repository-local-node-modules, and stale-local-package warnings:

```bash
DECKY_DECK_HOST=steamdeck-legos scripts/decky doctor --deck
DECKY_DECK_HOST=steamdeck scripts/decky doctor --deck
DECKY_DECK_HOST=steamdeck-legos CDP_PORT=18082 scripts/deck/deploy.sh
DECKY_DECK_HOST=steamdeck CDP_PORT=18083 scripts/deck/deploy.sh
```

The first Legion deploy revealed a TypeScript inference diagnostic in the new
tab set; it was corrected before the final successful deployments above. The
final corrected bundle was pushed and hard-reloaded on both dedicated ports.

The current chooser route could not be established with the committed no-launch
tooling after those reloads. Both typed smoke commands stopped in `dom-select`
with `chooser tab unavailable: Community Layouts`, before the direct query or
visible-filter mutation. Their evidence paths therefore contain non-passing
`started` state only:

```bash
DECKY_DECK_HOST=steamdeck-legos CDP_PORT=18082 \
  scripts/deck/verify/smoke_controller_tab_persistence.sh \
  3213262460 55150 102 /tmp/Decky-Metadata/controller-layout-tab-preservation/review-03-legos.json
DECKY_DECK_HOST=steamdeck CDP_PORT=18083 \
  scripts/deck/verify/smoke_controller_tab_persistence.sh \
  2155012430 55150 4 /tmp/Decky-Metadata/controller-layout-tab-preservation/review-03-steamdeck.json
```

The safe failed smoke logs are `review-03-legos-smoke.log` and
`review-03-steamdeck-smoke.log`. A Legion screenshot attempt at
`review-03-legos-gameinfo.png` confirmed the Library was showing an unrelated
X-Men card; `nav.js` reported `DFL.Navigation unavailable`, and the repository
has no committed no-launch operation that opens this shortcut's controller
chooser. No ad-hoc click or `enter` action was used because it could activate a
game. Consequently there are no review-03 Community-selected screenshots yet.

The requested no-launch suites were still captured with unique staging IDs:

```bash
DECKY_DECK_HOST=steamdeck-legos CDP_PORT=18082 \
  DECKY_VERIFY_RUN_ID=controller-tab-review-03-legos scripts/deck/verify/run_all.sh --no-launch
DECKY_DECK_HOST=steamdeck CDP_PORT=18083 \
  DECKY_VERIFY_RUN_ID=controller-tab-review-03-steamdeck scripts/deck/verify/run_all.sh --no-launch
```

Legion passed rerender, Community, and controller-layout checks but retained
the unrelated quick-links failure `developer metadata missing from a Game Info
page`. Steam Deck passed rerender and Community but retained unrelated
quick-links `delisted game lost rich metadata` and controller-layout `delisted
matched source Community results are empty` fixture failures. These are
recorded as failures, not passes, in `review-03-legos-run-all-no-launch.log` and
`review-03-steamdeck-run-all-no-launch.log`.

Both tunnels were explicitly closed and their final status was `tunnel: down`
(the status command's nonzero exit is its expected down-state result):

```bash
DECKY_DECK_HOST=steamdeck-legos CDP_PORT=18082 scripts/deck/tunnel.sh down
DECKY_DECK_HOST=steamdeck CDP_PORT=18083 scripts/deck/tunnel.sh down
```

The two current-device typed smoke/screenshot proofs remain outstanding. To
complete them, start each named shortcut on its controller chooser route, then
rerun the exact smoke commands above; they must report the corrected commit's
Community-before/after and restoration evidence before this review round can be
marked complete.

## Review-04 verifier correction and current-device evidence (2026-08-27)

- The first review-04 typed-smoke attempts reached the direct query on both
  devices but failed with `controller query cache update timed out`. A bounded,
  state-restoring diagnostic showed why this was a verifier false negative:
  Legion type `102` expanded the Community getter from `15` to `52` within
  `206 ms` and held three stable samples, while the displayed and matched-source
  cache object fingerprints legitimately remained unchanged. The verifier now
  considers the queried result settled when its expanded getter/hash result is
  stable; cache replacement/mutation remains diagnostic-only metadata.
- The repair has a dedicated red/green test for a Steam query that changes the
  getter while retaining cache identity. The previous predicate fails with the
  named cache-update timeout; the corrected one returns
  `resultSettled: true` with `cacheUpdated: false`.
- A Steam Deck failure-path inspection found a second verifier-only side effect:
  assigning the original visible filter without a matching query left the
  chooser pane temporarily blank. `restore-filter` now reissues the original
  direct query, waits for three stable getter samples, and reports
  `restorationQueryIssued`. Its focused regression verifies both the restored
  boolean and exact query arguments.
- The corrected Legion smoke passed against `3213262460` / source `55150` /
  type `102`. Community remained selected across the query, the getter and DOM
  both expanded from `15` to `52`, all `15` before-query hashes remained in the
  `52` after-query hashes, and the original `true` filter plus Community tab
  were restored. Evidence is
  `/tmp/Decky-Metadata/controller-layout-tab-preservation/review-04-legos.json`;
  screenshots are `review-04-legos-before-corrected-smoke.png` and
  `review-04-legos-after-corrected-smoke.png` in the same directory.
- The Steam Deck query path is also healthy: it changed the getter from `33` to
  `52` at type `4`, held three stable samples, and restored the visible filter.
  Its current Steam UI virtualizes Community cards: the safe DOM probe found
  `24` mounted layout panels and no `Focusable` marker while the getter reported
  `33` filtered records; a no-query screenshot confirmed those Community rows
  are visibly rendered. Because the plan requires exact rendered/getter
  equality and the permanent probe is deliberately prohibited from scrolling or
  framework-state enumeration, its typed evidence remains
  `pending-validation` rather than claiming a pass. The durable evidence and
  screenshots are `review-04-steamdeck.json`,
  `review-04-steamdeck-before-corrected-smoke.png`,
  `review-04-steamdeck-community-no-query.png`, and
  `review-04-steamdeck-after-refresh.png` below the same temporary directory.
- Both device doctors were run with dedicated ports. The Steam Deck briefly
  lost its debugger/SSH connection during tunnel reset, then recovered; no
  service restart or game launch was attempted. Both dedicated tunnels were
  closed afterward and their final status was `tunnel: down`.
- `review-04-fixture-green.log` records all `18` fixture/probe tests passing;
  the full `review-04-quality-gates.log` records TypeScript, Rollup, `20`
  Vitest files / `258` tests, Python byte-compilation, and review-note integrity
  passing. The complete Python collection is now `411` tests because this round
  added the cache-identity regression.

### Outstanding acceptance boundary

The plugin bundle was unchanged in this verifier-only correction, so no device
redeployment was required. The Legion proof is complete. The Steam Deck
underlying getter/hash result and filter restoration are complete, but the
plan's strict DOM-count equality cannot be honestly asserted against its current
virtualized markup under the probe's no-scroll/no-framework-enumeration safety
contract. No round-complete marker was written; do not treat the Steam Deck
typed smoke as passed until that acceptance boundary is resolved.
