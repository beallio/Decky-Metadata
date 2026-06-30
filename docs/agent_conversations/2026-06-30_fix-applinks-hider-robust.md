# 2026-06-30 Fix App Links Hider Robustness

## Objective

Implement `docs/plans/2026-06-30_fix-applinks-hider-robust.md` for the unmatched non-Steam app-links hider.

## Files Modified

- `src/steam.ts`
- `dist/index.js`
- `docs/plans/2026-06-30_fix-applinks-hider-robust.md`
- `docs/agent_conversations/2026-06-30_fix-applinks-hider-robust.md`

## Design Decisions

- Replaced the strict path app-id equality gate with the existing fallback current-game resolver while still requiring a library detail route.
- Kept the CSS-module hash lookup dynamic and added a fallback scan over nested enumerable exports; the live `_1tN7mH20YhTaXLqtoW2hR-` hash is recorded here for reference only and is not hardcoded.
- Added temporary throttled `[playhub:applinks]` diagnostics for the hider decision, resolved classes, app mapping state, and DOM class presence.
- Preserved the passive hider lifecycle: same interval, style-node setup, idempotency guard, and teardown behavior.

## Validation

- Baseline `scripts/orchestration/run-quality-gates` passed before implementation.
- Targeted `./run.sh npx tsc --noEmit` passed after the frontend change.
- Final `scripts/orchestration/run-quality-gates` passed before marking the round complete.
