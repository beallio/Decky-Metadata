# Community Video Restoration

## Objective

Restore the original PlayHub-style YouTube community videos as an additive,
stored fallback source without adding network work to Community-tab rendering or
regressing screenshot cards.

## Files modified

- `backend/providers/community.py`
- `main.py`
- `src/communityFeed.ts`
- `src/communityFeed.test.ts`
- `src/types.ts`
- `tests/test_community_fallback.py`
- `dist/index.js`
- `dist/index.js.map`
- `docs/specs/community-fallback.md`
- `README.md`
- this session log

## Design decisions

- YouTube search is performed only while fetched metadata is enriched. The
  Community fallback RPC consumes sanitized `community_videos` already stored on
  the metadata record and never invokes YouTube.
- Search reads retain TLS verification, use the shared 15-second/4 MiB bounded
  HTTP path, and collapse every fetch or parse failure to an empty list.
- Video IDs are validated as 11-character YouTube IDs, deduplicated, capped at
  10, and normalized to canonical watch and thumbnail URLs.
- Videos precede stored screenshot fallback items and are marked with
  `youtube_id`; images carry an empty marker. Screenshot cards retain their
  existing `type: 5` output without a `youtube_video_id` property.
- Video cards use the planned native default (`type: 2` plus
  `youtube_video_id`) and put the watch URL on every open-link field. The same
  YouTube provider icon is used across all avatar fields.
- The existing backend and frontend test expectations were extended only where
  the planned `youtube_id` interface required it.

## Validation

- Pre-change `scripts/decky verify-change dev --explain`: passed the full local
  quality gate.
- TDD red runs demonstrated the missing provider functions and image-only card
  mapping before implementation.
- Targeted backend tests: 23 passed after implementation.
- Targeted `src/communityFeed.test.ts`: 10 passed after implementation.
- `./run.sh npx tsc --noEmit`: passed.
- `scripts/orchestration/run-quality-gates`: passed after implementation (30
  Vitest tests and 49 pytest tests, plus TypeScript, Rollup, Python compilation,
  version drift, and `git diff --check`).

The plan defers full-plugin installation and live activation checks to on-device
review. Backend changes require `scripts/decky package-push --build --push` and a
Decky UI install; `scripts/decky verify-change --device` alone deploys only the
frontend bundle. No game launch was requested or authorized.
