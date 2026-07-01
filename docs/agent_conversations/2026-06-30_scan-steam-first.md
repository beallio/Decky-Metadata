# 2026-06-30 Scan Steam First

## Task Objective

Implement `docs/plans/2026-06-30_scan-steam-first.md`: make metadata scan attempt Steam matching before IGN, save pure Steam records when Steam matches, and use IGN only as the fallback when Steam finds no match.

## Files Modified

- `main.py`
- `tests/test_scan_steam_first.py`
- `tests/test_scan_resolves_steam_appid.py`
- `docs/agent_conversations/2026-06-30_scan-steam-first.md`

## Design Decisions

- `_scan_missing` now calls `_metadata_with_steam_news_sync` first with a minimal manual metadata shell.
- A Steam match is detected by a valid `steam_appid`; when present, the scan saves that Steam record and skips `_auto_fetch_metadata_sync`.
- IGN is fetched only after Steam returns no appid. IGN results still pass through `_metadata_with_steam_news_sync`, preserving the previous fallback enrichment behavior.
- The existing `test_scan_resolves_steam_appid.py` expectation was updated because it asserted the removed IGN-first call order. It now verifies fallback metadata can still receive Steam enrichment after an initial Steam miss.

## Validation Results

- `./run.sh uv run --with pytest -- pytest -q tests/test_scan_steam_first.py`: passed
- `./run.sh uv run --with pytest -- pytest -q tests/test_scan_resolves_steam_appid.py`: passed

Full quality gate pending before round completion.
