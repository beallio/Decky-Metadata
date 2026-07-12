# Community Fallback Behavior

Decky Metadata layers read-only fallback content around SteamUI's native
`library/appcommunityfeed/<appid>` request for non-Steam shortcuts. Real Steam
applications bypass this pipeline.

## Source precedence

1. Steam's native response is requested first, using a positive saved
   `steam_appid` in place of the shortcut ID when one exists.
2. A non-empty native `hub` is returned unchanged.
3. When a known Steam app has no native items, the backend requests its
   anonymous English Steam Community `homecontent` page and retains safe visual
   cards only.
4. When scraping is empty or unavailable, stored sanitized metadata screenshots
   are returned in stable 20-item pages.
5. When every source is empty, the original native empty response is preserved.

The scraper accepts only `https://images.steamusercontent.com/ugc/` images and
valid numeric Steam shared-file links, and normalizes `imw` to 512. Metadata
screenshots intentionally use a separate converter: any sanitized HTTPS host is
allowed, including IGN's `assets*.ignimgs.com`, and stored dimensions are kept.

## Backend RPCs

`get_community_fallback_page(app_id, page)` returns:

```text
{ source: "steam-scrape" | "metadata" | "none", page: number, items: [...] }
```

Each item contains `id`, `title`, `description`, `image_url`, `width`, `height`,
and `author`. Pages are clamped to 1 through 100. Scraper errors are recoverable
and fall through to stored screenshots; the RPC does not write metadata or
start enrichment.

`apply_fetched_metadata(app_id, slug_or_url)` fetches descriptive metadata and
saves it atomically. If the existing record has a positive `steam_appid`, its
Steam ID, store URL/state, Deck compatibility, Steam news, and news timestamp
survive the fetched result. The existing Steam ID control remains the explicit
way to clear a pin.

## Native synthetic cards

Fallback items become native image cards (`type: 5`) with deterministic numeric
IDs beginning `90909`. The item includes the observed image, description,
content-descriptor, spoiler, rating, and creator fields. Comments, votes,
ratings, reactions, Steam identity, and inappropriate-content flags are empty or
zero. Metadata cards use the record source (or `Metadata`) as their creator
label; scraped cards use `Steam Community` with the author appended when known.

The frontend derives the requested page from GET query data or POST transport
data/cursors, rather than depending only on a `?p=` URL. Empty fallback pages do
not replace the native response. Rejected rewritten native requests retry the
original shortcut request only when no fallback content is usable.

Synthetic published-file lookups are shielded so SteamUI does not send detail,
comment, reaction, or vote requests for IDs that have no Steam server record.
Any batch containing a real Steam ID passes through unchanged.

The pipeline never guesses a Steam app ID and never fabricates users,
engagement, reactions, videos, or persisted community enrichment.
