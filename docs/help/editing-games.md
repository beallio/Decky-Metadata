# Edit a game's metadata

For any non-Steam shortcut or Steam game, select **Edit Metadata...** from
either of these menus:

- On the Library card, open **Options** or right-click the card.
- On the game page, select the gear icon.

For Steam games, **Edit Metadata...** opens to **Artwork** (and includes
**HowLongToBeat** when **Show HowLongToBeat times** is enabled) so you can
browse SteamGridDB and official Steam artwork, adjust logo positioning, or
override HLTB matching.

**Edit Metadata...** is near the bottom of the menu, close to **Properties...**.
If SteamGridDB is installed, it is next to SteamGridDB's **Change Artwork...**.

The editor looks like Steam's Properties page. The game's name is at the top
of the sidebar. Move the D-pad to a page name to show that page. Press **A** or
**Right** to move into the page. Press **B** in a page to return to the sidebar.
Press **B** in the sidebar to leave the editor:

+ If you have unsaved changes, Steam asks you to choose **Save**, **Discard**,
  or **Cancel**.
+ If you do not have unsaved changes, you leave the editor.

The Steam or Home button does not show this prompt. If you leave that way, you
lose unsaved changes.

Pages in the sidebar:

- **Details**: Edit the title, description, developers, publishers, release
  date, or rating. At the bottom of this page, under **Store Categories**, turn
  any of the 11 Store categories on or off. A changed category shows **Edited**
  until you select **Save**.
- **Game Match**: Find a Steam game, load details for the current match, enter
  a Steam App ID, load Steam text in your language, or search IGN for details.
- **Artwork**: Browse community artwork from SteamGridDB or apply official Steam
  artwork across **Cover**, **Wide cover**, **Hero background**, **Game logo**,
  and **Game icon** slots (`L1`/`R1` or moving focus along the tabs switches
  tabs, **Y** opens Filter & Change Game, **Menu** opens Asset Details). For a
  Steam game, the editor opens on Artwork; when the default tab has artwork,
  focus starts on the first one. The **Manage** tab shows the current artwork
  for each slot (for a Steam game, Steam's official art when no custom art is
  set) and lets you pick local image files, apply a transparent placeholder,
  clear slots, lock artwork from automatic updates, and adjust the **Logo
  position** over the hero banner. While browsing Artwork, the editor sidebar
  collapses into a compact icon rail that shows the game icon, and expands when
  focus returns to it.
- **HowLongToBeat**: Choose which game's times to show on the Library game page
  for a non-Steam or Steam game.
