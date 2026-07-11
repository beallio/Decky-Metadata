# Game Info Focus Reset on Subsection Return

**Date:** 2026-07-10
**Objective:** Preserve focus and scroll position when returning from a Game Info
subsection for a matched non-Steam game.

## Root cause

The 2026-07-10 on-device trace for Transformers: Devastation showed that Steam's
`goBack` returned to the correct
`/library/app/3015223078/tab/GameInfo` route. Navigation and history rewriting
were therefore not the source of the reset.

The game-detail route patch reapplied the same cached metadata object on every
render. Although the direct overview and app-data property assignments are
idempotent, each `SetCachedDataForApp` call notifies Steam's app-details
subscribers. Returning from a subsection consequently caused a redundant
Game Info rerender that reset focus and scroll to the Play button.

## Changes

- Added `metadataState.appliedMetadataRef`, keyed by shortcut app ID, to retain
  the exact metadata object reference most recently written to Steam's
  app-details cache.
- Kept all existing overview and app-data mutations on every `applyMetadata`
  call, but gated the `SetCachedDataForApp` block behind reference inequality.
- Recorded the applied reference only after the cache-write block succeeds, so
  a failed early write remains eligible for retry.
- Preserved genuine metadata updates: fetch and screenshot enrichment replace
  the cache entry with a new object, whose different reference triggers new
  app-details cache writes.
- Captured the previously observed game-detail app ID before updating it and
  skipped `refreshDeckyNativeActivityForApp` on same-app rerenders. First entry
  and switching between observed non-Steam games still refresh activity.
- Kept metadata scheduling and reentry-shield arming on every render so the
  quick-link survival behavior remains unchanged.
- Rebuilt the committed `dist/index.js` and `dist/index.js.map` artifacts.

## Validation

- Baseline: `scripts/orchestration/run-quality-gates`
- Task checks: `./run.sh npx tsc --noEmit` and `./run.sh npm run build`
- Final gate: `scripts/orchestration/run-quality-gates`
- Review-note deletion guard:
  `scripts/orchestration/check-review-notes-not-deleted`

The repository has no JavaScript unit-test runner, so no new test framework was
added. The automated gates cover TypeScript integrity, bundle generation,
Python byte-compilation, and the existing backend pytest suite.

## Deferred on-device verification

Before promotion from `dev` to `main`, the human/orchestrator must repeat the
planned Game Info -> Discussions -> B flow three times on Transformers:
Devastation and confirm focus/scroll is retained. Verification must also confirm
that quick links survive, descriptions and screenshots remain intact, first-open
metadata still appears, switching games applies the new game's metadata and
activity, and the return render no longer coincides with redundant app-details
cache notifications. A real Steam game should be checked for behavior parity.
