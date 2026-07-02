# 2026-07-02 decky-metadata-fixes

## Objective

Implement the existing `decky-metadata-fixes` plan on `feat/decky-metadata-fixes`:
QAM spinner polish, internal identifier rename, tooling cache-root rename,
first-pass scan reliability, controller focus reachability, Versions panel
spacing, and terminal scan status.

## Files modified

- `main.py`
- `src/components.tsx`
- `src/contextMenuPatch.tsx`
- `src/index.tsx`
- `src/steam.ts`
- `dist/index.js`
- `run.sh`
- `.protocol`
- `AGENTS.md`
- `orchestration.conf`
- `scripts/check_tdd.sh`
- `scripts/orchestration-hooks/quality-gates`
- `pytest.ini`
- `tests/conftest.py`
- `tests/test_import_sandbox.py`
- `tests/test_delisted_index.py`
- `tests/test_logging.py`
- `tests/test_steam_matching.py`

## Changes and decisions

- Replaced the clipped `scale()` spinner wrappers with a small fixed-size
  inline spinner wrapper used by the Scan button, Refresh delisted index button,
  and delisted status line.
- Renamed the metadata route, context-menu entry key, window event names, and
  backend log bracket prefix from `playhub`/`playhub-metadata` forms to
  `decky`/`decky-metadata` forms.
- Kept the persisted on-device filenames `playhub_metadata.json` and
  `playhub-metadata.log` unchanged to avoid orphaning data from the shipped
  0.1.0 build.
- Updated in-repo tooling/cache-root strings to `Decky-Metadata` and
  `/tmp/Decky-Metadata`. This means `./run.sh` and future quality gates create
  a fresh `/tmp/Decky-Metadata` cache root immediately; that is expected and
  harmless. The live orchestration markers for this round still remain under
  `/tmp/Playhub-Metadata-local` per the plan.
- Wrapped the top stats block and bottom Diagnostics/Versions grid in
  `Focusable` so controller focus can reach those blocks and drive QAM
  scrolling.
- Reworked the Versions rows to stack labels above values with more vertical
  spacing, and removed the redundant `Metadata saved:` prefix from the
  Metadata row value.
- Replaced stale scan status on completion with a terminal scan summary.
  `refreshActivities` had the same sticky terminal-state pattern, so it now
  sets a terminal activity-refresh summary on completion too.

## Task 4 root cause

Two first-pass reliability gaps were present:

- `_scan_missing` only touched the delisted index lazily inside each per-title
  lookup. A first lookup that encountered an unavailable or still-populating
  index could miss a delisted title that a later run would match. `_scan_missing`
  now resolves the delisted index once before the loop.
- Steam store search treated a transient `_http_json` exception as a terminal
  no-match for that title. `_resolve_steam_appid_for_title` now retries the
  store-search request with bounded backoff before returning no match.

Regression coverage was added for both cases.

## Validation

- Baseline before code changes: `./scripts/orchestration-hooks/quality-gates`
  passed.
- Red tests were observed for the backend log-prefix rename, delisted prewarm,
  and transient Steam store-search retry before implementation.
- Targeted backend tests after implementation:
  `./run.sh uv run --with pytest -- pytest -q tests/test_logging.py tests/test_delisted_index.py::test_scan_missing_prewarms_delisted_index_before_matching tests/test_steam_matching.py::test_steam_appid_matching_retries_transient_store_search`
  passed.
- Frontend type-check: `./run.sh npx tsc --noEmit` passed.
- Bundle rebuild: `./run.sh npm run build` passed and regenerated `dist/index.js`.
- Final quality-gate results are recorded in the implementing turn summary.

## Deferred on-device checks

- Verify Scan metadata and Refresh delisted index spinners are cleanly sized and
  not clipped in Gaming Mode.
- Verify controller focus can scroll from the top stats block to the bottom
  Versions panel.
- Verify the Versions panel spacing reads cleanly on-device.
- Verify completed scans show a terminal status summary rather than the last
  per-game line.
- Verify a clean-cache scan matches the titles that previously needed a second
  pass.
- Verify the renamed route/context-menu entry still opens the metadata page and
  renamed window events still refresh Steam Activity UI state.
