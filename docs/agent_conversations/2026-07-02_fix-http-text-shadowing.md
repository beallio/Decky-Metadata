# 2026-07-02 Fix HTTP Text Shadowing

## Objective

Implement `docs/plans/2026-07-02_fix-http-text-shadowing.md` so generic Steam
HTTP fetches no longer route through the TrueAchievements-specific fetcher.

## Files Modified

- `main.py`
- `tests/test_delisted_index.py`
- `tests/test_no_duplicate_methods.py`
- `docs/agent_conversations/2026-07-02_fix-http-text-shadowing.md`

## Design Decisions

- Renamed the TrueAchievements-specific duplicate `_http_text` method to
  `_trueachievements_http_text` and updated only TrueAchievements call sites.
- Left the generic `_http_text` call sites unchanged so delisted index,
  announcement, community, YouTube, and RAWG fetches resolve to the generic
  TLS-verified fetcher.
- Added an AST guard test that fails when any class in `main.py` defines the
  same method name twice.
- The new guard also exposed a pre-existing duplicate `_steam_news_image`
  wrapper. Removed the earlier shadowed copy only; the later copy was already
  the runtime implementation, so observable behavior is unchanged.
- The delisted-path sanity test uses a compact generated 100-row fixture because
  `_download_delisted_index_sync` intentionally rejects fewer than 100 parsed
  apps as implausible.

## Root Cause

`Plugin` defined `_http_text` twice. The later TrueAchievements-specific
definition shadowed the generic fetcher, causing Steam Tracker and Steam
Community HTML to pass through TrueAchievements headers and the TA blocked-page
heuristic. Steam Tracker pages include Cloudflare content, which made valid
delisted-index HTML look blocked and caused the refresh to fail.

## Validation

- Baseline `scripts/orchestration/run-quality-gates` passed before code edits.
- Targeted tests passed:
  `./run.sh uv run --with pytest -- pytest -q tests/test_no_duplicate_methods.py tests/test_delisted_index.py`
- Duplicate-method AST check passed with `no duplicate methods`.
- Final `scripts/orchestration/run-quality-gates` passed.
- `scripts/orchestration/check-review-notes-not-deleted` passed.
