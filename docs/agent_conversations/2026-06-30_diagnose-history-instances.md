# 2026-06-30 Diagnose History Instances

## Task Objective

Implement the diagnostics-only plan in `docs/plans/2026-06-30_diagnose-history-instances.md` to enumerate Steam Router history-like instances and trace their `push`/`replace` calls when Store/Community/Discussions/Guides navigation targets `/routes/steamweb` or carries a Steam store/community URL.

## Files Modified

- `src/steam.ts`
- `dist/index.js`
- `dist/index.js.map`
- `docs/agent_conversations/2026-06-30_diagnose-history-instances.md`

## Design Decisions

- Added `installHistoryInstanceTrace(unpatchers)` with an idempotent `globalThis.__playhubHistoryInstanceTrace` guard.
- Enumerated bounded Router-tree roots from `Router`, `Router.WindowStore`, `SteamUIStore`, and `App` using guarded own-property access, depth/node limits, and a key-name filter.
- Recorded history-like objects by dotted label and logged the discovered labels once through `frontendLog("trace", "history instances", ...)`.
- Wrapped each unique history object's `push` and `replace` methods only once, logged qualifying calls through `frontendLog("trace", "history call", ...)`, and always forwarded the original arguments unchanged.
- Kept the change diagnostics-only. It does not rewrite route state, matching data, appdetails, redirects, or navigation behavior.
- This temporary instrumentation should be removed once on-device logs identify the history instance to patch in the follow-up plan.

## Validation Results

- Baseline before edits: `scripts/orchestration/run-quality-gates` passed.
- Targeted TypeScript check after implementation: `./run.sh npx tsc --noEmit` passed.
- Full gate after implementation: `scripts/orchestration/run-quality-gates` passed.
- Deferred hardware verification remains per the plan: sideload the plugin, tap native Store/Community/Discussions/Guides buttons, and capture the `history call` instance label from `playhub-metadata.log`.
