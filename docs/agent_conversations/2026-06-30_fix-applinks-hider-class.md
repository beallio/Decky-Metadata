# 2026-06-30 - fix-applinks-hider-class

## Task Objective

Implement `docs/plans/2026-06-30_fix-applinks-hider-class.md` so the unmatched
non-Steam app-links hider targets Steam's runtime hashed app-details `LinkRow`
class instead of relying only on the literal `LinkRow` substring.

## Files Modified

- `src/steam.ts`
- `dist/index.js`
- `dist/index.js.map`
- `docs/agent_conversations/2026-06-30_fix-applinks-hider-class.md`

## Design Decisions

- Added a guarded runtime resolver for the app-details CSS module that exports
  `LinkRow`, `LinkRowText`, and `LinkRowIcon`.
- Kept the existing `[class*="LinkRow"]` fallback when the module is not yet
  available.
- Resolved inside the existing 400ms hider update loop until a hashed class is
  found, then cached the result to avoid repeated module scans.
- Left the unmatched-page detection and body-class toggle unchanged.

## Validation Results

- `./run.sh scripts/orchestration/run-quality-gates` passed.

## Deferred Verification

Hardware/on-device Steam UI verification remains deferred to the orchestrator or
human reviewer per the implementation plan.
