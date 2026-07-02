# Plan: Make the community section Steam-only and stop IGN YouTube RAWG fabrication (community-steam-only)

## Context

The app-page **Community** section still shows fabricated IGN/RAWG images and YouTube videos
instead of Steam content, even for Steam-matched games. Two problems compound:

1. **Backend override.** `_metadata_with_steam_news_sync` sets `community_images` to official
   Steam screenshots and clears `community_videos` at match time — but
   `_enrich_community_media_sync` (main.py:1773), which runs **lazily on every page open** via
   the frontend `tryEnrichCommunityMediaForApp` → `enrichCommunityMedia` callable,
   **unconditionally overwrites** them: `community_videos = _youtube_videos_for_title(...)` and
   `community_images = _rawg_images_for_title(...)`. So the Steam swap is clobbered by
   RAWG/YouTube on load.
2. **Frontend mislabels + mixes.** `interleavedCommunityMedia` (src/steam.ts:575) interleaves
   **three** buckets: `metadata.screenshots` labeled **"IGN"**, `metadata.community_videos`
   labeled **"YouTube"**, and `metadata.community_images` labeled **"RAWG"**. Even the Steam
   screenshots (stored in `screenshots`/`community_images` for matched games) render under an
   "IGN"/"RAWG" provider label.

The goal (clarified with the user) is for the Community section to show **the same content as
the official Steam Community Hub** — i.e. real **user-generated content** (community screenshots
and artwork, with author + link), not the developer's promotional `appdetails` screenshots.

**This content is fetchable keyless.** The community hub's "Home" feed is served by:
```
https://steamcommunity.com/app/<appid>/homecontent/?userreviewsoffset=0&p=1
  &workshopitemspage=1&readytouseitemspage=1&mtxitemspage=1&itemspage=1
  &screenshotspage=1&videospage=1&artpage=1&allguidepage=1&webguidepage=1
  &integratedguidepage=1&discussionspage=1&numperpage=20&browsefilter=trend
  &appHubSubSection=1&l=english&filterLanguage=default&searchText=&forceanon=1
```
Verified live (appid 55150): HTTP 200, ~150 KB HTML of `apphub_Card` blocks. Each visual card
carries a UGC image (`https://images.steamusercontent.com/ugc/<...>?imw=128` — the `imw` param
sizes the thumbnail; request a larger width, e.g. `imw=512`), a link
(`https://steamcommunity.com/sharedfiles/filedetails/?id=<id>`), and an author
(`apphub_CardContentAuthorName` → `<a>name</a>`). Non-visual cards (discussions/reviews) exist
too but are reachable via the existing Discussions/Guides buttons, so this feed targets the
**visual** community media (screenshots + artwork).

Reusable facts:
- The Community grid renders from `steamCommunityItemsFromMetadata` → `interleavedCommunityMedia`
  (the only consumer, src/steam.ts:3310); `steamCommunityItemsFromMetadata` already builds items
  with a preview image, a **creator/author**, and an activate **URL** — so real UGC (image +
  author + filedetails link) maps directly onto the existing tile UI.
- The `community_images` field currently accepts plain-URL image items; extend the per-item shape
  it stores so an item can carry `url`, `caption/title`, `author`, and `link` (the sanitizer
  `_sanitize_screenshots`/`_sanitize_metadata` must preserve those fields — see tasks).
- `_youtube_videos_for_title` / `_rawg_images_for_title` are called **only** from
  `_enrich_community_media_sync` — after this change they become unused.
- `playhubCommunityProviderIcon` (src/steam.ts:557) defaults unknown sources to the IGN icon;
  there is no Steam icon constant yet.
- HTML scraping is fragile: parse defensively (same posture as the delisted-index scraper) and
  degrade to an empty community feed on any fetch/parse failure — never crash.

**Native paging contract (read from on-device steamui):** Steam's own community hub loads via
`GET library/appcommunityfeed/<appid>` with params `{ origin, p:<page>, rgSections:[2,4,3,9],
filterLanguage, languageTag, nMaxInappropriateScore:1 }` and expects a response `{ hub: [ ... ] }`
(each item has a `type` enum + `spoiler_tag`). There is **no cursor** — the UI increments `p`
and stops when it receives an **empty `hub`**. The plugin already intercepts this call
(`patchFeedMethod` → `communityPayloadForApp`, src/steam.ts:5679-5708) and currently returns all
of `metadata.community_images` ignoring `p`. Load-more = honor `p`: return page `p`'s items and an
empty `hub` when exhausted, so Steam's native infinite-scroll drives pagination for us.

