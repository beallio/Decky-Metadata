# 2026-07-01 Delisted Index Backend

## Objective

Implement the backend plan in `docs/plans/2026-07-01_delisted-index-backend.md`.

## Files Modified

- `main.py`
- `tests/test_delisted_index.py`
- `docs/agent_conversations/2026-07-01_delisted-index-backend.md`

## Design Decisions

- Added a cached Steam Tracker delisted-app index stored as `delisted_index.json` beside the plugin metadata settings file.
- Used the existing TLS-verified `_http_text` fetch path and a weekly TTL with stale-cache fallback.
- Added parser and matcher coverage without network access.
- Inserted the delisted lookup only after Steam storesearch misses and before the existing IGN fallback.

## Validation

- `UV_CACHE_DIR=/tmp/Playhub-Metadata-local/.uv ./run.sh uv run --with pytest -- pytest -q tests/test_delisted_index.py`
- `scripts/orchestration/run-quality-gates`

Both commands passed before committing.
