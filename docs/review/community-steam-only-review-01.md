# Review: community-steam-only

## Scope reviewed
Diff `dev..feat/community-steam-only` — `main.py`, `src/steam.ts`, `src/backend.ts`,
`src/types.ts`, `tests/test_community_steam_only.py`.

## Findings
- **Real community feed (backend):** `_parse_steam_community_ugc` uses a defensive HTMLParser
  (not brittle regex) to extract per-card `url` (UGC image), `author`, `link` (filedetails),
  `id`. `_steam_community_ugc_for_appid(appid, page)` fetches the keyless `homecontent` endpoint
  (`forceanon=1`, page `p`) via TLS-verified `_http_text`, returns `[]` on error.
  **Validated against the real hub HTML: 20 items with real images/authors/links.**
- **On-demand pages:** `get_steam_community_page(app_id, page)` callable resolves the matched
  `steam_appid` and returns `{items, page}` (empty for unknown apps).
- **Enrich swap:** `_enrich_community_media_sync` no longer calls `_youtube_videos_for_title` /
  `_rawg_images_for_title`; matched → page-1 UGC (falls back to stored Steam screenshots if the
  feed is empty), `community_videos = []`; unmatched → both empty. (The two helpers remain
  defined but unused, per plan.)
- **Field preservation:** `_sanitize_screenshots` now carries `author`/`link`; `MetadataData`
  gains `author?`/`link?`.
- **Pagination (frontend):** the `appcommunityfeed` intercept reads `requestParams.p`,
  `communityHubPageForApp` serves page 1 from cache (or live) and pages 2+ via
  `getSteamCommunityPage`, returning `{ hub: [] }` when exhausted so Steam's native infinite
  scroll drives load-more; errors return `{ hub: [] }`. `interleavedCommunityMedia` renders only
  `community_images` labeled "Steam"; provider icon gains a Steam branch.
- **Tests:** parser, matched/empty/unmatched enrich, and `get_steam_community_page` — 6 pass.

## Basis for confidence
Contract read from the on-device steamui: `GET library/appcommunityfeed/<appid>` with `p` page
param, response `{ hub }`, empty hub = stop. Implementation honors exactly that.

## On-device tuning note (flagged in plan)
Confirm the native `p` base is 1-based so page 1 is not duplicated; one-line offset if 0-based.

## Scope discipline
No matcher/delisted/other changes. No npm deps. TLS verification on; defensive scraping degrades
to an empty feed, never crashes.

## Gates
`run-quality-gates` green: `tsc --noEmit`, rollup build, `py_compile`, full pytest all pass;
tree clean.

Auto-approved for `dev` per project workflow (dev merges auto-approve; only dev → main is a
human gate).

STATUS: APPROVED
