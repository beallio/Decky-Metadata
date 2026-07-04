# 2026-07-03 Tracing Behind Debug Flag

## Objective

Implement `docs/plans/2026-07-03_tracing-behind-debug-flag.md` by installing
Steam navigation/history/click diagnostic tracers only when Debug Logging is enabled.

## Files Modified

- `src/steam.ts`
- `tests/test_steam_trace_debug_gate.py`
- `README.md`
- `dist/index.js`
- `docs/agent_conversations/2026-07-03_tracing-behind-debug-flag.md`

## Design Notes

- Non-trace Steam patches still install synchronously and unconditionally.
- `installSteamPatches` resolves `getDebugLogging()` asynchronously, then installs only
  `navigationTrace`, `historyInstanceTrace`, and `clickTrace` when the setting is true.
- If the setting cannot be read, diagnostic traces remain disabled by default.
- A late debug-setting response does not install traces after Steam patches are unpatched.
- Toggling Debug Logging affects diagnostic trace installation on the next plugin reload.

## Validation

- Baseline `scripts/orchestration/run-quality-gates` passed before implementation.
- Red phase: `./run.sh uv run --with pytest -- pytest -q tests/test_steam_trace_debug_gate.py`
  failed because `src/steam.ts` had no debug-gated trace install path.
- Green phase: the same focused pytest command passed after implementation.
- `./run.sh npx tsc --noEmit` passed.
- `./run.sh npm run build` passed and regenerated `dist/index.js`.
- Final `scripts/orchestration/run-quality-gates` passed.
- `scripts/orchestration/check-review-notes-not-deleted` passed.
