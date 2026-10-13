# Edit a game's metadata

Open the game's menu in your Steam library and select **Decky metadata...**. This opens the editor for that game. The editor changes non-Steam game entries, not games that are already on Steam.

## Add or correct a Steam match

A Steam match connects your non-Steam game to the right Steam store entry so Decky Metadata can use that game's details and other available information. Check the game title carefully before applying a match, especially when several games have similar names or editions.

1. In **Find a Steam match**, enter the game's name and select **Search Steam**.
2. Select a result to view its developer and release date, when available.
   Artwork helps distinguish similar titles. Some results are demos or DLC;
   check the title and the Steam type shown in the preview.
3. Select **Use this Steam match** to save the match and load its Steam details.
4. Select **Save** after you make further manual edits.

Searching and selecting a preview do not change saved metadata. **Cancel
selection** closes the preview and returns controller focus to that result.
Using a match does not rename your shortcut or replace your custom artwork.
Steam search needs an internet connection.

### Enter an app ID or page link instead

If you already know the correct Steam entry, go to **Steam App ID**, enter its
app ID or paste its Steam Store, Community, or SteamDB URL, and select **Apply
Steam App ID**. This saves the match and loads its details. This option also
works when the game does not appear in search results.

**Search IGN metadata** is separate: it searches IGN information, not Steam
matches. Choosing an IGN result does not choose a Steam game.

To correct a match, choose another Steam result or apply the correct app ID.
To clear the pinned match, empty **Steam App ID** and select **Apply Steam App
ID**. **Remove metadata** removes the game's saved metadata, not just its match.

A saved Steam App ID also takes priority when Metadata chooses a ProtonDB
rating for the shortcut. Correcting or clearing the match updates badges that
are already on screen. If no valid ID is saved, badge matching can use the
shortcut's name instead. See [ProtonDB ratings](protondb-badges.md).

## Change or fill in details

Use **Search IGN metadata** to find source information by the game's name, or
edit the fields yourself. Select **Save** when you finish editing. Choosing a
Steam match or applying an app ID saves the match and loads Steam details; use
**Save** after you make further manual edits.

## Descriptions and release dates

Description edits, including clearing the field, stay in place while an applied
Steam match finishes loading. Other fields can still receive the new source data.

The description field and Game Info use the saved short summary when available,
then the saved longer description. Imports keep the source's wording. If a source
has no usable summary, its longer text supplies the description. Empty or
image-only list items do not block this fallback. Paragraphs and list items keep
their spacing in Game Info.

You can replace the description with your own text, including line breaks and
literal text such as `<pilot>`, or clear it. Save applies your description edit.
Saving a different field keeps the existing description and release date.
An automatic lookup for the Steam name also keeps your saved game details.

Release dates are saved as complete calendar dates, not timestamps. Changing
timezone does not change the saved day. On the first load after this update,
older saved timestamps are converted once, keeping their local calendar day
at conversion. This does not repair a date that was already wrong: correct it
in this game's editor, or import its metadata again. Other saved game details
and settings are not changed by the conversion.

Enter a complete date such as `2024-03-10`. Clearing the field saves an empty
date. Unknown or incomplete source dates can remain empty; a valid announced
future date can be saved. This does not change which source release is selected.

## Preview or restore the shortcut name

After a valid Steam match is saved, the **Shortcut name** section may show the current shortcut name and the name Steam uses for the matched game. Decky Metadata never renames a shortcut automatically.

- Select **Use Steam name** to review the proposed change. Confirm **Use Steam name** only if you want to rename the shortcut.
- If the name was changed through Decky Metadata, select **Restore original name** to review the original name, then confirm to restore that exact name.

The rename and restore options may be unavailable when Steam does not provide a usable name or shortcut, or when the shortcut name has changed outside Decky Metadata. The editor explains when the action is unavailable. **Forget saved name history** only removes Decky Metadata's restore history; it does not change the shortcut name.

Your personal SteamGridDB artwork stays in place when Decky Metadata adds game details. The running game's icon also appears in the Steam Menu. Game Info can show links to the Steam store, DLC, and Points Shop when available; links that do not apply are left out.

## Find missing game details or start again

In the Decky Metadata panel, select **Metadata** to open it. **Missing metadata** shows how many of your added games do not have saved details. Select **Refresh metadata** to find and save details for these games.

To remove saved matches and details for all games so they can be matched again, select **Clear cache**. This is different from **Remove metadata** in one game's editor, which removes only that game's saved details.

To update the list of games Steam no longer sells, find **Delisted Steam games** inside **Metadata** and select **Refresh delisted games**.

For installation, see [Install Decky Metadata](installation.md).
