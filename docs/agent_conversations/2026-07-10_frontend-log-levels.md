# Frontend Log Levels

Date: 2026-07-10

## Objective

Allow selected frontend messages to reach the backend file log when plugin
debug logging is disabled, while keeping every existing caller that omits a
level at DEBUG.

## Root Cause

The `frontend_log` backend callable hard-coded every bridged frontend message
to `logging.DEBUG`. In the default on-device configuration,
`decky.logger` has an INFO threshold, so the logger discarded every frontend
record before it could reach the file handler. This made the cold-boot patch
installation status lines invisible unless debug logging was enabled.

## Files Modified

- `main.py`
- `src/backend.ts`
- `src/steam/install.ts`
- `src/index.tsx`
- `tests/test_frontend_log_levels.py`
- `dist/index.js`
- `dist/index.js.map`
- `docs/agent_conversations/2026-07-10_frontend-log-levels.md`

## Design Decisions

- Extended the existing `frontend_log` callable with a trailing optional
  `level` argument instead of adding or renaming a backend callable.
- Normalized level names case- and space-insensitively and mapped `debug`,
  `info`, `warning`/`warn`, and `error` to Python logging constants. Missing,
  invalid, and non-string values fall back safely to DEBUG.
- Preserved backward compatibility: frontend calls with the original first
  three arguments still emit at DEBUG and the existing backend contract test
  remains unchanged.
- Added an optional TypeScript severity union to the existing `frontendLog`
  binding without changing its first three parameters.
- Promoted exactly four cold-boot status messages: successful patch
  installation to INFO, patch polling exhaustion to WARNING, and both delayed
  and top-level installation failures to ERROR. Their existing area, message,
  fields, and fire-and-forget rejection handling remain unchanged.

## Validation

- Baseline `scripts/orchestration/run-quality-gates`: passed with 146 tests.
- Test-first run of `tests/test_frontend_log_levels.py`: failed as expected
  because `frontend_log` did not yet accept a fourth argument.
- Focused backend suite covering the new tests, the unchanged legacy
  `frontend_log` tests, and logging-level behavior: passed with 18 tests.
- `./run.sh npm run build`: passed and regenerated the committed bundle and
  source map.
- Final orchestration quality gates and review-note deletion check: passed.

The existing rollup circular-dependency warning remains unchanged.

## Deferred On-Device Verification

Before promotion from `dev` to `main`, the human/orchestrator must install the
built plugin on a Steam Deck and cold boot with debug logging disabled. The file
log should contain the INFO `steam patches installed` record while ordinary
DEBUG trace records remain absent. The warning/error paths should be checked
when practical, and enabling debug logging should restore the existing trace
records. This device-only verification was not performed by the implementer.
