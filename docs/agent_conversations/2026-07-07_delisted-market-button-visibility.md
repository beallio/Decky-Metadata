# Session Log: delisted-market-button-visibility

## Objective
Implement durable Steam store availability metadata to properly hide the Market button for delisted matches.

## Files changed
- `src/types.ts`: Added `steam_store_state` field.
- `src/steam/metadataPatch.ts`: Added logic to set `bCommunityMarketPresence = false` for delisted games.
- `main.py`: Added `steam_store_state` parsing, normalization, and population during matching.
- `tests/test_delisted_market.py`: Added backend tests for the new metadata field.

## Tasks Done
- Confirmed current behavior sets `bCommunityMarketPresence = true`.
- Added `steam_store_state` to types.
- Updated metadata patching logic to hide Market button for delisted apps.
- Updated backend sanitization to normalize `steam_store_state`.
- Plumbed `steam_store_state` through `_delisted_scan_match_sync` and `_metadata_with_steam_news_sync`.

## Deferred
- On-device verification will be run after build.
