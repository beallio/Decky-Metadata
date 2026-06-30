# 2026-06-30 redirect-steamweb-route

## Objective

Implement the existing plan in `docs/plans/2026-06-30_redirect-steamweb-route.md` to trace
`/routes/steamweb` history state and rewrite Steam store/community URLs inside that state from
synthetic shortcut app ids to matched Steam app ids.

## Files Modified

- `src/steam.ts`
- `docs/agent_conversations/2026-06-30_redirect-steamweb-route.md`

## Design Decisions

- Kept the change inside the existing navigation trace `pushState`/`replaceState` wrapper.
- Added `safeStringifyTrace` for bounded, circular-safe state logging.
- Added `rewriteSteamwebNavState` to structured-clone and depth-bound walk the route state,
  rewriting string URLs through the existing `rewriteSteamLinkToMatchedApp` helper.
- Left all other redirect/openers/matching code unchanged.
- Did not add frontend test tooling because the plan explicitly states there is no TypeScript
  test runner for this frontend-only change; validation uses the project quality gate.

## Validation

- Baseline before edits: `./run.sh scripts/orchestration/run-quality-gates` passed.
- Targeted after source edit: `./run.sh npx tsc --noEmit` passed.
- Final gate: `./run.sh scripts/orchestration/run-quality-gates` passed.
- Review note integrity: `./run.sh scripts/orchestration/check-review-notes-not-deleted` passed.
