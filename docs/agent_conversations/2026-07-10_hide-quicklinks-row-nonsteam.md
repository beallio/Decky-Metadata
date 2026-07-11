# Hide Quick-Links Row for Never-on-Steam Games

**Date:** 2026-07-10  
**Objective:** Keep the enriched Game Info page for cached non-Steam games while
removing its dead Steam quick-links row when the metadata has no valid
`steam_appid`.

## Root cause

The existing `BIsModOrShortcut` spoof makes Steam render the full Game Info page
for cached shortcuts so IGN artwork, descriptions, and screenshots remain
available. That full page also includes Store Page, Community Hub, Discussions,
Guides, and Support links even when the game was never matched to Steam. Steam
has separate Market and Workshop flags, but no equivalent per-link flag for
those core links, so the complete quick-links section must be suppressed.

## Changes

- Added a defensive cache predicate that treats only a known metadata record
  with a missing, zero, or otherwise invalid `steam_appid` as never on Steam.
- Located the quick-links element by the stable `overview`, `details`,
  `workshopVisible`, and `marketPresence` prop-key signature. Component names and
  CSS classes are minified or hashed across Steam builds and are not used.
- Required the matched element's `overview.appid` to equal the current shortcut
  app ID before changing it.
- Neutralized the matched element in place with `node.type = () => null`. The
  suppression helper catches every failure and leaves the original render tree
  intact on missing or changed Steam tree shapes.
- Rebuilt the committed `dist/index.js` and `dist/index.js.map` artifacts.

The insertion point is the existing game-detail route `renderFunc` after-patch,
after its metadata and activity work has been scheduled. The metadata spoof,
reentry shield, arming sites, and metadata application behavior were not
changed.

## Validation

- Baseline and implementation: `scripts/orchestration/run-quality-gates`
- TypeScript: `npx tsc --noEmit`
- Bundle: `npm run build`
- Backend safety gates: `python3 -m py_compile main.py` and `pytest -q`
- Review-note deletion guard: passed as part of the orchestration quality gate.

Both quality-gate runs passed. The full Python suite completed with 183 passing
tests. This frontend interaction has no JavaScript unit-test runner and therefore
requires the planned live-tree verification.

## Deferred on-device verification

Before promotion from `dev` to `main`, the human/orchestrator must confirm that a
no-`steam_appid` game loses the full quick-links row while retaining its
description and screenshots; a matched game keeps the row and existing
Discussions behavior; neither path crashes or leaks suppression between apps.
This verification must also confirm that the links section is reachable at the
current outer game-detail `renderFunc` insertion point. If it is not, the plan's
nested-`renderFunc` fallback remains required before approval.
