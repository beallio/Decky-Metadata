# Review: hider-mainwindow-document

## Scope reviewed
Diff `dev..feat/hider-mainwindow-document` — `src/steam.ts` only.

## Findings
- **Root-cause fix**: `appLinksHiderTargetDocument()` resolves
  `SteamUIStore.m_WindowStore.MainWindowInstance.m_BrowserWindow.document` with existence/writable
  guards, returning `null` when unavailable (no fall back to the wrong plugin document). Matches
  plan task 1 and the CEF-verified accessor.
- **DOM probe retargeted**: `appLinksDomClassPresent(className, doc)` queries the passed document;
  `logUnmatchedAppLinksDecision` now takes and forwards the resolved doc (null → false). Task 2.
- **Injection moved to the main window doc**: install-time injection against the plugin document
  removed; `update()` resolves the target doc each tick, early-returns if unavailable, ensures the
  `<style>` node exists in `doc.head` (recreating on window change via `injectedDoc !== doc`),
  refreshes content only when classes change or node was (re)created, and toggles the body class on
  `doc.body`. Teardown removes the node + class from `injectedDoc`. Task 3.
- Route/app decision (`shouldHideUnmatchedAppLinks`), class resolver, and
  `buildUnmatchedAppLinksHiderStyle` unchanged. Idempotency guard + 400ms cadence preserved.

## Basis for confidence
Live CEF inspection proved the buttons render in `MainWindowInstance.m_BrowserWindow.document`
(title "Steam Big Picture Mode", `.GameInfoQuickLinks` count 1, writable), while the plugin's own
SharedJSContext document had the style/body-class but zero buttons. This moves the injection to the
document that actually contains the row.

## Scope discipline
Frontend-only; no changes to matching, redirect, appdetails, community media, the override, or
`main.py`. No npm dependencies.

## Gates
`run-quality-gates` green: `tsc --noEmit`, rollup build, `py_compile`, full pytest all pass;
working tree clean.

Auto-approved for `dev` per project workflow (dev merges are auto-approved; only dev → main is a
human gate).

STATUS: APPROVED
