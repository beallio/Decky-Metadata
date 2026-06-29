# 2026-06-29 - Steam Community Store Links

## Objective

Implement the `steam-community-store-links` plan by adding real Steam store and
community navigation buttons for matched non-Steam shortcuts on the per-game
Playhub Metadata page.

## Files Modified

- `src/steamLinks.ts`
- `src/components.tsx`
- `src/i18n.ts`
- `dist/index.js`
- `dist/index.js.map`
- `docs/agent_conversations/2026-06-29_steam-community-store-links.md`

## Design Decisions

- Added `steamAppLinks(steamAppId)` as a pure, dependency-free URL builder.
- The URL builder returns `null` unless the matched app id is a finite integer
  greater than zero, so the component can hide the Steam section entirely when
  no valid matched Steam app exists.
- Reused the existing external-browser opener by lifting it to module scope so
  both the settings page and per-game metadata page use the same browser fallback
  behavior.
- Added the Steam section after the source metadata section and before Steam
  info fields, keeping the links near the matched app metadata without changing
  backend matching, native library buttons, or Steam client shortcut gating.
- No TypeScript unit-test runner exists in this repository, and the plan
  explicitly forbids adding one or adding npm dependencies for this change.
  Verification for `steamAppLinks` is therefore `tsc --noEmit`, rollup bundling,
  and code review of the small pure function.

## Validation

- Baseline `scripts/orchestration/run-quality-gates`: passed before edits.
- `./run.sh npx tsc --noEmit`: passed after frontend edits.
- `./run.sh npm run build`: passed and regenerated `dist/index.js`.
- Final orchestration quality gate: passed
  (`scripts/orchestration/run-quality-gates`).

## Deferred Hardware Verification

- Rebuild the installer from `dev` and sideload on a real Steam Deck.
- Open a matched non-Steam game with a resolved `steam_appid`; confirm the Steam
  section appears and Store Page / Community Hub / Discussions / Guides open the
  matched app's real Steam pages.
- Open a non-Steam game without a resolved `steam_appid`; confirm the Steam
  section is absent.
