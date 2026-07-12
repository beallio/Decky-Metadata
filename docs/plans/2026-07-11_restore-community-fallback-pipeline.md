# Plan: Restore Community Fallback Pipeline (restore-community-fallback-pipeline)

## Context

The Community tab currently has one content path: for a non-Steam shortcut with a
saved `steam_appid`, `src/steam/activity.ts` rewrites
`library/appcommunityfeed/<shortcut-id>` to the matched Steam app ID and returns
Steam's native response. If there is no saved Steam ID, or the native response is
empty, the original shortcut request returns `{cached:false,error:"No Content",hub:[]}`
and the tab has nothing to render even when the metadata record contains IGN or
other sanitized screenshots.

The former community pipeline fetched Steam Community `homecontent` HTML,
regex-parsed visual cards, and built synthetic feed items. It was removed in
`community-feed-cleanup` because its handcrafted item shape was silently rejected
by SteamUI and its frontend consumer was already dead. This implementation must
restore the useful data sources, not copy the broken response shape. A live
SteamUI probe on 2026-07-11 confirmed that the current native endpoint returns
`{cached,hub}` and that visual hub items use the field contract specified below.

**Chosen behavior (confirmed with the user):** use a layered fallback. Native
Steam content always wins. For a stored Steam app ID whose native hub is empty,
try the restored Steam HTML scraper. If no usable Steam content exists, synthesize
source-labeled image cards from any sanitized stored metadata screenshots. Do not
fabricate Steam users, engagement, reactions, or a guessed Steam app ID.

The same change must close the known identity-loss path in the metadata editor:
applying an IGN search result currently replaces the whole record and can silently
clear a manually pinned `steam_appid`. Fetched descriptive metadata must preserve
existing Steam-owned fields unless the user explicitly clears the pin through the
existing Steam ID control.

The implementation spans the backend provider/RPC surface (`backend/providers/`,
`main.py`), the typed frontend bridge and pure feed helpers (`src/backend.ts`,
`src/communityFeed.ts`, `src/types.ts`), the Steam HTTP patch
(`src/steam/activity.ts`), the metadata editor (`src/MetadataPage.tsx`), tests,
the committed Rollup artifact, README, a durable behavior spec, and the required
session log.

### Required behavior and source precedence

For non-Steam shortcuts only:

1. Call the native Community endpoint, rewriting to a positive saved
   `steam_appid` when present.
2. If native returns a non-empty `hub` array, return that object unchanged.
3. If a known Steam ID returns no usable native content, scrape that app's Steam
   Community `homecontent` page and synthesize image cards from visual entries.
4. If scraping is unavailable or empty, or no Steam ID exists, synthesize cards
   from the record's sanitized `screenshots` in stable 20-item pages.
5. If all sources are empty, preserve the native empty response. Real Steam
   applications bypass all fallback behavior.

