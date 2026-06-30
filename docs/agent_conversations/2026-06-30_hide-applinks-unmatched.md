# 2026-06-30 - hide-applinks-unmatched

## Task Objective

Implement the existing plan at `docs/plans/2026-06-30_hide-applinks-unmatched.md` to hide Steam's native app-link row on unmatched non-Steam game detail pages while leaving matched games and real Steam apps unchanged.

## Files Modified

- `src/steam.ts`
- `dist/index.js`
- `dist/index.js.map`
- `docs/agent_conversations/2026-06-30_hide-applinks-unmatched.md`

## Design Decisions

- Added an idempotent `installUnmatchedAppLinksHider` hook from `installSteamPatches`.
- Injected a scoped `body.playhub-hide-applinks [class*="LinkRow"]` CSS rule using the on-device-derived `LinkRow` selector. The selector may need hardware tuning if SteamUI changes or if it over-hides adjacent UI.
- Tied the body class to the current game detail route and only enabled it for non-Steam shortcuts with no mapped `steam_appid`.
- Teardown clears the interval, removes the body class, removes the injected style, and clears the global guard.

## Validation Results

- `scripts/orchestration/run-quality-gates` passed after the frontend change.

