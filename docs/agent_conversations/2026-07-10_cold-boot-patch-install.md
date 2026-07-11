# Cold-Boot Steam Patch Installation

Date: 2026-07-10

## Objective

Prevent Steam-side patches from dying for the session when Decky Metadata loads
during a cold Steam boot before the app and details store prototypes are ready.

## Root Cause

`installSteamPatches()` previously retried by calling itself as soon as the
Steam globals existed. On a cold boot, those globals can be present while
`appStore.allApps` is still empty. The retry therefore recursed synchronously
without allowing Steam's library store to populate, eventually overflowing the
stack. The top-level plugin catch only called the frontend console logger, so
the failure was absent from the backend file log.

## Files Modified

- `src/steam/core.ts`
- `src/steam/install.ts`
- `src/index.tsx`
- `dist/index.js`
- `dist/index.js.map`
- `docs/agent_conversations/2026-07-10_cold-boot-patch-install.md`

## Design Decisions

- Added `steamPatchTargetsReady()` without changing the broader semantics of
  `hasSteamInternals()`. The new predicate catches access errors and requires
  both the first app overview prototype and the details-store prototype.
- Replaced recursive retry installation with one flat 500 ms timer poll. The
  initial check reports zero attempts; delayed checks are bounded at 240
  attempts, approximately two minutes.
- Moved every patch installer behind the readiness gate and guarded the install
  body so it starts no more than once. The returned unpatch function cancels a
  pending timer and retains reverse-order cleanup of registered unpatchers.
- Added unconditional backend bridge messages for successful installation,
  poll exhaustion, and top-level or delayed installation failure while keeping
  the existing console warning path.
- Kept the existing debug-setting promise and per-step `safeInstallStep`
  isolation behavior intact.

## Validation

- Baseline `scripts/orchestration/run-quality-gates`: passed.
- `./run.sh npx tsc --noEmit`: passed after locally narrowing the undeclared
  Steam prototype fields at the runtime boundary.
- Pre-commit `scripts/orchestration/run-quality-gates`: passed, including the
  TypeScript check, rollup build, Python byte-compilation, and 132 pytest tests.
- `git diff --check`: passed.
- Source inspection confirmed `src/steam/install.ts` has no recursive call to
  `installSteamPatches()`.

The existing rollup circular-dependency warning remains unchanged.

## Deferred On-Device Verification

The Steam Deck cold-boot verification in the implementation plan remains a
human/orchestrator gate before promotion from `dev` to `main`. It must confirm
the backend file-log success line, patched Steam prototypes and history method
over CDP, metadata rendering for a matched non-Steam game, and stability across
two cold boots.
