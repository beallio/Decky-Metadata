# 2026-07-04 Scan Pipeline Refactor

## Objective

Implement `docs/plans/2026-07-03_scan-pipeline-refactor.md` on
`feat/scan-pipeline-refactor` while preserving scan and Steam Activity behavior.

## Verification Findings

- Confirmed: `_scan_missing` mixed Steam matching, delisted fallback, IGN fallback,
  progress updates, persistence, and per-game error handling in one loop.
- Confirmed: `_refresh_steam_activities` duplicated the same progress and save
  pattern with separate Activity-specific success/failure rules.
- Confirmed: Activity refresh used `_metadata_with_steam_news_sync`, which fetched
  Deck compatibility and Steam appdetails whenever a Steam appid was present even
  when only Steam Activity/news was needed.
- Confirmed: `_sanitize_steam_news` deduped and sanitized rows while also calling
  `_steam_news_image_candidates`, so image extraction/scoring still happened during
  sanitization.
- Dropped: none.

## Files Modified

- `main.py`
- `tests/test_scan_pipeline_refactor.py`
- `docs/agent_conversations/2026-07-04_scan-pipeline-refactor.md`

## Design Decisions

- Added a `TypedDict` scan result shape with `status`, `metadata`, and `source`.
  `TypedDict` was used instead of `dataclass` because the repository import
  sandbox executes `main.py` without a `sys.modules` entry, which breaks stdlib
  dataclass processing under postponed annotations.
- Extracted Steam, delisted Steam, and IGN scan resolvers into small sync strategy
  functions.
- Added a shared async scan runner that owns progress counters, messages,
  persistence, completion state, and per-item error handling.
- Kept scan save semantics through `save_metadata`, while Activity refresh keeps
  its previous direct `_data` update and `_save_data` behavior.
- Added an `include_details` flag to `_metadata_with_steam_news_sync`; the default
  preserves existing enrichment behavior, and Activity refresh opts out to avoid
  appdetails/deck-compat fan-out.
- Changed `_sanitize_steam_news` to normalize and dedupe only already-collected
  image URLs. Image extraction/scoring remains in Steam news/event collection.

## Validation

- Baseline before implementation: `scripts/orchestration/run-quality-gates` passed.
- Red tests first:
  `./run.sh uv run --with pytest -- pytest -q tests/test_scan_pipeline_refactor.py`
  failed on expected detail fan-out and sanitizer image-extraction assertions.
- Targeted after implementation:
  `./run.sh uv run --with pytest -- pytest -q tests/test_scan_pipeline_refactor.py`
  passed.
- Targeted regression after import fix:
  `./run.sh uv run --with pytest -- pytest -q tests/test_import_sandbox.py::test_main_execs_when_module_name_is_absent_from_sys_modules`
  passed.
- Scan regression set:
  `./run.sh uv run --with pytest -- pytest -q tests/test_scan_pipeline_refactor.py tests/test_scan_steam_first.py tests/test_scan_resolves_steam_appid.py tests/test_delisted_index.py tests/test_steam_appdetails.py tests/test_deck_compat.py tests/test_steam_appid_override.py`
  passed.
- Final quality gate:
  `scripts/orchestration/run-quality-gates` passed.

## Follow-Up Notes

- On-device scan and Activity refresh parity remains deferred as specified by the
  plan.
