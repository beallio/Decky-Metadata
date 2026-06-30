# 2026-06-29 Clear Metadata Cache Button

## Task Objective

Implement `docs/plans/2026-06-29_clear-metadata-cache-button.md` on
`feat/clear-metadata-cache-button`.

## Files Modified

- `main.py`
- `src/backend.ts`
- `src/components.tsx`
- `src/i18n.ts`
- `dist/index.js`
- `tests/test_clear_cache.py`
- `docs/agent_conversations/2026-06-29_clear-metadata-cache-button.md`

## Design Decisions

- Added `Plugin.clear_metadata_cache` as a Decky-callable backend method that
  reloads persisted data, counts current metadata entries, clears only the
  `metadata` map, saves the store, logs the cleared count, and returns
  `{ "ok": true, "cleared": N }`.
- Added a frontend `clearMetadataCache` callable and a QAM maintenance section
  near the existing cache and diagnostics controls.
- The QAM button calls the backend, refreshes the in-memory metadata cache with
  `refreshMetadataCache`, updates the displayed saved count, and toasts either
  the localized success message or the thrown error text.
- Added English and Italian strings for the metadata-cache heading, hint,
  button label, and completion toast.

## Validation Results

- Baseline `scripts/orchestration/run-quality-gates`: passed.
- Red `./run.sh uv run --with pytest -- pytest -q tests/test_clear_cache.py`:
  failed as expected because `Plugin.clear_metadata_cache` was missing.
- Green `./run.sh uv run --with pytest -- pytest -q tests/test_clear_cache.py`:
  passed (`2 passed`).
- `./run.sh npx tsc --noEmit`: passed.
- `./run.sh npm run build`: passed and regenerated `dist/index.js`.

## Deferred Verification

Hardware validation is deferred to the human/orchestrator: rebuild and sideload
on a real Steam Deck, confirm the QAM panel shows a "Clear cache" button and
toasts confirmation, then confirm clearing the cache forces affected games to
run fresh Steam matching and persist corrected `steam_appid` values.
