# Review: fix-applinks-hider-robust

## Scope reviewed
Diff `dev..feat/fix-applinks-hider-robust` — `src/steam.ts` only.

## Findings
- **`shouldHideUnmatchedAppLinks`**: replaced the strict `gameDetailAppIdFromPath` gate with
  `onGameDetailRoute(path)` (matches `/library/(app|details)/` or a path-derived appid, and
  excludes `/achievements`) plus `currentGameDetailAppId()` (the same DOM/title/lastObserved
  fallback resolver used by the working redirect/guards). Directly addresses the most likely
  on-device failure where the route path lacked `/app/<id>`. Plan task 1.
- **`resolveAppDetailsLinkRowClasses`**: keeps the primary `findModuleChild` strategy and adds
  a second nested-export pass via `appDetailsLinkRowModuleFromExports`; returns `[]` safely on
  miss; no hardcoded hash. Plan task 2.
- **Diagnostics**: `logUnmatchedAppLinksDecision` throttles on a `decision|classes|appId`
  signature, logs `decision/appId/isNonSteam/steamAppId/resolvedClasses/classPresentInDom` via
  the `frontendLog` bridge (area `applinks`), with a `CSS.escape`-guarded read-only DOM probe;
  all wrapped in try/catch. `update()` computes the decision once and reuses it for the toggle.
  Plan task 3.
- **Behavior preserved**: 400ms interval, style-node lifecycle, idempotency guard, and teardown
  unchanged. Plan task 4.

## Scope discipline
Frontend-only; no changes to the redirect, matcher, appdetails, community media, override, or
`main.py`. No npm dependencies. The diagnostics are explicitly temporary.

## Gates
`run-quality-gates` green: `tsc --noEmit`, rollup build, `py_compile`, full pytest all pass;
working tree clean.

## Note
This build is partly diagnostic by design: if the row is still visible on-device, the
`[playhub:applinks] hider decision` line pinpoints the failing stage (decision false →
route/app detection; empty resolvedClasses → module miss; classPresentInDom false → live row
uses a different class) for a guess-free follow-up.

Approval authorized by the human (project owner) for merge into `dev`. The `dev → main`
promotion remains a separate human gate.

STATUS: APPROVED