**Intended outcome:** on a Steam-matched game the Community section shows **real Steam community
screenshots/artwork** (author + link, tapping opens the Steam item), refreshed with a sensible
TTL and cached per app; no IGN/RAWG images and no YouTube tiles. Games with no Steam match show
an empty Community section. No IGN/RAWG/YouTube network calls remain for community media.

**Relevant files:** `main.py` (`_enrich_community_media_sync` + a new
`_steam_community_ugc_for_appid` fetch/parser + sanitizer field preservation), `src/steam.ts`
(`interleavedCommunityMedia`, `steamCommunityItemsFromMetadata` author/link wiring,
`playhubCommunityProviderIcon`).

**Out of scope:** Steam trailers/movies and community *videos* in the video slot (the tile is
YouTube-only; a later enhancement); guides/discussions/reviews as tiles (reachable via existing
buttons); the matcher, the delisted index. Leave `_youtube_videos_for_title` /
`_rawg_images_for_title` defined (now unused) unless removing them is trivially clean.

**Slug used throughout this plan:** `community-steam-only`

---

## Orchestration Contract

**Slug:** `community-steam-only`

**Plan file:**

```text
docs/plans/2026-07-01_community-steam-only.md
```

**Implementation branch:**

```text
feat/community-steam-only
```

**Round-complete marker:**

```text
/tmp/Playhub-Metadata-local/community-steam-only_finished
```

**Finalized marker:**

```text
/tmp/Playhub-Metadata-local/community-steam-only_finalized
```

**Review notes:**

```text
docs/review/community-steam-only-review-*.md
```

Each review note ends with exactly one status trailer:

```text
STATUS: CHANGES_REQUESTED
```

or:

```text
STATUS: APPROVED
```

---

## Required Agent Protocol

1. Use the **implementer** skill.
2. Work from the repository root.
3. Branch from `dev`.
4. Commit this plan as the first commit on the implementation branch.
5. Follow TDD where behavior changes are testable.
6. Run quality gates before marking any round complete.
7. Do not write your own review.
8. Do not create files under `docs/review/`.
9. Do not delete files under `docs/review/`.
10. Review notes are durable audit records and must be committed.
11. Resolving a review note means:
    - implement the requested changes;
    - run quality gates;
    - commit the code/docs changes;
    - commit the review note itself if it is not already committed;
    - recreate the round-complete marker.
12. After finalization, stop polling and exit cleanly.

---

## Scope discipline

- Implement only the units the plan lists. Do not modify files outside the plan's scope.
- Do not change runtime behavior beyond what the plan specifies. A `refactor` or
  `cleanup` commit must preserve observable behavior.
- Never edit a test's expected value to make a behavior change pass. If a test
  legitimately must change, that change must be required by the plan or a review
  note, and you must record the rationale in the session log.
- If you spot an unrelated improvement, do not make it here — note it in the
  session log for a separate plan.

---

## Setup

Start from `dev`:

```bash
git checkout dev
# ORCH_LOCAL_ONLY: local trial branch, skipping origin pull
git checkout -b feat/community-steam-only
```

Commit this plan first:

```bash
git add docs/plans/2026-07-01_community-steam-only.md
git commit -m "docs(plan): add community-steam-only implementation plan"
```

---

## Implementation Tasks

Backend (`main.py`) + frontend (`src/steam.ts`). TDD the parser + page fetch. Defensive HTML
scraping — any fetch/parse failure yields an empty page (never an exception). No npm deps.

