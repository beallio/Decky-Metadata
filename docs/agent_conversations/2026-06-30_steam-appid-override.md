# 2026-06-30 Steam App ID Override

## Objective

Implement `docs/plans/2026-06-30_steam-appid-override.md`: allow the metadata editor to pin a Steam appid from a raw ID, Steam URL, or SteamDB URL, then immediately re-enrich that single app from Steam.

## Files Modified

- `main.py`
- `tests/test_steam_appid_override.py`
- `src/backend.ts`
- `src/components.tsx`
- `src/i18n.ts`
- `dist/index.js`

## Design Decisions

- Added `Plugin.enrich_steam_app(app_id)` as a narrow async callable that loads current metadata, runs the existing Steam enrichment path in a worker thread, and persists through `save_metadata`.
- Left `_metadata_with_steam_news_sync`, Steam matching, and Steam network helpers unchanged so pinned appids continue to flow through the existing sanitization and enrichment code.
- Added `parseSteamAppId` as a pure frontend helper for raw numeric IDs, Steam store/community app URLs, SteamDB app URLs, and `appid=` query parameters.
- Added a Steam App ID editor section without changing the existing RetroAchievements or Xbox override flows.
- Added English and Italian strings for the new editor controls.

## Validation

- Baseline: `./run.sh ./scripts/orchestration-hooks/quality-gates` passed before implementation.
- TDD red: `./run.sh uv run --with pytest -- pytest -q tests/test_steam_appid_override.py` failed before the backend callable existed.
- Focused checks: `./run.sh npx tsc --noEmit` and `./run.sh uv run --with pytest -- pytest -q tests/test_steam_appid_override.py` passed after implementation.
- Final quality gate: `./run.sh ./scripts/orchestration-hooks/quality-gates` passed.
