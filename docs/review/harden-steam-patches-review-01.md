# Review: harden-steam-patches

## Scope reviewed
Diff `dev..feat/harden-steam-patches` — `src/steam.ts`, `src/index.tsx`.

## Findings
- **`patchMethod` (steam.ts:3827)**: the `replacement(...)` invocation is now wrapped in
  try/catch; on a callback throw it falls through to `boundOriginal(...args)` (and to `undefined`
  only if the original itself throws). Normal return values are unchanged — the catch fires only
  on exceptions. Covers all 18 `patchMethod` sites in one place. Plan task 1.
- **`safeAfterPatch`**: new local wrapper that runs the handler in try/catch and returns the
  original `ret` on throw, preserving `this` via `handler.call(this, …)`. Applied to all 6
  `afterPatch` sites (BIsModOrShortcut, BHasRecentlyLaunched, GetPerClientData, the multi-line
  site, and both route `renderFunc` patches — the `const renderPatch = safeAfterPatch(...)`
  handles are preserved). Handler bodies unchanged. Plan task 2.
- **`safeInstallStep`**: wraps each of the 9 `install*(unpatchers)` calls so one failing install
  can't abort the rest; logs via `log.warn("patch", …)`. Existing internal try/catch guards left
  intact; install order unchanged. Plan task 3.
- **`index.tsx`**: `installSteamPatches()` is guarded in try/catch (`log.warn("bridge", …)`),
  `unpatchSteam` is now `(() => void) | undefined`, and teardown calls `unpatchSteam?.()`.
  Plan task 4.

## Behavior
No behavior change when nothing throws — the wrappers only intercept exceptions. Purely
defense-in-depth: a Steam UI update that makes a patched callback (or install step) throw now
degrades to the original method / a skipped step instead of propagating into Steam.

## Scope discipline
Frontend-only; no handler/matching/redirect/hider/diagnostics logic changed; no `main.py`; no
npm deps.

## Gates
`run-quality-gates` green: `tsc --noEmit`, rollup build, `py_compile`, full pytest all pass;
tree clean.

Auto-approved for `dev` per project workflow (dev merges auto-approve; only dev → main is a
human gate).

STATUS: APPROVED
