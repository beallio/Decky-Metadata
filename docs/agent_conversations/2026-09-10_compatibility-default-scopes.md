# Compatibility default scopes — 2026-09-10

> **Historical session — implementation is on `dev` (`34e52a5`).**
> Separator follow-up: `2982c86`. Earlier deferred checks are superseded by the
> final verification record below, not a request to restart implementation.
> See the [current compatibility contract](../specs/compatibility-status.md).

## Objective

Replace the matched-games-only boolean with four saved compatibility default
scopes. Keep per-game precedence, native identity, Game Info deferral, and
observable native map publication unchanged.

## Delivered changes

- Added the canonical `deck_compat_default_scope` setting and RPCs. The old
  boolean migrates at the storage load boundary without a read-time write.
- Added `steam`, `no-steam`, `metadata`, and `all` to the shared resolver.
  Eligibility uses record presence and a positive safe Steam App ID. Provider
  name and store availability do not affect eligibility.
- Replaced the QAM toggle with the full-width native **Apply default to**
  dropdown. It keeps its selection while Automatic disables it.
- Made QAM popup focus return to the category or scope dropdown that opened
  the popup.
- Updated the per-game preview, Home/grid resolver input, regression tests,
  README, compatibility specification, changelog, and device runbook.

## Verification evidence

- Backend TDD test first failed with eight missing new RPC-method assertions.
  After implementation, `./run.sh uv run --with pytest -- pytest -q
  tests/test_deck_compat.py` passed.
- Focused frontend coverage passed: 6 files and 178 tests.
- Full frontend coverage passed: 28 files, 502 passed, 4 skipped, 506 total.
- Final `./run.sh scripts/orchestration/run-quality-gates` exited 0. It passed
  type checking, Rollup build, the full frontend suite, Python compilation,
  the full backend suite, and the review-retention check.
- Mutation control 1 changed eligibility to include every saved record. The
  scoped-policy suite failed four tests: scope-only publication, Steam-ID
  partition, excluded fallback, and ID-removal recomputation. The mutation was
  restored and the 66-test suite passed.
- Mutation control 2 changed legacy `true` migration to `all`. The backend
  suite failed the legacy-true and invalid-canonical fallback assertions. The
  mutation was restored and the backend suite passed.
- `./run.sh npm run package` produced `Decky-Metadata.zip` version
  `0.3.14+ccf5b4a`, SHA-256
  `ced52b73241ee41f943a7474469c57137040369ae7c012ecab442d3ce79ab85d`.
  The ZIP has the `Decky-Metadata/` root and its backend, manifest, and built
  frontend files.

## Review round 01 corrections

- The editor now asks the shared resolver predicate whether a record is in the
  selected default scope. It no longer infers inheritance from matching numeric
  categories, so a Valve Verified Steam match outside `no-steam` is described
  as the Valve fallback rather than as global inheritance. The mounted-editor
  regression also changes only the scope through the compatibility revision.
- A narrow shared compatibility-save transaction now lives with the existing
  QAM popup/focus lifecycle. A returned Content instance inherits the pending
  category or scope selection, busy state, and error; it cannot start another
  policy RPC. Completion accepts only its originating plugin lifecycle. The
  focused remount regressions exercise selection, failure, cancellation, and
  actual native focus return to the category or scope control that opened the
  popup.
- A present invalid canonical scope now normalizes in memory to `all`, while a
  file with neither old nor new scope key still remains absent in memory and on
  disk. The storage test proves that a later ordinary save persists the
  normalized canonical value without changing unrelated settings or metadata.
- The absent-key rollback fixture now seeds an existing settings file with no
  scope key and a valid pre-existing store state. Its injected save failure
  therefore occurs after key insertion, and verifies in-memory rollback,
  unchanged disk data, and a subsequent successful save.

### Round-01 verification evidence

