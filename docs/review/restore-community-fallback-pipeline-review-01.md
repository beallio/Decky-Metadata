# Review — restore-community-fallback-pipeline (round 01)

Branch: `feat/restore-community-fallback-pipeline`
Reviewed against: `docs/plans/2026-07-11_restore-community-fallback-pipeline.md`
Reviewed commit: `2110fe9`

## Verdict

Static review **PASS**; round **held (not merged)** on the plan's mandatory
on-device verification gate, which could not run because the Deck is offline.
This is an environment block, not a code defect — the implementation faithfully
covers every code-level requirement and the implementer documented the gap
honestly rather than fabricating verification.

## Gate status

- `tsc --noEmit`: pass
- `npm run build` / rollup bundle regenerated: pass
- vitest: 30 passed
- pytest: 243 passed (incl. `test_metadata_converter_accepts_ign_cdn_but_scraper_converter_rejects_it`)
- `git diff --check`: pass
- review-notes-not-deleted: pass
- **on-device SteamUI verification: NOT RUN — Deck unreachable**
  (`deck-reachability: Optional Deck is offline`; `ssh 10.168.168.20:22 No route to host`)

## Code-level review (all confirmed present and correct)

- Permissive metadata-screenshot converter accepts any sanitized `https` host
  (`community.metadata_screenshots_to_fallback_items`); scraper converter keeps
  the `images.steamusercontent.com/ugc/` + `imw=512` allowlist + sharedfile-link
  requirement (`community.steam_image_url` / `sharedfile_url`). Regression test
  proves the split.
- Fallback precedence in `Plugin.get_community_fallback_page`:
  real `steam_appid` → steam-scrape → stored metadata screenshots → `none`.
- Native content always wins: `resolveCommunityFeed` returns native when
  `nativeHubHasContent`; `resolveCommunityRequest` only enters fallback for
  non-Steam shortcuts; real Steam apps bypass entirely.
- Pinned Steam identity preserved on apply/auto-fetch
  (`Plugin._merge_fetched_metadata`).
- Synthetic `90909…` IDs (`syntheticCommunityId`) recognized by
  `isDeckyCommunityId`; `shieldSyntheticCommunityCall` returns empty for
  all-synthetic batches.
- Bounded HTTP read (`_http_text` `max_bytes`); transport-aware paging
  (`requestedCommunityPage` covers query/body/cursor, not only `?p=`).
- NMH2 stale-match correctly recorded as out-of-scope.

## Required before this round can be approved (all on-device)

1. **Synthetic-ID shield target discovery.** The shield installs via
   `findModuleChild` matching `Function.prototype.toString` against
   `/published.?file/i` + `/detail|comment|reaction/i`. On the live *minified*
   client those bodies are renamed. Confirm on-device that the heuristic binds
   the correct method(s) — if it binds none, synthetic cards will trigger real
   published-file detail/comment/reaction lookups (spinners/errors). Capture the
   discovered method keys from the `synthetic detail shields` log line.
2. **Paging transport.** Confirm which transport the live client uses (query
   vs POST body vs cursor) so `requestedCommunityPage` reads the right page.
3. **Deploy + smoke + fixture.** `scripts/decky verify-change dev --device`,
   `scripts/deck/verify/run_all.sh`, and the Wolverine `3156562597` fixture:
   assert ignimgs images load in the Community tab and page 2 is empty for the
   ≤20-screenshot record. No game launch unless explicitly authorized.

## Note

Resume is intentionally deferred: the implementer cannot clear this block while
the Deck is unreachable. Once the tunnel/Deck is restored, the on-device suite
runs (orchestrator-driven or a follow-up round) before any merge to `dev`, and
the `dev → main` promotion remains a human gate.

STATUS: CHANGES_REQUESTED
