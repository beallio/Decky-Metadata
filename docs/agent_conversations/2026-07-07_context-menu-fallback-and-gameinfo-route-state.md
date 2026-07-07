# Session Log: context-menu-fallback-and-gameinfo-route-state
Date: 2026-07-07
Task Objective: Fix top-level context-menu fallback without restoring submenu leakage, and replace untargeted Game Info shielding with targeted route state.

## Observations
1. Context-menu leak is fixed, but the top-level non-Steam game menus are blocked. We need to allow fallback app-id insertion for top-level game context-menu shapes.
2. Game Info quick-link issue persists because metadata decision hook is route-blind. We need a targeted route shield keyed to the shortcut app id and armed route.

## Plan
1. Fix top-level context-menu fallback in src/contextMenuPatch.tsx
2. Implement targeted route shield in src/steam/core.ts, src/steam/routerPatches.ts, and src/steam/metadataPatch.ts
3. Run verification and commit.

## Validation
1. `npm run build` completed successfully.
2. `scripts/orchestration/run-quality-gates` passed with 100% OK.
3. Local verification is complete. On-device verification is deferred.
