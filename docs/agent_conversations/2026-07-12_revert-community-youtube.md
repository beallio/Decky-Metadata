# Revert Community YouTube

## Objective

Restore the Community fallback to persisted IGN screenshots after on-device
verification showed that synthetic video cards do not render in Steam's native
PlayHub.

## Files modified

- `main.py`
- `backend/providers/community.py`
- `src/communityFeed.ts`
- `src/types.ts`
- `tests/test_community_fallback.py`
- `src/communityFeed.test.ts`
- `dist/index.js`
- `docs/specs/community-fallback.md`
- `docs/agent_conversations/2026-07-12_revert-community-youtube.md`

## Design decisions

- `get_community_fallback_page` reads only the persisted `screenshots` record
  after the Steam-scrape path is exhausted; it performs no live metadata fetch.
- Community fallback items no longer expose `youtube_id`, and the frontend emits
  only the existing native `type: 5` screenshot-card shape.
- The Steam-scrape path, metadata screenshot filtering/pagination, scan gap-fill
  precedence, Steam core import-cycle fix, and launcher-fixture exclusion remain
  unchanged.
- Video-parser, live-media RPC, video-card, and legacy video-storage tests were
  removed because those production interfaces are deliberately removed. The RPC
  regression test now proves persisted screenshots are returned without touching
  live network entry points.

## Validation

- TDD red: the new persisted-screenshot RPC expectations failed against the live
  media implementation and screenshot items still contained `youtube_id`.
- Targeted backend: `16 passed` in `tests/test_community_fallback.py`.
- Targeted frontend: `9 passed` in `src/communityFeed.test.ts`.
- Type-check: `npx tsc --noEmit` passed.
- Full orchestration quality gate passed (type-check, Rollup build, 29 frontend
  tests, backend byte-compile and pytest, version drift, and diff checks).
- Review-note deletion check passed.
- On-device checks are deferred as specified by the implementation plan.