### A. Backend — page-aware fetch + pure parser
- `_parse_steam_community_ugc(self, html_text: str, limit: int = 20) -> list[dict]` (pure,
  unit-tested): parse `apphub_Card` blocks; keep only cards with a UGC image; per card extract
  `url` (the `https://images.steamusercontent.com/ugc/<...>` image, normalize the thumbnail size
  param to a larger width e.g. `imw=512`), `link` (`sharedfiles/filedetails/?id=<id>` or the
  card `href`/`data-modal-content-url`), `author` (`apphub_CardContentAuthorName` anchor text,
  unescaped), `id` (filedetails id or image url), `caption` (card title/text or ""). De-dupe by
  image url; cap at `limit`. Return `[{id,url,caption,author,link}]`.
- `_steam_community_ugc_for_appid(self, appid: int, page: int = 1, limit: int = 20) -> list[dict]`:
  build the keyless homecontent URL with `p=max(1,page)`, `browsefilter=trend`, `numperpage=20`,
  `forceanon=1`, `l=english` (and the per-section page counters set to `p`); fetch with
  `_http_text(url, timeout=15)`; return `_parse_steam_community_ugc(text, limit)`; on any error
  return `[]`. (Confirmed: consecutive `p` values return non-overlapping items.)

### B. Backend — async callable for on-demand pages
- `async def get_steam_community_page(self, app_id: int, page: int = 1) -> dict`:
  resolve the matched `steam_appid` from saved metadata (`self._data["metadata"][str(app_id)]`);
  if none, return `{"items": []}`. Else
  `items = await asyncio.to_thread(self._steam_community_ugc_for_appid, steam_appid, page, 20)`
  and return `{"items": items, "page": page}`. Never raise.

### C. Backend — first page cached at enrich time
- In `_enrich_community_media_sync`: for a matched game set `community_images =
  _steam_community_ugc_for_appid(steam_appid, 1, 20)` (fall back to stored Steam screenshots if
  empty), `community_videos = []`; for unmatched set both `[]`. Remove the YouTube/RAWG calls.
  Keep the `steam_news` pass-through / stamps / sanitize / save as today; do not let a blank
  title early-return skip Steam population.

### D. Backend — preserve UGC fields
- Extend `_sanitize_screenshots` to also carry `author` (cleaned) and `link` (`_https_url`) when
  present (backward-compatible; existing items unaffected).

### E. Backend tests `tests/test_community_steam_only.py` (harness; no network)
- parser: 2-card fixture (one image card, one discussion) → one item with upgraded image url +
  author + filedetails link.
- enrich matched: stub `_steam_community_ugc_for_appid` → 2 items; stub YouTube/RAWG to raise;
  assert saved `community_images` == those items, `community_videos == []`.
- enrich matched, empty feed → falls back to stored Steam screenshots.
- enrich unmatched → both empty; YouTube/RAWG not called.
- `get_steam_community_page`: unknown app → `{"items":[]}`; known app (stub fetch) → items for the
  requested page.

### F. Frontend — honor `p` in the feed intercept (src/steam.ts)
- Add binding in `src/backend.ts`:
  `export const getSteamCommunityPage = callable<[appId:number, page:number], {items:any[];page?:number}>("get_steam_community_page");`
- In `patchFeedMethod` (src/steam.ts:5679-5708), when the URL matches
  `library/appcommunityfeed/(\d+)`, read the requested page from the request args
  (`args[1]?.params?.p`, default 1). Call a new `communityHubPageForApp(appId, page)` that:
  - page 1: use `metadataCache[appId].community_images` if present (fast initial render); if
    empty, fall through to a live fetch;
  - page > 1 (or empty page 1): `const { items } = await getSteamCommunityPage(appId, page);`
  - map the page's items to hub objects via the existing `steamCommunityItemsFromMetadata`
    shaping (reuse the current image-item shape so the native renderer accepts them; wire each
    item's `author` → creator/author fields and `link` → activate/onClick URL; label source
    `"Steam"`); return `{ hub: mappedItems }`.
  - if the page has no items, return `{ hub: [] }` so Steam's native scroll stops paging.
  Keep returning `original(...args)` when there is no match / not a non-Steam app (unchanged).
- Update `interleavedCommunityMedia` to render only `community_images` (labeled Steam), dropping
  the `screenshots`→"IGN" and `community_videos`→"YouTube" buckets. Add a Steam branch +
  `PLAYHUB_COMMUNITY_STEAM_ICON` to `playhubCommunityProviderIcon` (cosmetic).
