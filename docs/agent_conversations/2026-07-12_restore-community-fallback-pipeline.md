# Restore Community Fallback Pipeline

## Objective

Restore useful Community-tab fallback sources without restoring the obsolete
handcrafted response contract, and preserve manually pinned Steam identity when
applying fetched IGN metadata.

## Implementation

- Added a focused Steam Community provider with bounded fetching, regex parsing,
  Steam-only visual URL validation, and neutral fallback-item conversion.
- Added a separate metadata screenshot converter that accepts sanitized HTTPS
  non-Steam CDNs, preserves dimensions, and paginates without repetition.
- Added fallback and atomic fetched-metadata RPCs, including pinned Steam-owned
  field preservation for manual apply and auto-fetch paths.
- Added typed frontend contracts, native hub mapping, transport-aware page
  parsing, source precedence, and deterministic `90909` IDs.
- Updated the metadata editor to apply fetched results atomically and refresh
  its visible Steam ID from the saved response.
- Added backend and Vitest regression coverage and regenerated the committed
  Rollup bundle.
- Review round 02 replaced the broad, one-shot published-file discovery with a
  non-throwing query-fetcher fingerprint, bounded retry installation, and a
  retry triggered by the first synthetic fallback response. Shield discovery
  now logs installed, pending, and failed outcomes through the backend logger,
  including the owning webpack module ID, method names, and caught error text.
- Review round 04 removed that shield machinery after device logs proved opening
  a synthetic card makes no published-file detail, comment, or reaction request.
  Its target webpack exports are also getter-only and non-configurable, so the
  assignment-based patch could not install.
- Ported the proven PlayHub card shape with provider avatars, realistic creator
  identity, provider links, and the media fields used by Steam's lightbox.

## Decisions

- Native Steam content always wins and is returned unchanged.
- Scraped cards require the Steam UGC host and a valid shared-file link;
  metadata screenshots deliberately do not share that allowlist.
- Synthetic cards use the historical neutral PlayHub creator identity and zeroed
  social counts so Steam's native card/lightbox model remains controller-friendly.
- Ordinary `save_metadata` replacement behavior is unchanged, so explicitly
  saving a null Steam ID still clears a pin.

## Validation

- `./run.sh uv run --with pytest -- pytest -q tests/test_community_fallback.py tests/test_steam_appid_override.py`: passed.
- `./run.sh npx tsc --noEmit`: passed.
- `./run.sh npx vitest run`: 31 tests passed.
- `scripts/orchestration/run-quality-gates`: passed (31 Vitest tests and 243
  pytest tests, plus TypeScript, Rollup, Python compilation, and version drift).
- `scripts/orchestration/check-review-notes-not-deleted`: passed.
- `git diff --check`: passed.
- Round 04 `./run.sh npx vitest run src/communityFeed.test.ts`: 9 tests passed.
- Round 04 `./run.sh uv run --with pytest -- pytest -q tests/test_community_fallback.py`:
  15 tests passed.
- Round 04 `scripts/orchestration/run-quality-gates`: passed (29 Vitest tests
  and 244 pytest tests, plus TypeScript, Rollup, Python compilation, version
  drift, review-note preservation, and `git diff --check`).

Review round 04 removed the obsolete shield regression tests and added focused
coverage for provider-link selection, provider avatars, creator identity, and
the complete native card shape. The orchestrator's next on-device review will
exercise the card with a controller; no launch is required or authorized.

The Deck was unreachable during initial inspection (`No route to host`). A later
`scripts/decky doctor --deck` retry was run with approved out-of-sandbox network
access and still reported `deck-reachability: Optional Deck is offline`. The
committed branch was then passed to `scripts/decky verify-change dev --device`;
its local quality gate passed, but deployment failed at SSH with `No route to
host` for `10.168.168.20:22`. The
live SteamUI paging transport, concrete minified published-file method names,
deployment, quick-links/re-render checks, and manual fixtures could therefore
not be observed in that round. No game launch was attempted or authorized.

Backend changes are not exercised by `scripts/decky verify-change --device`,
which hot-swaps only `dist/index.js`. Full-plugin verification requires
`scripts/decky package-push --build --push`, installation through the Decky UI,
and then the live smoke/manual checks.

## Unrelated finding

Do not fix in this change: No More Heroes 2: Desperate Struggle (`3317841089`)
has a stale `steam_appid: None`; current store search resolves exact app ID
`1420300`. This belongs to a separate re-match plan.
