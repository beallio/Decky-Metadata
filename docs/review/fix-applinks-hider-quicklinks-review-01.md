# Review: fix-applinks-hider-quicklinks

## Scope reviewed
Diff `dev..feat/fix-applinks-hider-quicklinks` — `src/steam.ts` only.

## Findings
- **Retargeted to the correct element**: the module predicate now requires string
  `GameInfoQuickLinks` + `GameInfoContainer` (the AppDetails CSS module), replacing the previous
  `LinkRow`/`LinkRowText`/`LinkRowIcon` check — which live CEF DOM inspection proved was the
  unrelated Remote Play / Friends invite row, not the app quick-links. Matches plan task 1.
- **Resolver returns `GameInfoQuickLinks`**: `resolveAppDetailsQuickLinksClasses` keeps the
  two-pass `findModuleChild` search and returns the resolved quick-links class; `[]` on failure.
  Plan task 2.
- **Fallback safety**: `buildUnmatchedAppLinksHiderStyle` no longer falls back to
  `[class*="LinkRow"]` (which would hide the wrong row); when nothing resolves it emits a benign
  CSS comment and no rule. Plan task 3.
- **Diagnostics + toggle intact**: `logUnmatchedAppLinksDecision` now reports the quick-links
  hash / `classPresentInDom`; route detection (`onGameDetailRoute` + `currentGameDetailAppId`),
  the single-`decision` toggle, interval, and teardown are unchanged. Plan tasks 4-5.
- Consistent renames throughout; no stray references to the old names.

## Basis for confidence
Target derived from live Steam CEF DOM inspection on the Wolverine page: the quick-links row is
`div.GameInfoQuickLinks` (hash `_2GqvVM-UeNGM7ptNftUVn_`), exported by the AppDetails module
alongside `GameInfoContainer`/`AppDetailsContent`; its subtree is exactly the
Store/Community/Discussions/Guides/Market buttons.

## Scope discipline
Frontend-only; no changes to matching, redirect, appdetails, community media, the override, or
`main.py`. No npm dependencies.

## Gates
`run-quality-gates` green: `tsc --noEmit`, rollup build, `py_compile`, full pytest all pass;
working tree clean.

Approval authorized by the human (project owner) for merge into `dev`. The `dev → main`
promotion remains a separate human gate.

STATUS: APPROVED
