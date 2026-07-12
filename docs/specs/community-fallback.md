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
`author`, and `link`. For metadata items `link` is the record `source_url` (e.g.
the IGN page) when it is a valid `https://` URL, otherwise the image URL; for
scraped items it is the validated Steam shared-file link. Pages are clamped to 1
through 100. Scraper errors are recoverable and fall through to stored
screenshots; the RPC does not write metadata or start enrichment.

`apply_fetched_metadata(app_id, slug_or_url)` fetches descriptive metadata and
saves it atomically. If the existing record has a positive `steam_appid`, its
Steam ID, store URL/state, Deck compatibility, Steam news, and news timestamp
survive the fetched result. The existing Steam ID control remains the explicit
way to clear a pin.

## Native synthetic cards

Fallback items become native image cards (`type: 5`) with deterministic numeric
IDs beginning `90909`. Each card carries the observed image, description, a
provider-icon avatar (IGN/Steam/YouTube/RAWG) on every avatar field, a creator
with a plausible `steamid`, and `url`/`link`/`external_url`/`strURL` pointing at
the item link (the provider page, or the image when no link exists). Comments,
votes, ratings, reactions, and inappropriate-content flags are empty or zero.
Metadata cards use the record source (or `Metadata`) as their creator label;
scraped cards use `Steam Community` with the author appended when known.

The frontend derives the requested page from GET query data or POST transport
data/cursors, rather than depending only on a `?p=` URL. Empty fallback pages do
not replace the native response. Rejected rewritten native requests retry the
original shortcut request only when no fallback content is usable.

Opening a synthetic card is device-verified to issue **no** published-file
detail, comment, or reaction request — it opens Steam's native image lightbox,
which reads only the card fields already provided. No detail/comment/reaction
shield is therefore installed. The community **vote** patch and
`isDeckyCommunityId` recognition remain in place. The pipeline never guesses a
Steam app ID and never fabricates users, engagement, reactions, videos, or
persisted community enrichment.

## Known limitation — native lightbox close on a controller

When a synthetic card's native lightbox is open, the visible **Close** button
lives in the lightbox's "Scroll down for details" footer. For a real screenshot
that footer holds description/comments; for a synthetic card it is empty, so
directional (stick/D-pad) navigation cannot land on the Close button — the empty
footer intercepts *Down*. **`B` (back) and touch both close the lightbox
normally**, so the item is always dismissable; only stick/D-pad navigation to the
on-screen Close button is unavailable. The footer is native Steam chrome rendered
with build-unstable minified class names, so suppressing it reliably would need a
fragile render-level patch; it is intentionally left for a future SteamUI-safe
revisit (or a custom community viewer).
