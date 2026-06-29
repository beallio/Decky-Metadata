# 2026-06-29 Native Steam Links Context Menu

## Task Objective

Implement `docs/plans/2026-06-29_native-steam-links-context-menu.md` on
`feat/native-steam-links-context-menu`.

## Files Modified

- `src/openExternalUrl.ts`
- `src/components.tsx`
- `src/contextMenuPatch.tsx`
- `src/steam.ts`
- `dist/index.js`
- `dist/index.js.map`
- `docs/agent_conversations/2026-06-29_native-steam-links-context-menu.md`

## Design Decisions

- Extracted the existing Steam-aware external URL opener into a shared module so
  the metadata page and native context-menu patch use the same browser fallback
  behavior.
- Kept `src/steamLinks.ts` as the single URL builder for official Steam app
  pages.
- Added context-menu entries only after a non-Steam shortcut passes the existing
  `insertOurEntry` gate and only when cached metadata has a resolved
  `steam_appid`.
- Removed the redundant Steam link panel from the plugin metadata page; the
  native library context menu is now the UI surface for those links.
- Left the `steamLinks` locale title key in place because removing it is
  optional in the plan and retaining it avoids unrelated locale churn.

## Validation Results

- Baseline `scripts/orchestration/run-quality-gates`: passed.
- Targeted `./run.sh npx tsc --noEmit`: passed.
- `rg -n "steamLinks" src/components.tsx`: no matches.
- Implementation `scripts/orchestration/run-quality-gates`: passed.

## Deferred Verification

Hardware validation is deferred to the human/orchestrator: sideload on a real
Steam Deck, open the native library context menu for a matched non-Steam game,
and verify Store Page, Community Hub, Discussions, and Guides open the matched
Steam app pages.