- **Compatibility**: Choose a [compatibility status](compatibility-status.md#choose-a-status-for-one-game)
  for a non-Steam game.
- **Shortcut Name**: Use the Steam name, restore the original name, or forget
  the saved name history for a non-Steam game.
- **Advanced**: Remove saved metadata for this game.

## Add or correct a Steam match

A Steam match connects your non-Steam game to the right Steam store entry so Decky Metadata can use that game's details and other available information. Check the game title carefully before applying a match, especially when several games have similar names or editions.

1. On **Game Match**, enter the game's name and select **Search Steam**.
2. Select a result to view its developer and release date, when available.
   Artwork helps distinguish similar titles. Some results are demos or DLC;
   check the title and the Steam type shown in the preview.
3. Select **Use this Steam match** to load its Steam details into the form.
4. Select **Save** to store the match and the details.

Searching, selecting a preview, and using a match do not change saved metadata
until you select **Save**. Fields filled from Steam that are not saved yet are
marked **From Steam, not saved** in amber. **Cancel selection** closes the
preview and returns controller focus to that result. Using a match does not
rename your shortcut. If **Automatically apply Steam artwork** is on in
**Settings → Artwork**, **Save** also applies the matched game's Steam artwork;
with **Preserve existing artwork** off, this replaces your custom artwork.
Steam search needs an internet connection.

### Enter an app ID or page link instead

On **Game Match**, enter the game's ID or paste its Steam Store, Community,
or SteamDB URL in **Steam App ID**, then select **Apply Steam App ID**. This
loads its details into the form without saving them. Select **Save** to store
the match. Use this option if the game does not appear in search results.
An invalid app ID or link shows a warning and changes nothing. If you change
the **Steam App ID** without selecting **Apply Steam App ID**, **Save** asks
you to apply it first.

At the bottom of **Game Match**, below **Steam App ID**, select
**Search IGN metadata** to search IGN, not Steam. Select an IGN result to load
the game's details into the form. This does not save the details or choose a
Steam match.

To correct a match, choose another Steam result or apply the correct app ID.
To clear the match, empty **Steam App ID** and select **Apply Steam App ID**.
Then select **Save**.

To delete all saved metadata for this game, go to **Advanced** and select
**Remove Metadata**. In **Remove Metadata?**, select **Remove Metadata** to
confirm. The **Metadata removed** message shows the game's name. The editor
then returns to the game page.

Decky Metadata does not match the game again by itself. Opening the game,
news updates, and **Refresh metadata** skip it. To match it again, load a Steam
match or an IGN result and save it, or use **Clear cache**.

A saved Steam App ID also takes priority when Metadata chooses a ProtonDB
rating for the shortcut. Correcting or clearing the match updates badges that
are already on screen. If no valid ID is saved, badge matching can use the
shortcut's name instead. See [ProtonDB ratings](protondb-badges.md).

To get current details for a match, go to **Current match** on **Game Match**
and select **Load from Steam**. This fills the form. Select **Save** to store
the details. If you cannot load the data, the button tells you why:

- **Load from Steam (No Steam match)**: Choose a Steam match first.
- **Load from Steam (Updating)**: Wait for the update to finish.
- **Load from Steam (Not available for Steam games)**: Use this action only
  for non-Steam games.

If the saved Steam text is not in your Steam language, **Game Match** shows
its language under **Steam text language**. Select **Load Steam text in**
*your language* to load the description and genres. Select **Save** to store
them. Decky Metadata does not replace a description by itself because you may
have edited it. Steam gives English text if the store page has no text in
your language.

## Save your changes

Steam, IGN, and HowLongToBeat results only fill the form. Select **Save** to
store them. **Apply HLTB game** checks the game number or link you enter and
shows the game it finds. See [Choose the HLTB game for a game](hltb.md#choose-the-hltb-game-for-a-game).

Fields you change are marked **Edited** in blue. Fields filled from Steam that
are not saved yet are marked **From Steam, not saved** in amber. Steam data the
form does not show, such as screenshots, news, and compatibility, also counts
as a change.

A blue dot next to a page name shows that the page has unsaved changes.
Select **Save** at the bottom of the sidebar or press **X**. The label shows the
number of changes, for example **Save (3)**. You cannot save if nothing has
changed. The **Metadata saved** message shows the game's name.


## Descriptions and release dates

Description edits, including clearing the field, stay in place while an applied
Steam match finishes loading. Other fields can still receive the new source data.

The description field and Game Info use the saved short summary when available,
then the saved longer description. Imports keep the source's wording. A Steam
import uses your Steam language for the description and genres; names,
developers, publishers, and release dates stay in English. Steam gives English
text when the store page has no text in your language. IGN details stay in
English. If a source has no usable summary, its longer text supplies the
description. Empty or image-only list items do not block this fallback.
Paragraphs and list items keep their spacing in Game Info.

You can replace the description with your own text, including line breaks and
literal text such as `<pilot>`, or clear it. Save applies your description edit.
Saving a different field keeps the existing description and release date.
An automatic lookup for the Steam name also keeps your saved game details.

Release dates are saved as complete calendar dates, not timestamps. Changing
timezone does not change the saved day. On the first load after this update,
older saved timestamps are converted once, keeping their local calendar day
at conversion. This does not repair a date that was already wrong. Correct it
on **Details**, or import the game's metadata again. The conversion does not
change other saved game details or settings.

Enter a complete date such as `2024-03-10`. Clearing the field saves an empty
date. Unknown or incomplete source dates can remain empty; a valid announced
future date can be saved. This does not change which source release is selected.

## Preview or restore the shortcut name

After you save a valid Steam match, **Shortcut Name** can show the current
shortcut name and the name Steam uses for the matched game. Decky Metadata
does not rename a shortcut by itself.

- Select **Use Steam name** to review the new name. Confirm **Use Steam name**
  to rename the shortcut.
- If you changed the name through Decky Metadata, select **Restore original
  name** to review it. Confirm to restore that exact name.
- **Forget saved name history** removes only the record of the original name.
  It does not change the shortcut name.

These actions take effect when you confirm them. They do not use **Save**.
The rename and restore actions can be unavailable if Steam does not give a
usable name or shortcut, if the name changed outside Decky Metadata, or if
you have not saved a new match. The editor gives the reason.

Your personal SteamGridDB artwork stays in place when Decky Metadata adds game details. The running game's icon also appears in the Steam Menu. Game Info can show links to the Steam store, DLC, and Points Shop when available; links that do not apply are left out.

## Find missing game details or start again

In Settings, open the **Metadata** tab. **Missing metadata** shows how many of
your added games do not have saved details. Select **Refresh metadata** to find
and save details for these games.

To remove saved matches and details for all games so they can be matched
again, select **Clear cache**. To remove saved details for only one game, use
**Remove Metadata** on **Advanced** in that game's editor.

To update the list of games Steam no longer sells, open the **Metadata** tab
in Settings and select **Refresh delisted games** under **Delisted Steam games**.

For installation, see [Install Decky Metadata](installation.md).