- New focused regressions first failed as expected: two remount tests reported
  a returned scope control that was not busy, the equal-category preview said
  `Use global default (Verified)`, and the canonical-only invalid-scope test
  raised `KeyError` because the key had been removed. After the corrections,
  `./run.sh npm test -- src/steam/metadataPatch.test.ts
  src/steam/detailsReassert.test.ts
  src/steam/libraryCompatibilityIndicators.test.tsx
  src/ContentPanel.updateSettings.test.tsx src/MetadataPage.test.tsx` passed
  182 tests, and `./run.sh uv run --with pytest -- pytest -q
  tests/test_deck_compat.py` passed 36 tests.
- Mutation control 1 replaced the eligibility predicate with
  `metadata !== undefined`. The resolver and Home/grid suites failed 21 tests,
  including no-record `all`, Steam/no-Steam partition, scope-only publication,
  excluded fallback, and Game Info deferral cases. The predicate was restored
  before the green focused run.
- Mutation control 2 mapped legacy true to `all`. The backend test failed the
  legacy-true migration and invalid-canonical-with-legacy fallback assertions.
  The mapping was restored before the green backend run.
- `./run.sh npx tsc --noEmit` exited 0. The final
  `./run.sh scripts/orchestration/run-quality-gates` exited 0 with 28 frontend
  files passing (508 tests, 4 skipped), Python compilation and backend tests
  passing, and review-note retention passing.
- After commit `a79eca4`, `./run.sh npm run package` produced
  `Decky-Metadata.zip` version `0.3.14+a79eca4`, SHA-256
  `ad04b8387a05bb3716879df5558a0646b08b7fc7df801ca795cd843df237a808`.
  Archive inspection confirmed one `Decky-Metadata/` root containing the
  manifest, backend, and built frontend files. The ZIP was not delivered or
  installed.

## Deferred verification

Live Deck verification is deferred. The plan requires explicit current-device
authorization before ZIP install, launch, disposable fixture edits, or reload.
No device state was changed in this round.

## Review round 02 correction

- An in-place `DeckyPluginLoader.importPlugin("Decky Metadata")` can create a
  new frontend bundle while a prior editor or router callback remains mounted.
  The old and new bundles previously had separate metadata caches, policy
  state, and compatibility-revision listeners. A cleared Steam ID could then
  save correctly on disk while the editor or native publisher still used the
  retiring bundle's record and scope.
- The compatibility runtime now has one SteamUI-global cache, policy state,
  and revision-listener set for the active session. Beginning a new lifecycle
  invalidates retiring asynchronous work and clears its pending work sets, but
  keeps the current cache until startup refresh supplies the authoritative
  data. A retained editor therefore observes its acknowledged record and a
  later scope-only revision.
- The editor regression now asserts that clearing a Steam ID under the
  `steam` scope displays the outside-scope native fallback and preserves user
  fields. The native regression covers no-ID record creation, ID addition,
  scope change, reload handoff, ID removal, both later scope-only changes,
  restoration of the captured native value, and an unchanged unrelated
  shortcut.

### Round-02 verification evidence

- TDD reproduction: `./run.sh npm test -- src/steam/core.test.ts` first
  failed with separate cache object identities after a simulated module reload
  (46 passed, 1 failed).
- After the correction, `./run.sh npm test -- src/steam/core.test.ts
  src/steam/metadataPatch.test.ts src/MetadataPage.test.tsx` passed 152 tests.
- `./run.sh scripts/orchestration/run-quality-gates` exited 0: type check,
  Rollup build, 510 passed frontend tests with 4 skipped, Python compilation,
  backend pytest, and review-retention checks all passed. The complete output
  is in `/tmp/Decky-Metadata/compatibility-default-scopes-round02-quality.log`.
- `./run.sh npm run package` after commit `80197fd` produced
  `Decky-Metadata.zip` version `0.3.14+80197fd`, SHA-256
  `a0c440d190fc4b8a4eb0f9e12b4d23d69bc64525be70ddd51fd4653d917043f1`.
  Archive inspection confirmed the `Decky-Metadata/` root and required plugin
  files. The ZIP was not delivered or installed.

## Review round 03 corrections

- Metadata-cache cleanup now compares the promise it installed before it clears
  the shared pending field. A request from a retiring lifecycle cannot clear a
  newer request and allow a duplicate metadata load.
