# 2026-07-01 - Harden Steam patches

## Objective

Implement `docs/plans/2026-07-01_harden-steam-patches.md` so Steam method and route patch callbacks cannot propagate exceptions into Steam UI call paths.

## Files modified

- `src/steam.ts`
- `src/index.tsx`
- `dist/index.js`
- `dist/index.js.map`
- `docs/agent_conversations/2026-07-01_harden-steam-patches.md`

## Design decisions

- Hardened the local `patchMethod` helper so replacement callback failures fall back to the original Steam method.
- Added `safeAfterPatch` and converted the six planned `afterPatch` call sites to return the original `ret` if a handler throws.
- Added `safeInstallStep` around the top-level `install*` calls in `installSteamPatches` without changing their order.
- Guarded the top-level `installSteamPatches()` call in `src/index.tsx` so plugin startup can continue if Steam patch installation throws.
- Left README unchanged because this is defense-in-depth with no user-facing behavior or usage change.

## Validation

- Baseline before implementation: `scripts/orchestration/run-quality-gates` passed.
- After implementation: `scripts/orchestration/run-quality-gates` passed.
- Inspection confirmed the six planned `afterPatch` sites now call `safeAfterPatch`.
- Inspection confirmed the planned `install*` calls in `installSteamPatches` are wrapped in `safeInstallStep`.
