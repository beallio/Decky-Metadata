# Review — non-steam-compatibility-status (round 07)

Branch: `feat/non-steam-compatibility-status`
Reviewed against: `docs/plans/2026-08-28_non-steam-compatibility-status.md`

## Verdict

The human installed and tested the editor-dropdown package. Two user-visible
defects remain: the removed top-level `Compatibility status...` menu item is
still present, and selected non-Steam games do not show the Deck/category
indicators that official Steam games show in Library Home and the Library.
These observations are ground truth and require source fixes before integration.

## Gate status

- Tested installed runtime: `0.3.9+95a541d`.
- The dropdown cutover and backend are installed; this is no longer a
  frontend/backend version mismatch.
- The revised plan at `51398f4` adds explicit stale-menu cleanup and selected
  Library-card indicator acceptance.
- No implementer session is running and the feature branch is clean.

## Required changes

1. **Remove stale runtime menu state.** Earlier development builds injected the
   key `decky-metadata-compatibility` into Steam's reused menu arrays. The clean
   cutover stopped inserting the key but also stopped removing an already
   injected node. Keep the obsolete key only in the removal set so every menu
   render purges it; never recreate the item. Add a regression test seeded with
   the legacy node and prove the render leaves one metadata entry and no
   compatibility entry without a Steam restart.

2. **Restore selected-card compatibility indicators for shortcuts.** Inspect
   the current SteamUI Library Home carousel and Library grid render path to
   find the exact non-Steam suppression predicate. Add the narrowest patch that
   lets an exact native shortcut with an effective category show the same Deck
   device indicator and category icon/label as an official game. Drive it from
   the shortcut's effective/applied category. Unknown or unresolved Automatic
   must not fabricate a status.

3. Do not globally spoof `BIsModOrShortcut`, replace `appStore.m_mapApps`,
   enumerate MobX stores during a render-tree walk, or change official-game
   behavior. Reuse existing patch/install/unpatch patterns and restore every
   patched method/component on dismount.

4. Add focused red-to-green tests for both Home and Library visibility
   decisions, all supported categories, unknown behavior, exact native shortcut
   identity, official pass-through, and unpatch cleanup.

5. Deploy the frontend and prove the human-reported defects are gone on the
   current Deck: no stale compatibility menu item, one metadata entry, and the
   selected shortcut shows the Deck plus category indicators in both surfaces.
   Save a category through the editor dropdown and prove the cards update after
   returning. Compare an official game and prove it remains unchanged.

6. Update the session log with the user's report, root causes, tests, commands,
   screenshots/focused JSON, and results. Run the full quality gate, regenerate
   the full package, deliver it for human installation, close the tunnel, and
   do not mark complete until the installed package passes the full revised
   plan.

STATUS: CHANGES_REQUESTED
