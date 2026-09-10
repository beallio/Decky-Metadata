# Compatibility default scopes — 2026-09-10

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

## Deferred verification

Live Deck verification is deferred. The plan requires explicit current-device
authorization before ZIP install, launch, disposable fixture edits, or reload.
No device state was changed in this round.
