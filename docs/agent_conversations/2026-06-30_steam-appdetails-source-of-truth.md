# 2026-06-30 - Steam appdetails source of truth

## Task Objective

Implement `docs/plans/2026-06-30_steam-appdetails-source-of-truth.md` so Steam-matched metadata uses Steam appdetails as the authoritative source for populated store fields, with IGN/RAWG data preserved only when Steam does not provide a value.

## Files Modified

- `main.py`
- `tests/test_steam_appdetails.py`
- `docs/agent_conversations/2026-06-30_steam-appdetails-source-of-truth.md`

## Design Decisions

- Added `STEAM_APP_DETAILS_URL` next to the existing Steam endpoint constants.
- Added `_steam_appdetails_for_appid` using `_http_json`, `_clean_html_text`, `_date_to_epoch`, `_rating_to_percent`, `_sanitize_screenshots`, and `_safe_int`.
- The helper returns only populated metadata keys so missing Steam fields do not overwrite fallback metadata.
- `_metadata_with_steam_news_sync` now fetches Steam appdetails after deck compatibility resolution for a truthy `steam_appid`, merges non-empty Steam values over existing metadata, and sets `source` to `Steam`.
- Community images, community videos, Steam news, matching scoring, deck compatibility, and frontend files were left unchanged.
- The plan file was already committed on `dev` in `ac07e5b`, so no duplicate empty plan commit was created on the feature branch.

## Validation Results

- Baseline `./run.sh scripts/orchestration/run-quality-gates`: passed before edits.
- TDD red run `./run.sh uv run --with pytest -- pytest -q tests/test_steam_appdetails.py`: failed as expected because `_steam_appdetails_for_appid` did not exist; output saved to `/tmp/Playhub-Metadata-local/steam-appdetails-red.log`.
- Targeted `./run.sh uv run --with pytest -- pytest -q tests/test_steam_appdetails.py`: passed, 11 tests.
- Full `./run.sh scripts/orchestration/run-quality-gates`: passed after implementation.

## Deferred Hardware Verification

- Rebuild and sideload from `dev`, clear cache, and confirm Steam-matched games display the matched Steam app's title, description, developer, genres, release date, screenshots, and rating.
- Confirm non-Steam games remain on the existing IGN/RAWG fallback path.