Synthetic items are image-only native type `5` cards. Their creator label must
identify the source (`Steam Community`, `Steam Community · <author>`, the metadata
record's `source`, or `Metadata`), while comments, votes, reactions, ratings, and
Steam identity remain empty/zero. Do not restore YouTube, RAWG, embedded base64
provider icons, `community_videos`, persisted `community_images`, or background
community enrichment.

**Metadata-screenshot cards are hosted on non-Steam CDNs — this is load-bearing.**
The strict `images.steamusercontent.com/ugc/` host allowlist and the `imw=512`
upsize described for the Steam scraper (task 2) apply to the **scraper path only**.
The metadata-screenshot converter must accept any URL that passes the backend's
existing `_https_url`/`https_url` gate (any `https://` host), and preserve the
stored `width`/`height` as-is. If the scraper's Steam-host allowlist is reused for
metadata cards, every stored screenshot is dropped and the feature produces zero
cards for exactly the unmatched games it exists to serve. Do not deduplicate on
Steam-specific fields for metadata cards.

### Device-confirmed inputs (2026-07-11)

A read-only probe of the live on-device store
(`~/homebrew/settings/Decky-Metadata/decky_metadata.json`, 21 records) confirms
the data this fallback depends on actually exists and pins the contracts above:

- Every non-Steam record with no `steam_appid` already has stored screenshots
  (7 of 7; e.g. X-Men Origins: Wolverine `3156562597` → 17 screenshots, source
  `IGN`). There are currently zero unmatched records with no screenshots, so the
  metadata fallback path — not the `source:"none"` path — is the one that matters.
- Those screenshot URLs are hosted on `assets1.ignimgs.com` /
  `assets2.ignimgs.com`, **not** `images.steamusercontent.com`. All are `https://`.
  This is why the metadata converter must not inherit the scraper's Steam-host
  allowlist.
- Stored IGN screenshots have empty `caption` and small dimensions (e.g.
  `640x340`). Synthetic cards will therefore be image-only with no title text and
  a source label of `IGN`; this is expected and must not be treated as a defect.
- Record screenshot counts are `<= 20` in practice (`_sanitize_screenshots` caps
  at 30), so the metadata fallback is effectively single-page for real data (see
  task 4 pagination note).

**Slug used throughout this plan:** `restore-community-fallback-pipeline`

---

## Orchestration Contract

**Slug:** `restore-community-fallback-pipeline`

**Plan file:**

```text
docs/plans/2026-07-11_restore-community-fallback-pipeline.md
```

**Implementation branch:**

```text
feat/restore-community-fallback-pipeline
```

**Round-complete marker:**

```text
/tmp/Decky-Metadata/restore-community-fallback-pipeline_finished
```

**Finalized marker:**

```text
/tmp/Decky-Metadata/restore-community-fallback-pipeline_finalized
```

**Review notes:**

```text
docs/review/restore-community-fallback-pipeline-review-*.md
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
git checkout -b feat/restore-community-fallback-pipeline
```

Commit this plan first:

```bash
git add docs/plans/2026-07-11_restore-community-fallback-pipeline.md
git commit -m "docs(plan): add restore-community-fallback-pipeline implementation plan"
```

---

## Implementation Tasks

Work in dependency order and follow TDD. Before changing code, run
`scripts/decky doctor` and `scripts/decky verify-change dev --explain` as required
by `AGENTS.md`. Preserve the current native passthrough for matched games while
adding the fallback around it.

1. **Define typed fallback contracts.**
   - In `src/types.ts`, add:

     ```ts
     type CommunityFallbackSource = "steam-scrape" | "metadata" | "none";

     type CommunityFallbackItem = {
       id: string;
       title: string;
       description: string;
       image_url: string;
       width: number;
       height: number;
       author: string;
     };

     type CommunityFallbackPage = {
       source: CommunityFallbackSource;
       page: number;
       items: CommunityFallbackItem[];
     };
     ```

   - Add typed bridge callables in `src/backend.ts`:

     ```text
     getCommunityFallbackPage(appId, page) -> CommunityFallbackPage
     applyFetchedMetadata(appId, slugOrUrl) -> MetadataData | null
     ```

   - Keep the existing `fetchMetadata` callable for callers that only fetch a
     record; the editor's apply action must use the new atomic apply RPC.

2. **Restore the backend Steam Community scraper as a focused provider.**
   - Add `backend/providers/community.py`; keep parsing, URL construction,
     sanitization, and page slicing out of the `Plugin` facade.
   - Build only
     `https://steamcommunity.com/app/<positive-appid>/homecontent/` URLs, using
     the old pipeline's `p`, `itemspage`, screenshot/video/art/guide page,
     `numperpage=20`, `browsefilter=trend`, English, and anonymous/filter
     parameters. Clamp page numbers to the range `1..100`.
   - Reimplement the regex parser covered by the deleted
     `test_community_steam_only.py`: retain visual `apphub_Card` blocks only,
     decode entities, extract caption and author, accept only HTTPS
     `images.steamusercontent.com/ugc/` images, upsize `imw` to `512`, accept
     only valid Steam `sharedfiles/filedetails/?id=<digits>` links, deduplicate
     stable items, and return at most 20.
   - Do not import `html.parser`; preserve the existing unsafe-stdlib guard.
   - Extend the backend HTTP text path with an optional bounded read (or add an
     equivalent community-specific bounded fetch) so the scraper enforces a
     15-second timeout and rejects content larger than 4 MiB before decoding.
     Preserve TLS verification and existing request headers.
   - Add pure helpers that convert parsed Steam cards or stored metadata
     screenshots into the neutral `CommunityFallbackItem` shape. Metadata
     screenshots paginate in stable 20-item slices; page 2 must not repeat page
     1. Unsafe/empty image URLs are omitted.
   - **The metadata-screenshot converter is a distinct helper from the scraper
     converter and must use permissive URL rules.** It accepts any URL that
     passes the existing `_https_url`/`https_url` gate (any `https://` host, e.g.
     `assets1.ignimgs.com`), preserves the stored `width`/`height`, and uses the
     stored `caption` (which is frequently empty) as the item title/description.
     It must NOT apply the scraper's `images.steamusercontent.com/ugc/` host
     allowlist, the `imw=512` upsize, or the `sharedfiles/filedetails` link
     validation. Reusing the scraper's validator here is the primary silent-
     failure mode for this feature (device evidence: all unmatched records are on
     `*.ignimgs.com`).

3. **Expose the read-only fallback RPC in `main.py`.**
   - Add `get_community_fallback_page(app_id, page=1)`. Load the current metadata
     record for the shortcut and return exactly `{source,page,items}`.
   - If the record has a positive `steam_appid`, attempt the Steam scraper first.
     If it yields no items or raises, continue to stored screenshots rather than
     failing the RPC.
   - If no Steam ID exists, skip Steam network calls and use stored screenshots.
   - Return `source:"none"` with an empty list when no source is usable.
   - Log source, shortcut ID, Steam ID, page, item count, and recoverable scraper
     failures at an appropriate diagnostic level. Never log full query-bearing
     URLs or response bodies.
   - This RPC must not modify metadata, write `community_images`, or trigger
     background enrichment.

4. **Create pure SteamUI response helpers.**
   - Extend `src/communityFeed.ts` with exported pure helpers to parse/clamp the
     requested page number, determine whether a native response has a usable hub,
     generate stable synthetic IDs, and map `CommunityFallbackPage` to Steam's
     native hub response.
   - **Do not assume the page number is a `?p=` URL query parameter.** The feed
     patch covers both `get` and `post`; the paging value may live in the POST
     body or a cursor. The page helper must derive the requested page from the
     transport SteamUI actually uses, and this must be confirmed on-device (see
     Verification). Because real records hold `<= 20` screenshots, the metadata
     fallback returns a single page in practice: page 1 carries up to 20 cards and
     page 2+ correctly returns `source:"none"` with an empty list. Keep the stable
     20-item slice so records that ever exceed 20 paginate without repeating, but
     do not add pagination behavior that only functions under an unverified `?p=`
     assumption.
   - Synthetic IDs must start with `90909` so the surviving
     `isDeckyCommunityId` vote-state patch recognizes them. Use a deterministic
     numeric string derived from padded shortcut ID, page, and item index so
     pages cannot collide.
   - Return `{cached: fallback.source === "metadata", hub}` for a non-empty
     fallback and no `error` field.
   - Each synthetic card must have exactly the currently observed visual-item
     fields and defaults:

     ```ts
     {
       published_file_id,
       type: 5,
       title,
       preview_image_url: item.image_url,
       full_image_url: item.image_url,
       image_width: item.width,
       image_height: item.height,
       comment_count: 0,
       votes_for: 0,
       content_descriptorids: [],
       spoiler_tag: null,
       description,
       rating_stars: 0,
       maybe_inappropriate_sex: 0,
       maybe_inappropriate_violence: 0,
       youtube_video_id: null,
       creator: { name: sourceLabel, steamid: "0", avatar: "", online_state: 0 },
       reactions: []
     }
     ```

   - For scraped cards, use `Steam Community · <author>` when an author exists,
     otherwise `Steam Community`. For stored screenshots, use the metadata
     record's non-empty `source`, otherwise `Metadata`. Do not invent a Steam
     profile, social counts, or reactions.

5. **Layer the fallback around the native feed patch.**
   - Refactor only the `library/appcommunityfeed/<appid>` branch of
     `installCommunityFeedPatch` in `src/steam/activity.ts` enough to make the
     control flow unit-testable. Do not change activity-feed handling, real
     Steam behavior, vote suppression, or unrelated Steam patches.
   - For a non-Steam shortcut, call the native request first. Use the existing
     matched-app-ID URL rewrite when `steam_appid` is positive; otherwise use the
     original shortcut URL.
   - Return a non-empty native hub unchanged. Only then request
     `getCommunityFallbackPage(shortcutAppId,page)`.
   - Return a non-empty synthetic payload when available. If fallback is empty,
     preserve a successful native empty response. If a rewritten native request
     rejected and fallback is empty, retain the existing retry against the
     original shortcut URL. Otherwise propagate the original failure.
   - A fallback RPC failure must be logged and handled by the same native
     preservation rules; the plugin must never turn a usable native response
     into an error.
   - Keep GET and POST patching. Add DEBUG diagnostics with app ID, mapped Steam
     ID, page, selected source, and hub length, without sensitive URLs.
   - **Proactively shield native lookups on synthetic `90909…` IDs beyond the
     vote-state call.** The surviving `isDeckyCommunityId` guard only covers the
     community vote query. Opening a synthetic card makes SteamUI request
     published-file details/comments/reactions for an ID with no server record,
     which can throw. Using the same `isDeckyCommunityId` predicate, intercept the
     published-file details/comments/reactions client methods (the ones SteamUI
     invokes for hub items) and return a benign empty result for all-synthetic ID
     batches, exactly as the vote patch already does. Real published-file IDs must
     be untouched and fall through to the original method. Identify the concrete
     method names on-device before wiring the guard, and record them in the
     session log.

6. **Preserve pinned Steam identity across fetched metadata.**
   - Add a small backend merge helper and the
     `apply_fetched_metadata(app_id,slug_or_url)` RPC. It must fetch and sanitize
     the selected descriptive record, merge it with the existing record, save
     once, and return the saved record.
   - When the existing record has a positive `steam_appid`, preserve these
     Steam-owned fields over empty/default values in fetched metadata:
     `steam_appid`, `steam_store_url`, `steam_store_state`,
     `deck_compat_category`, `steam_news`, and `steam_news_enriched_at`.
   - Apply the same merge rule in `auto_fetch_metadata` when that RPC is called
     for an app that already has metadata. Do not alter the scan pipeline's
     existing pinned-field merge.
   - Update `MetadataPage.applyResult` to call `applyFetchedMetadata`, update
     `metadataCache`, apply the saved metadata, refresh the form, and set
     `steamAppIdText` from the actual saved response.
   - Leave `applySteamAppId` and ordinary `save_metadata` replacement semantics
     unchanged. Saving an explicit null ID must remain the deliberate way to
     clear a pin.

7. **Add regression tests before completing implementation.**
   - Restore backend parser coverage using focused new tests rather than
     resurrecting obsolete classes or dead frontend consumers. Cover visual-only
     parsing, entity decoding, thumbnail resizing, malformed/unsafe URLs,
     deduplication, limits, page clamping, bounded responses, and the
     `html.parser` prohibition.
   - Cover RPC source priority: Steam scrape before metadata for a known ID,
     scrape empty/failure to metadata, no ID directly to metadata, stable
     screenshot pagination, and `none` for no usable images.
   - Cover fetched-metadata merging with realistic sanitized IGN data: every
     Steam-owned field survives, while explicit null through the existing save
     path still clears the pin.
   - Add Vitest tests for page parsing, native-hub detection, exact synthetic
     item shape/defaults, source labels, stable page-specific `90909` IDs, and
     empty fallback behavior.
   - **Add a metadata-card URL regression using a real non-Steam CDN URL**
     (e.g. `https://assets2.ignimgs.com/2009/05/04/x-men-origins-wolverine-...jpg`
     at `640x340`, empty caption). Assert the metadata converter emits a card
     with that exact image URL and preserved dimensions, and — critically — that
     feeding the same `ignimgs.com` URL through the scraper converter is rejected.
     This proves the two converters use different URL rules and pins the primary
     silent-failure mode.
   - **Add a synthetic-ID shield test:** a batch of all-`90909…` IDs sent to the
     shielded published-file details/comments/reactions method returns benign
     empty results without calling the original, while a batch containing any real
     ID falls through to the original.
   - Extract/test the feed decision logic so cases prove: native non-empty
     short-circuits fallback; native empty invokes fallback; native rejection
     can use fallback; empty fallback preserves native behavior; and real Steam
     requests bypass the fallback.
   - Keep and extend the existing passthrough rewrite regression. Do not weaken
     unrelated expectations.

8. **Document, build, and keep scope clean.**
   - Add `docs/specs/community-fallback.md` documenting source precedence, RPC
     shapes, native item fields, source labeling, pagination, error behavior,
     and the rule against guessed Steam IDs/fabricated social data.
   - Update README's community feature description to distinguish native Steam
     content, the Steam HTML fallback for known IDs, and stored metadata
     screenshot cards for unmatched games.
   - Run the real Rollup build and commit `dist/index.js` plus its source map.
   - Add the required `docs/agent_conversations/<date>_restore-community-fallback-pipeline.md`
     session summary with decisions, files, tests, and on-device results.
   - Do not touch matching thresholds, delisted-index acquisition, quick-link
     suppression, launch/spoof logic, Activity news, releases, or orchestration
     engine files. Note unrelated findings in the session log only.
   - Unrelated finding to record (do NOT fix here): the on-device record for
     No More Heroes 2: Desperate Struggle (`3317841089`) has `steam_appid: None`
     despite the game being on Steam. Live `storesearch` for its title now returns
     appid `1420300` as an exact match (score would clear the threshold), so the
     stored `None` is stale — recorded when the search missed (pre-listing/region/
     transient failure) and never re-resolved. This belongs to a separate re-match
     plan, not this one.

---

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

Run targeted tests while implementing, then run the complete gate and hygiene
checks before every round-complete marker:

```bash
./run.sh npx vitest run
./run.sh uv run --with pytest -- pytest -q
scripts/orchestration/run-quality-gates
scripts/orchestration/check-review-notes-not-deleted
git diff --check
git status --short
```

Expected: TypeScript type-check, Rollup build, Vitest, Python byte-compilation,
pytest, version drift, review-note preservation, and diff hygiene all pass;
`dist/index.js` represents the source; all changes are committed; the working
tree is clean.

Because this changes `src/steam/`, on-device validation is mandatory before the
round is considered complete. Run the change-aware checks without launching a
game first:

```bash
scripts/decky verify-change dev --device
```

This must pass quick-links and re-render checks. The dispatcher will report the
launch check as outstanding. After the orchestrator/human explicitly authorizes
launching a confirmed-safe matched fixture, complete it with:

```bash
MATCHED_APPID=<confirmed-safe-shortcut-id> \
  scripts/decky verify-change dev --device --allow-launch
```

Do not guess the fixture or launch without that explicit gate.

Perform these manual SteamUI checks on the deployed feature branch and record
the observed app IDs/results in the session log:

1. Open a non-Steam shortcut with no `steam_appid` and stored screenshots
   (confirmed device fixture: X-Men Origins: Wolverine, shortcut appid
   `3156562597`, 17 IGN screenshots). Its Community tab renders source-labeled
   (`IGN`) image cards rather than `No Content`, and the card images actually load
   from their `*.ignimgs.com` URLs (a non-Steam host — verify no host-allowlist
   drop). Confirm later pages do not repeat page 1 and that page 2 is empty for a
   record with `<= 20` screenshots.
2. Open a matched shortcut with a non-empty native Community hub. The response
   remains native, has normal pagination/social data, and logs show the fallback
   RPC was not selected.
3. Open a delisted shortcut with a stored Steam ID. Native content still wins
   when present. The automated scraper/RPC tests cover the native-empty scrape
   branch if no safe live fixture exists.
4. Open a real Steam game. Its Community tab is unaffected.
5. Open synthetic cards and navigate/scroll with the controller. Images render;
   no profile, vote-state, reaction, focus, or console errors occur. Explicitly
   confirm that opening a card triggers no un-shielded native published-file
   details/comments/reactions request against the synthetic `90909…` ID (watch
   the CDP console/network for a failed lookup) — the shield from task 5 must
   absorb it.
6. Apply an IGN search result to a manually pinned non-Steam record. The saved
   Steam ID and other Steam-owned fields remain intact and the visible Steam ID
   field agrees with storage.
7. Explicitly clear that Steam ID through the existing control. The pin clears
   and the metadata-screenshot Community fallback remains available.
8. Audit logs for `native`, `steam-scrape`, `metadata`, and `none` decisions;
   confirm there are no new warnings, tracebacks, sensitive URLs, render-shield
   hijacks, or launch regressions.

No device deployment, navigation, or launch may be silently deferred. If the
Deck is unavailable, stop before marking the round complete and report the named
hardware verification as outstanding to the orchestrator.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished restore-community-fallback-pipeline
```

This writes:

```text
/tmp/Decky-Metadata/restore-community-fallback-pipeline_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer restore-community-fallback-pipeline`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/restore-community-fallback-pipeline-review-*.md
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
   scripts/orchestration/clear-finished restore-community-fallback-pipeline
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
   git add docs/review/restore-community-fallback-pipeline-review-*.md
   git commit -m "docs(review): record restore-community-fallback-pipeline review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished restore-community-fallback-pipeline
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer restore-community-fallback-pipeline` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed restore-community-fallback-pipeline
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize restore-community-fallback-pipeline
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Decky-Metadata/restore-community-fallback-pipeline_finalized
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
scripts/orchestration/finalize restore-community-fallback-pipeline
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Decky-Metadata/restore-community-fallback-pipeline_finished
/tmp/Decky-Metadata/restore-community-fallback-pipeline_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