- Refactor `communityPayloadForApp`/`steamCommunityItemsFromMetadata` as needed so both the
  cached page-1 path and the live page-N path produce the same hub-item shape (factor the
  item-mapping into one helper). Never throw; on error return `{ hub: [] }` (or `original`).

### G. Scope discipline & session log
Only the units above. No matcher/delisted/other changes. Record a session log under
`docs/agent_conversations/` per `AGENTS.md` §9. Note the one on-device tuning point: confirm the
native `p` base (1-based assumed) so page 1 is not duplicated; if 0-based, offset by one.

## Quality Gates

Run before marking any round complete:

```bash
scripts/orchestration/run-quality-gates
scripts/orchestration/check-review-notes-not-deleted
git status --short
```

The round is not complete unless:

1. all requested implementation work is done;
2. all relevant tests pass;
3. build/typecheck gates pass;
4. review notes have not been deleted;
5. the working tree is clean;
6. all code/docs changes are committed.

---

## Verification

Run and confirm:

```bash
export UV_CACHE_DIR=/tmp/Playhub-Metadata-local/.uv
uv run --with pytest -- pytest -q tests/test_community_steam_only.py
scripts/orchestration/run-quality-gates    # tsc --noEmit + rollup build + py_compile + full pytest
git status --short                          # clean
```

Expected: backend tests pass (parser; matched → real UGC page, no videos, YouTube/RAWG not
called; empty-feed fallback; unmatched → empty; `get_steam_community_page` unknown/known);
full gate green; tree clean.

Deferred verification (requires hardware — performed by the human/orchestrator):

1. Rebuild from `dev`, sideload, **Clear cache** → rescan (or reopen a matched game).
2. Open a matched game (e.g. Wobbly Life / Space Marine) → the **Community** section shows **real
   Steam community screenshots/artwork** (author shown, Steam label), with **no** YouTube tiles
   and no RAWG/IGN images; tapping a tile opens the Steam item.
3. **Scroll to the end** → the next page loads (Steam's native infinite scroll calls
   `appcommunityfeed` with `p+1`; confirm new, non-duplicated items appear and it stops cleanly at
   the end). Verify page 1 is **not** duplicated (native `p` assumed 1-based; if a dupe appears,
   offset the backend page by one).
4. Open an unmatched non-Steam game → the Community section is empty (no fabricated content).

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished community-steam-only
```

This writes:

```text
/tmp/Playhub-Metadata-local/community-steam-only_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer community-steam-only`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/community-steam-only-review-*.md
```

When a review note exists or a new review note appears:

1. Read the full review note.
2. If the note ends with:

   ```text
   STATUS: CHANGES_REQUESTED
   ```

   then resume work.

3. Clear the round-complete marker:

   ```bash
   scripts/orchestration/clear-finished community-steam-only
   ```

4. Address every requested change.
5. Run quality gates:

   ```bash
   scripts/orchestration/run-quality-gates
   scripts/orchestration/check-review-notes-not-deleted
   ```

6. Commit code/docs fixes.
7. Commit the review-note file itself if it is not already committed:

   ```bash
   git add docs/review/community-steam-only-review-*.md
   git commit -m "docs(review): record community-steam-only review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished community-steam-only
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer community-steam-only` after the next review note is created.

---

## Approval Handling

If the latest review note ends with:

```text
STATUS: APPROVED
```

then:

1. Confirm every previous review item has been addressed.
2. Confirm all review notes are committed:

   ```bash
   scripts/orchestration/check-review-notes-committed community-steam-only
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize community-steam-only
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Playhub-Metadata-local/community-steam-only_finalized
   ```

6. Stop polling and exit cleanly.

---

## Review Rules

Do not write your own review.

Do not create files under:

```text
docs/review/
```

Do not delete files under:

```text
docs/review/
```

Only the orchestrator writes review notes. Your job is to read them, resolve them, commit them as audit records, and continue the loop.

---

## Finalization Rules

Only finalize after a review note with:

```text
STATUS: APPROVED
```

Finalization is performed with:

```bash
scripts/orchestration/finalize community-steam-only
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Playhub-Metadata-local/community-steam-only_finished
/tmp/Playhub-Metadata-local/community-steam-only_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
