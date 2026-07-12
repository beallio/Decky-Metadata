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
  parsing, source precedence, deterministic `90909` IDs, and synthetic lookup
  shields.
- Updated the metadata editor to apply fetched results atomically and refresh
  its visible Steam ID from the saved response.
- Added backend and Vitest regression coverage and regenerated the committed
  Rollup bundle.

## Decisions

- Native Steam content always wins and is returned unchanged.
- Scraped cards require the Steam UGC host and a valid shared-file link;
  metadata screenshots deliberately do not share that allowlist.
- Synthetic cards contain no invented social data or Steam identity.
- Ordinary `save_metadata` replacement behavior is unchanged, so explicitly
  saving a null Steam ID still clears a pin.

## Validation

- `./run.sh uv run --with pytest -- pytest -q tests/test_community_fallback.py tests/test_steam_appid_override.py`: passed.
- `./run.sh npx tsc --noEmit`: passed.
- `./run.sh npx vitest run`: 30 tests passed.
- `scripts/orchestration/run-quality-gates`: passed (30 Vitest tests and 243
  pytest tests, plus TypeScript, Rollup, Python compilation, and version drift).
- `scripts/orchestration/check-review-notes-not-deleted`: passed.
- `git diff --check`: passed.

The Deck was unreachable during initial inspection (`No route to host`). A later
`scripts/decky doctor --deck` retry was run with approved out-of-sandbox network
access and still reported `deck-reachability: Optional Deck is offline`. The
live SteamUI paging transport, concrete minified published-file method names,
deployment, quick-links/re-render checks, and manual fixtures could therefore
not be observed in this round. No game launch was attempted or authorized. The
generic installed shield logs its discovered method keys; those keys and its
runtime behavior still require confirmation against the live client before
promotion.

## Unrelated finding

Do not fix in this change: No More Heroes 2: Desperate Struggle (`3317841089`)
has a stale `steam_appid: None`; current store search resolves exact app ID
`1420300`. This belongs to a separate re-match plan.
