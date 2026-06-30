# 2026-06-30 - Native app page Steam links

## Objective

Implement `docs/plans/2026-06-29_native-app-page-steam-links.md` by moving the
Store Page, Community Hub, Discussions, and Guides actions from the library
context menu onto matched non-Steam games' native Steam app page.

## Files Modified

- `src/contextMenuPatch.tsx`
- `src/steam.ts`
- `dist/index.js`
- `dist/index.js.map`
- `docs/agent_conversations/2026-06-30_native-app-page-steam-links.md`

## Decisions

- Kept the context menu scoped to the existing Playhub metadata edit entry.
- Added a DOM-mounted Steam links row on the app-details path after
  `ensureMetadataCache()` and `applyMetadata(appId)`, reusing
  `steamAppLinks`, `steamAppIdForApp`, and `openExternalUrl`.
- Used the existing Activity mount discovery path, but only when it resolves a
  native anchor. The row removes itself instead of falling back to `document.body`,
  so it cannot float over the hero when Steam's DOM shape is not recognized.
- Added stable `playhub-steam-links-root` / `data-playhub-steam-links` markers
  and rebuilds the row in place to prevent duplicate rows and stale click
  handlers during app navigation.
- Registered teardown cleanup through `installSteamPatches()` so plugin unload
  removes the row and its injected style.

## Validation

- Baseline before edits: `scripts/orchestration/run-quality-gates` passed.
- After implementation: `scripts/orchestration/run-quality-gates` passed.
- Confirmed the old context-menu keys are absent from `src/contextMenuPatch.tsx`
  with `rg`.

## Deferred On-Device Verification

Placement still requires Steam Deck or Steam Big Picture validation. Confirm
that a matched non-Steam game's native page shows the Store Page, Community Hub,
Discussions, and Guides row on the page, that each button opens the matched
Steam app page, that the row does not stack or persist across navigation, and
that games without a resolved `steam_appid` show no row.
