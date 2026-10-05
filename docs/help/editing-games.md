# Edit a game's metadata

Open the game's menu in your Steam library and select **Decky metadata...**. This opens the editor for that game. The editor changes non-Steam game entries, not games that are already on Steam.

## Add or correct a Steam match

A Steam match connects your non-Steam game to the right Steam store entry so Decky Metadata can use that game's details and other available information. Check the game title carefully before applying a match, especially when several games have similar names or editions.

1. Find the correct game in the Steam Store and open its store page.
2. In **Decky metadata...**, go to **Steam App ID** and enter the game's Steam App ID, or paste its Steam Store, Community, or SteamDB URL.
3. Select **Apply Steam App ID**. The match is saved and Decky Metadata loads information for it.
4. Check that the match is for the intended game. Select **Save** for any other edits you made in the editor.

The editor's **Search IGN metadata** section searches IGN metadata, not Steam matches. Choosing an IGN result fills in source information; it does not choose a Steam game. Use the **Steam App ID** field to set the Steam match.

If the match is wrong, repeat those steps with the correct game's app ID or URL. To remove a match instead, clear the **Steam App ID** field and select **Apply Steam App ID**. This clears the pinned match; you can then add the correct one. **Remove metadata** removes the game's saved metadata, rather than just clearing its Steam match.

A saved Steam App ID also takes priority when Metadata chooses a ProtonDB
rating for the shortcut. Correcting or clearing the match updates badges that
are already on screen. If no valid ID is saved, badge matching can use the
shortcut's name instead. See [ProtonDB ratings](protondb-badges.md).

## Change or fill in details

Use the editor's **Search IGN metadata** section to search by the game's name. Select the result that describes your game to fill in its source information. You can also edit the fields in the editor yourself. Select **Save** when you finish editing. Applying a Steam App ID saves that match separately; use **Save** to save your other edits.

## Descriptions and release dates

The description field and Game Info use the saved short summary when available,
then the saved longer description. Imports keep the source's wording. If a source
has no usable summary, its longer text supplies the description. Paragraphs and
list items keep their spacing in Game Info.

You can replace the description with your own text, including line breaks and
literal text such as `<pilot>`, or clear it. Save applies your description edit.
Saving a different field keeps the existing description and release timestamp.
An automatic lookup for the Steam name also keeps your saved game details.

Release dates use the Deck's local calendar day. Some older saved dates can show
the previous day because they were stored at UTC midnight. Correct the date in
this game's editor, or import its metadata again. Existing saved timestamps are
left unchanged until you change or import that date. Unknown or upcoming dates
can remain empty.

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
