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

## Deferred verification

Live Deck verification is deferred. The plan requires explicit current-device
authorization before ZIP install, launch, disposable fixture edits, or reload.
No device state was changed in this round.
