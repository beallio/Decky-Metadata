# Redirect Store ShowStore Session

Date: 2026-06-30

## Objective

Implement `docs/plans/2026-06-29_redirect-store-showstore.md` so native SteamUI
Store Page actions using `SteamClient.Apps.ShowStore(<appid>)` remap matched
shortcut appids to their real Steam appids.

## Files Modified

- `src/steam.ts`
- `dist/index.js`
- `dist/index.js.map`
- `docs/agent_conversations/2026-06-30_redirect-store-showstore.md`

## Design Decisions

- Added a numeric appid opener patch inside the existing Steam navigation
  redirect installation path, sharing the existing `__playhubNavRedirect`
  idempotency guard and teardown list.
- Patched only `SteamClient.Apps.ShowStore` at argument index 0.
- Logged only actual synthetic-to-real appid remaps through the existing
  `frontendLog("nav", "steam link", ...)` bridge.
- Left URL opener redirect logic, matching, shortcut detection, and backend
  behavior unchanged.

## Validation

- Baseline: `scripts/orchestration/run-quality-gates` passed before edits.
- Targeted frontend check: `./run.sh npx tsc --noEmit` passed.
- Targeted bundle build: `./run.sh npm run build` passed.
- Implementation gate: `scripts/orchestration/run-quality-gates` passed after
  the code and bundle changes.

## Deferred Hardware Verification

Hardware validation remains deferred to a real Steam Deck: on a matched shortcut,
the native Store Page button should open the matched app's store page and emit a
`[playhub:nav] steam link kind='store' ...` rewrite log line; real Steam apps
should remain unchanged and should not log a remap.