- Per-app metadata and screenshot work now has an authoritative shared owner
  map. The existing Sets remain only for retiring bundle compatibility; current
  work checks and clears its owner by exact request identity. A stale finalizer
  therefore cannot remove the current work guard after a reload.
- Deferred Game Info compatibility updates and editor-originated native map
  publications now live in the shared compatibility runtime. An old retained
  editor callback can enqueue the update, and the current router bundle
  publishes exactly one native replacement after the route return shield.
- The lifecycle reset has one metadata-load-promise clear. Real teardown also
  clears the owner maps and both deferred queues.

### Round-03 verification evidence

- The focused red run reproduced four requested boundaries: a stale metadata
  cache finalizer cleared the current promise; stale metadata and screenshot
  finalizers cleared their current per-app guards; and a current module could
  not publish a deferred update queued by an old module. After the correction,
  `./run.sh npm test -- src/steam/metadataPatch.test.ts` passed 71 tests.
- `./run.sh scripts/orchestration/run-quality-gates` passed: 28 frontend files,
  514 passed tests and 4 skipped; Python compilation and backend pytest also
  passed. The complete command output is
  `/tmp/Decky-Metadata/compatibility-default-scopes-round03-quality.log`.
- After commit `97c2aa1`, `./run.sh npm run package` produced
  `Decky-Metadata.zip` version `0.3.14+97c2aa1`, SHA-256
  `5799f7eceeab3b97bb21a7803763dd1783d7052cacb54376bc1b084f6720e66e`.
  Archive inspection confirmed the single `Decky-Metadata/` root with the
  manifest, backend, and built frontend files. The ZIP was not delivered or
  installed.

## Deferred review-round device work

The review note prohibited device calls in this correction round. The reported
Deck recovery and final native-state restoration remain for Main after the
device returns; no device state was changed here.

## Review round 04 correction

- QAM policy-save and popup-return state now uses one SteamUI-global runtime.
  A native dropdown callback retained from the prior bundle and the returned
  QAM panel now share its pending transaction, error, and originating control.
  The returned panel keeps both controls locked until that one request settles.
- Completed transactions no longer supply category or scope values. They retain
  a same-lifetime error for the returned panel, while category and scope always
  return to the confirmed shared compatibility runtime. A later confirmed
  Automatic category therefore disables the scope control without discarding
  its selected scope.
- The regression imports a second `ContentPanel` module after the first has
  started a save. It proves shared scope busy/error state and popup origin,
  then emits a compatibility revision after a retained caller confirms
  Automatic. The real scope dropdown test verifies that its retained
  `metadata` value is shown but disabled under Automatic.

### Round-04 verification evidence

- TDD reproduction: before the correction, `./run.sh npm test --
  src/ContentPanel.updateSettings.test.tsx` failed both new reloaded-bundle
  cases. The returned bundle showed scope busy as `false` rather than `true`.
- After the correction, `./run.sh npm test --
  src/ContentPanel.updateSettings.test.tsx
  src/components/qam/MetadataSection.test.tsx` passed 18 tests, and
  `./run.sh npx tsc --noEmit` exited 0.
- `./run.sh scripts/orchestration/run-quality-gates` and
  `./run.sh scripts/orchestration/check-review-notes-not-deleted` exited 0:
  Rollup rebuilt the tracked bundle, 28 frontend files passed with 516 tests
  passed and 4 skipped, Python compilation and backend pytest passed, and all
  committed review notes were retained.
- Commit `1b548b4` was packaged with `./run.sh npm run package`. It produced
  `Decky-Metadata.zip` version `0.3.14+1b548b4`, SHA-256
  `8faf7fca38302c7d1ad8ebd48c5cdf7310b08fb48de2c67fabf8cfde874ca695`.
  Archive inspection confirmed the single `Decky-Metadata/` root with the
  manifest, backend, and built frontend files. The ZIP was not delivered or
  installed.

## Deferred review-round 04 device work

The review note prohibited device calls in this correction round. The package
was built only for local archive verification; no Deck state was changed.

## Orchestrator verification and integration record

The final reviewed candidate is `7fdb4b6`, installed through Decky Loader as
`0.3.14+7fdb4b6`. The final diagnostic capture confirmed its manifest version
and that the installed frontend SHA-256 matches the reviewed local bundle.
All four committed change-request rounds were reviewed as resolved.

