# 2026-06-30 - hider-mainwindow-document

## Objective

Implement `docs/plans/2026-06-30_hider-mainwindow-document.md` by moving the unmatched app-links hider DOM injection from the plugin SharedJSContext document into the Steam Big Picture main window document.

## Files Modified

- `src/steam.ts`
- `dist/index.js`
- `docs/agent_conversations/2026-06-30_hider-mainwindow-document.md`

## Design Decisions

- Added a passive resolver for `SteamUIStore.m_WindowStore.MainWindowInstance.m_BrowserWindow.document`, derived from live CEF inspection as the document where `GameInfoQuickLinks` renders.
- Kept the existing class resolver and hide decision logic unchanged.
- Reworked the hider poller so each tick resolves the target document, reinjects the style if the main window document changes, logs DOM class presence from that document, and toggles `playhub-hide-applinks` on that document body.
- Kept teardown best-effort and limited to the injected main window document style/class.

## Validation

- Baseline: `UV_CACHE_DIR=/tmp/Playhub-Metadata-local/.uv ./run.sh scripts/orchestration/run-quality-gates` passed before code changes.
- Final: `UV_CACHE_DIR=/tmp/Playhub-Metadata-local/.uv ./run.sh scripts/orchestration/run-quality-gates` passed after the `src/steam.ts` change and bundle rebuild.
