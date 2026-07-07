# 2026-07-06 - gameinfo-quicklinks-and-menu

## Objective

Implement the `gameinfo-quicklinks-and-menu` plan:

- Keep Steam GameInfo quick-link buttons visible after returning from a steamweb subsection for matched non-Steam games.
- Keep the "Decky metadata..." context-menu item only in the main per-game menu, never inside the Manage submenu.

## Files Modified

- `src/contextMenuPatch.tsx`
- `src/steam/metadataPatch.ts`
- `src/steam/routerPatches.ts`
- `src/steam/install.ts`
- `dist/index.js`
- `dist/index.js.map`
- `docs/agent_conversations/2026-07-06_gameinfo-quicklinks-and-menu.md`

## Design Notes

Bug A is evidence-conditioned. The diagnosis is that returning from a steamweb subsection re-renders the already-mounted GameInfo tree without re-arming the `metadataState.bypassBypass` render shield. A truth-window arm during that same re-render can make `BIsModOrShortcut` return `true`, so Steam renders the quick-link row without the Store Page / Community Hub / Discussions / Guide / Market / Support buttons.

The implementation adds debug-gated trace points for truth-window arms and truth-window hits. The hot paths check a module-level bypass trace flag first so debug-disabled operation does not call the backend logger. On-device verification must confirm that a `"reentry shield armed"` trace occurs before the return re-render and that no matching `"bypass truth window hit"` occurs for that appid during the return.

The reentry shield is installed against the main-window history and mirrors the existing route-render shield value by setting `metadataState.bypassBypass = 11` only for matched non-Steam game-detail destinations. It wraps `goBack` and `go` when history entries and index are available, and also registers a `history.listen` fallback. All wrapper logic is best-effort and falls through to Steam navigation on errors.

Bug B is fixed by gating every context-menu injection path with `isGameContextMenu`. `removeOurEntry` remains unconditional so leaked entries are cleaned from any menu instance on later renders. `insertOurEntry`'s `AppProperties` anchor is unchanged: after the gates, it only runs against the main game menu top-level list, where placing the entry above Manage or at the end is acceptable.

## Validation

- `./run.sh scripts/orchestration/run-quality-gates` passed before the first plan commit.
- `./run.sh npx tsc --noEmit` passed after the source changes.
- `./run.sh npm run build` passed after the source changes and regenerated `dist/`.
- `./run.sh scripts/orchestration/run-quality-gates` passed after the source changes.
- `./run.sh scripts/orchestration/check-review-notes-not-deleted` passed after the source changes.

## Deferred On-Device Verification

The plan requires Steam Deck verification before `dev` to `main`: matched non-Steam quick links must survive the GameInfo subsection round-trip, debug logs must confirm the shield timing, launch truth windows must remain intact, unmatched shortcuts must remain hidden, real Steam game pages must remain unchanged, and Manage submenu injection must not recur.