Device observations across the reviewed candidates:

- All four scopes matched the captured Steam-ID, no-ID, manual, and no-record
  classes. Per-game overrides and Valve/native fallback remained intact.
- The native Great on Deck collection reported 38 / 38 / 42 / 46 entries for
  steam / no-steam / metadata / all on `18f1c50`. The policy/publication core
  was unchanged by the final QAM-only correction; all four native policy
  outputs were checked again on `7fdb4b6`.
- On the reload-corrected build, a disposable manual record accepted Steam ID
  15100, moved between scopes, then returned to native packed 0 after the ID
  was cleared. Its editor preview agreed with the cleared record. An editor
  save after reload replaced the actual native map entry. The temporary record
  was removed and the original record set was preserved.
- The final QAM build retained its selected scope under Automatic and across
  an in-place import. Disabled activation opened no menu. Long labels wrapped
  within the full-width control. Both dropdowns preserved the expected next
  controller navigation target after select/cancel and the native return
  transition.

The first final smoke run lost connectivity. On resumption, the committed
cache-write dump/restore probe removed the interrupted instrumentation before
a new suite began. The complete fresh suite passed:

- `scripts/deck/verify/run_all.sh --no-launch`: quick links, re-render with
  0 writes across three subsection round trips, community fallback, and
  controller-layout isolation. The optional DLC/Points Shop fixture was absent.
- Separately authorized `scripts/deck/verify/smoke_launch.sh 2312439508`:
  started with 64-bit game ID `9931852060871884800` and terminated the game.
- Final `./run.sh scripts/orchestration/run-quality-gates`: type check,
  Rollup, 28 frontend files with 516 passed and 4 skipped, Python compilation,
  backend pytest, and review-note retention all passed.

After verification, original metadata records and native packed categories
matched the baseline. Settings are Automatic and scope `all`, the canonical
equivalent of the original legacy false value. Debug logging was unchanged.
The Library selection was restored to All Games and navigation to Library
Home; the temporary debugger tunnel was closed.

### Verification-method corrections

Steam's native DropdownItem marks disabled controls with the `Disabled` CSS
class and reduced opacity, while HTMLButtonElement.disabled can remain false.
The attribute observation in review 04 was therefore not conclusive evidence
of an enabled native control. Final checks used the native class, visible
appearance, and ignored activation. The separately reproduced cross-bundle
transaction and stale-snapshot defects were still corrected and tested.

An empty browser fill did not reliably clear the Steam ID field; the verified
clear used Ctrl+A/Backspace and confirmed the empty input and saved null ID.
Controller return checks waited for the existing bounded native handoff;
premature synthetic input was not counted as a product failure.

Evidence is retained under
`/tmp/Decky-Metadata/four-scopes-live-qe4_x60v/`, especially
`completed-verification.json`. Final suite:
`/tmp/Decky-Metadata/verification/20260910T211859Z/`. Final capture:
`/tmp/Decky-Metadata/diagnostics/20260910T211949Z/`.

The orchestrator's review passes for local integration in configured `final`
mode. Its verdict is recorded in the merge commit, not an `APPROVED` review
note. No human-approved finalize command is used; no finalized marker is
expected on this path. Promotion to `main` and remote publication remain human
gates outside this task.

## Native layout follow-up — 2026-09-10

After the external lifecycle completed, the maintainer requested a small
separator adjustment. In OMP-native mode, the scope dropdown's separator was
disabled and the explanation Field's standard bottom separator was enabled.
The category separator and all policy behavior were left unchanged.

The full local quality gate passed (516 frontend tests, 4 skipped, backend
pytest, type check, build, and Python compilation). The frontend was deployed
with `scripts/deck/deploy.sh --no-build`. Visual verification on the actual QAM
confirmed no separator between **Apply default to** and its explanation, and
one separator below the explanation and above **Refresh metadata**.
Evidence: `/tmp/Decky-Metadata/separator-check-f7zetzc8/complete-scope-section.png`.
README and behavior specifications are intentionally unchanged.
