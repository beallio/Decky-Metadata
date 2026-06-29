# 2026-06-29 Diagnostic Logging

## Objective

Implement detailed diagnostic logging for SteamOS troubleshooting from
`docs/plans/2026-06-29_diagnostic-logging.md`.

## Files Modified

- `main.py`
- `src/backend.ts`
- `src/components.tsx`
- `src/contextMenuPatch.tsx`
- `src/index.tsx`
- `src/log.ts`
- `src/steam.ts`
- `dist/index.js`
- `dist/index.js.map`
- `tests/test_logging.py`

## Design Decisions

- Added `_plog(area, message, ...)` and `_redact(...)` as the backend logging path for
  new diagnostic logs, with stable area tags and fail-closed logging.
- Redacted RetroAchievements `y=` query parameters and OpenXBL authorization/API-key
  fields before logging URLs or headers.
- Stored `settings.debug_logging` in the existing settings JSON and exposed
  `get_debug_logging` / `set_debug_logging` callables.
- Added a frontend `src/log.ts` logger and routed Steam patch, bridge, and teardown
  diagnostics through it.
- Added the debug logging toggle to the existing diagnostics panel.
- Kept diagnostics instrument-only; no network, parsing, matching, or return-value
  behavior was intentionally changed.

## Validation

- `./run.sh uv run --with pytest -- pytest -q tests/test_logging.py`
- `./run.sh npx tsc --noEmit`
- `./run.sh npm run build`
- `./run.sh python3 -m py_compile main.py`
- `./run.sh scripts/orchestration/run-quality-gates`

All validation passed.

## Deferred Hardware Verification

On a real Steam Deck, install the plugin, enable debug logging in the diagnostics panel,
reproduce the Deck failure, and inspect Decky's log view or `journalctl` over SSH. Confirm
that the failing stage is identifiable and that RetroAchievements/OpenXBL secrets are not
present in logs.
