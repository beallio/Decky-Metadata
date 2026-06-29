# 2026-06-28 - SteamOS platform capabilities

## Objective

Implement `docs/plans/2026-06-28_steamos-platform-capabilities.md` by exposing a
shared backend platform-capabilities callable and showing a compact diagnostics
readout in the Decky settings panel.

## Files Modified

- `main.py`
- `tests/test_platform_capabilities.py`
- `src/types.ts`
- `src/backend.ts`
- `src/components.tsx`
- `src/i18n.ts`
- `dist/index.js`
- `dist/index.js.map`
- `README.md`
- `docs/agent_conversations/2026-06-28_steamos-platform-capabilities.md`

## Design Decisions

- Reused the existing Steam path helpers, Windows registry reader, SteamUI
  loopback directory helper, Pillow availability check, and image proxy port.
- Kept platform probing defensive: failures degrade to safe defaults instead of
  raising through the Decky callable.
- Added the diagnostics UI as a collapsed settings-panel readout and kept it
  local-only. It displays platform data and capability flags, but no
  RetroAchievements/OpenXBL credentials or token material.

## Validation

- Baseline before changes: `scripts/orchestration/run-quality-gates` passed.
- TDD red run: `./run.sh uv run --with pytest -- pytest -q tests/test_platform_capabilities.py`
  failed because the new helpers/callable did not exist.
- Backend green run: `./run.sh uv run --with pytest -- pytest -q tests/test_platform_capabilities.py`
  passed.
- Frontend verification: `./run.sh npx tsc --noEmit` passed.
- Bundle regeneration: `./run.sh npm run build` passed and updated `dist/`.

## Deferred Verification

- Confirming on a real Steam Deck that diagnostics reports `is_steamos=true`
  and a valid Steam root requires hardware.
- Confirming on Windows that diagnostics reports `is_windows=true` and Windows
  Steam roots requires a Windows host.
