# Session: Reland quick-links suppression via section-wrapper hook

**Date:** 2026-07-11
**Branch:** `quicklinks-suppression-section-hook` → `dev`
**Objective:** On-device verification of the recent dev fixes surfaced that
`hide-quicklinks-row-nonsteam` (d63263f) never worked; reland it at a working
insertion point.

## Verification sweep that found it

Requested after the launch-regression fix landed. Results:

- `fix(steam): avoid redundant metadata cache writes` (8aa9ee6) — **verified**:
  zero `descriptions`/`associations`/`screenshots` `SetCachedDataForApp` calls
  across page open and 3× same-app subsection round-trips
  (`/library/app/3015223078` ↔ `…/activity`).
- `fix(steam): skip repeated activity refreshes` (4419da6) — **verified**: no
  achievements/usernews/gameactivity refresh writes on same-app subsection
  returns; refresh fires once on first entry and on app switch, per design.
- `fix(ign): prefer PC platform matches` (0cdb2a6) — covered by
  `tests/test_ign_platform_preference.py` (pytest green in quality gates).
- `cold-boot-patch-install` — patches were demonstrably live at session start
  after the 00:27 cold boot (spoof active in first CDP probe, no manual reload).
- `fix(steam): hide dead quick links for unmatched games` (d63263f) —
  **FAILED on-device**: MK8 (never-on-Steam) still showed the dead Store Page /
  Community Hub / Discussions / Guides / Support row. Exactly the reachability
  risk its session log deferred.

## Root cause of the d63263f failure

The mounted Game Info content chain is `pageHost → … → AppDetailsContent →
sectionWrapper(class) → infoSection(fn) → linksRow(fn)`. The links element
never exists in the route `renderFunc`'s returned tree (children are created
inside descendant renders), so the route-level tree helper could never find
it. Confirmed by live fiber walks; also confirmed the links row renders only
because the `BIsModOrShortcut` spoof returns `false` (Steam hides it natively
for true shortcuts), so it cannot be data-starved without losing the rich page.

## Fix

`src/steam/routerPatches.ts` — removed the dead tree helper; added
`installNeverOnSteamQuickLinksSuppression`: afterPatch on the section-wrapper
class `prototype.render` (found by module fingerprint: class whose render
source contains `RegisterSection`). For the `info` section of a never-on-Steam
app (metadata cache entry without `steam_appid`), swap the content element's
type for a cached wrapper that nulls the links element (props signature
`{overview, details, workshopVisible, marketPresence}`) in its output.
`src/steam/install.ts` — installed via `safeInstallStep`.

Traversal safety constraint (learned the hard way — wedged the renderer during
prototyping): only walk React elements/arrays through children chains; never
iterate MobX class instances (overview/details) inside an observer render.

## Validation

- `./scripts/orchestration-hooks/quality-gates` — OK.
- On-device (shipped bundle after scp + hard reload):
  - MK8 `3462906031` Game Info: quick-links row gone; developer/publisher,
    description, and HLTB rows intact.
  - Transformers: Devastation `3015223078` (steam appid 338930): full links
    row still present.
  - Launch regression re-check on the new bundle: immediate Play press on
    Transformers FoC calls `RunGame("14074539753793912832", …)` and the game
    starts (then terminated).
- Focus-reset UX (subsection → B) still needs a quick human confirmation with
  a physical controller; the mechanism (no redundant cache writes/refreshes on
  return) is verified above.
