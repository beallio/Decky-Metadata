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
- Added backend bridge messages under the `patch` area for successful
  installation, poll exhaustion, and top-level or delayed installation failure
  while keeping the existing console warning path.
- Kept the existing debug-setting promise and per-step `safeInstallStep`
  isolation behavior intact.

## Known Limitation

The backend `frontend_log` callable currently writes every bridged frontend
message at `logging.DEBUG`, while the default on-device logger threshold is
`INFO`. Consequently, the new patch-install status messages reach
`decky-metadata.log` only when debug logging is enabled. Deferred cold-boot
verification must enable debug logging before checking for the success line;
without it, an absent line is expected and does not prove installation failed.
A separate plan should add an INFO-capable backend logging channel or make the
existing callable honor an explicit level so these status messages are visible
under the default logger configuration.

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
human/orchestrator gate before promotion from `dev` to `main`. With debug
logging enabled, it must confirm the backend file-log success line, patched
Steam prototypes and history method over CDP, metadata rendering for a matched
non-Steam game, and stability across two cold boots.
