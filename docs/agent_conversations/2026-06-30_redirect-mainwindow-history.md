# 2026-06-30 Redirect MainWindow History

## Task Objective

Implement `docs/plans/2026-06-30_redirect-mainwindow-history.md` so Steam Big Picture
native app-page Store, Community, Discussions, Guides, and Market navigation rewrites
synthetic shortcut Steam URLs to the matched real Steam app through the correct
main-window history instance.

## Files Modified

- `src/steam.ts`
- `docs/agent_conversations/2026-06-30_redirect-mainwindow-history.md`

## Design Decisions

- Added a guarded `installMainWindowHistoryRedirect` installer for
  `SteamUIStore.m_WindowStore.MainWindowInstance.m_history`, with the existing
  router main-window history as a fallback.
- Retried history installation on a short timer when the target history was not
  ready at patch time, and cleared the retry timer during teardown.
- Mutated `state.url` in place before calling the original `push` or `replace`,
  matching the plan's required data path for `/steamweb` navigation.
- Extended Steam web-link parsing to handle `appid` query parameters on Steam
  store/community URLs while preserving existing `/app/<id>` precedence.
- Left the existing diagnostics and router-history rewrite in place for this
  scoped implementation round.

## Validation Results

- Baseline before code changes: `./run.sh scripts/orchestration/run-quality-gates` passed.
- After frontend edit: `./run.sh npx tsc --noEmit` passed.
- Final quality gate: `./run.sh scripts/orchestration/run-quality-gates` passed.
