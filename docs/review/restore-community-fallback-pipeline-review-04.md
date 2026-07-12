# Review — restore-community-fallback-pipeline (round 04)

Branch: `feat/restore-community-fallback-pipeline`
Directive plan: `docs/plans/2026-07-12_restore-community-fallback-pipeline.md`
(committed `19fe03e`; supersedes the remaining frontend work in the 2026-07-11
plan).

## Verdict

**CHANGES_REQUESTED — pivot.** Full-plugin on-device testing (rounds 1–3)
established two things that redirect this work:

1. Opening a synthetic community card issues **zero** published-file
   detail/comment/reaction requests — it opens Steam's native
   `FullModalOverlay` image lightbox. The `synthetic detail shields` apparatus
   shields a call that never happens, and its targets are getter-only,
   non-configurable exports that `beforePatch` cannot patch (logs
   `status='pending'` forever). **Remove it.**
2. The remaining real bugs are in the frontend card *shape*: a `"?"` avatar
   (empty `avatar`/`steamid:"0"`) and a lightbox that a controller cannot close
   (touch works). The original PlayHub card shape (`6ddc9de:src/steam.ts`)
   fixes both.

Implement the round-4 plan exactly. Do not resurrect the shield.

## Required changes (see the plan for full detail)

1. **Delete the synthetic-detail-shields apparatus** — in `src/steam/activity.ts`
   (`ensureCommunityDetailShields`, retry/cancel state, `findModuleChild` install
   block, `moduleIdFor`/`reportDetailShield`, the `fallback-render` trigger, the
   logging, and the now-unused imports) and in `src/communityFeed.ts`
   (`communityDetailFetcherMethodNames`, `shieldSyntheticCommunityCall`, and
   `allSyntheticCommunityIds` if unused). Delete the corresponding tests in
   `src/communityFeed.test.ts`. **Keep** `isDeckyCommunityId` and the community
   **vote** patch.

2. **Backend `link` field (additive only)** — add `link` to
   `CommunityFallbackItem` (`src/types.ts`); populate it in
   `backend/providers/community.py` (scrape items → validated sharedfile link;
   metadata items → the record `source_url` passed through from
   `get_community_fallback_page`, falling back to the image URL when `source_url`
   is not a valid `https://` URL). No other backend behavior change.

3. **Port the PlayHub card shape** into `fallbackPageToNativeHub`
   (`src/communityFeed.ts`) per `6ddc9de:src/steam.ts` `steamCommunityItemsFromImages`:
   provider-icon avatars on all avatar fields (card-level and `creator.*`; reuse
   the exact icon data-URI constants from `6ddc9de`), realistic
   `steamid:"76561197960287930"`, `url`/`link`/`external_url`/`strURL` =
   `item.link || item.image_url`, and the media fields the lightbox reads
   (`spoiler_tag`, `content_descriptorids`, `reactions`, `votes_*`,
   `num_comments_public`, descending `time_created`).

4. **Tests** — update `communityFeed.test.ts` to assert avatar fields,
   `external_url`/`strURL`, non-`"0"` steamid, and `type:5`; extend
   `tests/test_community_fallback.py` for the `link` population and unsafe
   `source_url` fallback. The ignimgs-vs-scraper and page-clamp regressions must
   still pass unchanged.

5. **Deploy-gap note** — record in the plan's Verification section and in
   `docs/runbooks/on-device-verification.md` that backend (`main.py`/`backend/`)
   changes are NOT exercised by `verify-change --device` (bundle-only) and require
   a full-plugin `package-push --build --push` + Decky-UI install for on-device
   verification and release.

## Not your job this round

On-device verification (image render, `"?"` gone, controller-close, no
shield logs) is performed by the orchestrator against a full-plugin install. Make
the frontend outcome observable in logs where practical, but do not gate the
round-complete marker on device results you cannot see.

STATUS: CHANGES_REQUESTED
