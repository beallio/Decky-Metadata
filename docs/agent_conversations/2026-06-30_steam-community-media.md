# 2026-06-30 - Steam community media

## Task Objective

Implement `docs/plans/2026-06-30_steam-community-media.md` so Steam-matched non-Steam games use official Steam screenshots in the Community section and drop fabricated YouTube community video tiles when Steam appdetails are available.

## Files Modified

- `main.py`
- `tests/test_steam_appdetails.py`
- `tests/test_steam_community_media.py`
- `docs/agent_conversations/2026-06-30_steam-community-media.md`

## Design Decisions

- Reused the sanitized screenshot list already produced by `_steam_appdetails_for_appid` as `community_images`, keeping the same official Steam `path_full` URLs and screenshot shape.
- Cleared `community_videos` only inside the truthy Steam appdetails merge path in `_metadata_with_steam_news_sync`, so unmatched games keep existing community media behavior.
- Refreshed `community_enriched_at` when appdetails provide a matched Steam media source, allowing the frontend to treat the community section as enriched.
- Updated the existing exact appdetails mapping test to include `community_images`; this expected-value change is required by the plan's new appdetails return shape.
- Left frontend rendering, Steam trailers, matching behavior, and non-matched fallback behavior unchanged per scope.
- The plan file was already committed on `dev` in `a05d930`, so no duplicate empty plan commit was created on the feature branch.

## Validation Results

- Baseline `scripts/orchestration/run-quality-gates`: passed before edits.
- TDD red run `./run.sh uv run --with pytest -- pytest -q tests/test_steam_community_media.py`: failed as expected because appdetails did not return `community_images` and matched metadata did not clear `community_videos`; output saved to `/tmp/Playhub-Metadata-local/steam-community-media-targeted-failure.log`.
- Targeted `./run.sh uv run --with pytest -- pytest -q tests/test_steam_community_media.py`: passed, 3 tests.
- First full `scripts/orchestration/run-quality-gates`: failed on `tests/test_steam_appdetails.py::test_steam_appdetails_for_appid_maps_store_payload` because the existing exact expected dict needed the planned `community_images` key; focused output saved to `/tmp/Playhub-Metadata-local/steam-community-media-fullgate-failure.log`.
- Focused regression `./run.sh uv run --with pytest -- pytest -q tests/test_steam_community_media.py tests/test_steam_appdetails.py`: passed, 14 tests.
- Final `scripts/orchestration/run-quality-gates`: passed.

## Deferred Hardware Verification

- Rebuild from `dev`, sideload, tap Clear cache, and confirm a Steam-matched game shows official Steam screenshots in Community instead of IGN/RAWG/YouTube tiles.
- Confirm unmatched games preserve their existing Community images and videos.
