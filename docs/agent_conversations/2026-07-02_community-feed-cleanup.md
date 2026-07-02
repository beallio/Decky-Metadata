# 2026-07-02 Community Feed Cleanup

## Objective

Implement `docs/plans/2026-07-02_community-feed-cleanup.md` by removing the dead scraped-UGC
community pipeline after the native `library/appcommunityfeed/<appid>` passthrough fix.

## Files Modified

- `main.py`
- `src/backend.ts`
- `src/communityFeed.ts`
- `src/components.tsx`
- `src/steam.ts`
- `src/types.ts`
- `tests/test_community_feed_passthrough.py`
- `tests/test_frontend_log.py`
- `tests/test_steam_appdetails.py`
- `tests/test_steam_appid_override.py`
- Deleted `tests/test_community_steam_only.py`
- Deleted `tests/test_steam_community_media.py`
- `dist/index.js` rebuilt by the quality gate

## Design Notes

- The surviving Community tab mechanism is Steam's native feed passthrough: non-Steam shortcut
  requests to `appcommunityfeed/<shortcutId>` are rewritten to the matched Steam appid and delegated
  to the native HTTP client.
- The scraped `homecontent` HTML parser, UGC fetch path, frontend fake-feed item builders,
  `get_steam_community_page`, and community media enrichment callable were removed as dead code.
- `frontend_log` now emits DEBUG-level `_plog` entries, so frontend trace/nav/community diagnostics
  are hidden unless the existing debug toggle raises the backend logger level.
- The redundant `feed url seen` frontend diagnostic was removed. The concise `feed passthrough`
  diagnostic remains and is now DEBUG-gated.
- `community_images`, `community_videos`, and `community_enriched_at` are no longer written to
  sanitized metadata or frontend metadata templates.
- The old parser/enrichment tests were deleted because they exercised the removed scraped-UGC path.
- `isPlayhubCommunityId` was kept because the existing community vote patch still references it.

## Validation

- Baseline `scripts/orchestration/run-quality-gates` passed before edits.
- Targeted red tests failed before implementation:
  `./run.sh uv run --with pytest -- pytest -q tests/test_frontend_log.py tests/test_community_feed_passthrough.py`.
- Targeted tests passed after implementation:
  `./run.sh uv run --with pytest -- pytest -q tests/test_frontend_log.py tests/test_community_feed_passthrough.py tests/test_steam_appdetails.py tests/test_steam_appid_override.py`.
- `./run.sh npx tsc --noEmit` passed.
- `scripts/orchestration/run-quality-gates` passed after implementation.
