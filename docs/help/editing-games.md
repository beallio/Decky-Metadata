# Edit a game's metadata

Open the game's menu in your Steam library and select **Change Metadata...**. This opens the editor for that game. The editor changes non-Steam game entries, not games that are already on Steam.

## Add or correct a Steam match

A Steam match connects your non-Steam game to the right Steam store entry so Decky Metadata can use that game's details and other available information. Check the game title carefully before applying a match, especially when several games have similar names or editions.

1. In **Find a Steam match**, enter the game's name and select **Search Steam**.
2. Select a result to view its developer and release date, when available.
   Artwork helps distinguish similar titles. Some results are demos or DLC;
   check the title and the Steam type shown in the preview.
3. Select **Use this Steam match** to load its Steam details into the form.
4. Select **Save** to store the match and the details.

Searching, selecting a preview, and using a match do not change saved metadata
until you select **Save**. Fields filled from Steam that are not saved yet are
marked **From Steam, not saved** in amber. **Cancel selection** closes the
preview and returns controller focus to that result. Using a match does not
rename your shortcut or replace your custom artwork. Steam search needs an
internet connection.

### Enter an app ID or page link instead

If you already know the correct Steam entry, go to **Steam App ID**, enter its
app ID or paste its Steam Store, Community, or SteamDB URL, and select **Apply
Steam App ID**. This loads its details into the form without saving them.
Select **Save** to store the match. This option also works when the game does
not appear in search results. Text that is not a valid app ID or Steam page
link shows a warning and changes nothing. If you edit the **Steam App ID** text
without selecting **Apply Steam App ID**, **Save** asks you to apply it first.

**Search IGN metadata** is separate: it searches IGN information, not Steam
matches. Selecting an IGN result loads that game's details into the form; it
does not save them or choose a Steam game.

To correct a match, choose another Steam result or apply the correct app ID.
To clear the pinned match, empty **Steam App ID** and select **Apply Steam App
ID**; the match is cleared in the form, and **Save** stores that. **Remove
metadata** removes the game's saved metadata, not just its match, and asks you
to confirm first. It then returns you to the game page. After you remove it,
Metadata does not match the game again by itself: opening the game, news
updates, and **Refresh metadata** skip it. To match it again, pick a Steam match
or an IGN result in the editor, or use **Clear cache**.

A saved Steam App ID also takes priority when Metadata chooses a ProtonDB
rating for the shortcut. Correcting or clearing the match updates badges that
are already on screen. If no valid ID is saved, badge matching can use the
shortcut's name instead. See [ProtonDB ratings](protondb-badges.md).

When a matched game's saved Steam text is not in your Steam language, **Steam
App ID** shows **Steam text language:** with the language of the saved text.
Select **Fetch Steam text in** *your language* to load the description and
genres in your Steam language into the form. Select **Save** to store them with
the game's other details. Decky Metadata does not replace a description by
itself, because you may have edited it. Steam gives English text when the store
page has no text in your language.

## Save your changes

Nothing is stored until you select **Save**. Apply-style actions only fill the
form: **Use this Steam match**, **Apply Steam App ID**, an IGN result, **Apply
HLTB game**, the Steam text language button, and **Refresh from Steam** all
change the form without saving. **Apply HLTB game** checks the HowLongToBeat
number or link you entered and shows the game it found; **Save** stores it.

Fields you change are marked **Edited** in blue. Fields filled from Steam that
are not saved yet are marked **From Steam, not saved** in amber. Steam data the
form does not show, such as screenshots, news, and compatibility, also counts
as a change.

The top of the editor has **Save**, **Done**, and a **⋯** button. **Save** shows
the number of changes, for example **Save (3)**, and is unavailable when nothing
has changed. The controller **X** button also saves. The **⋯** menu contains
**Refresh from Steam**, which loads current Steam details for the Steam App ID
in the form without saving, and **Remove metadata**.

If you leave with unsaved changes using **Done** or the **B** button, the editor
asks whether to **Save**, **Discard**, or **Cancel**. Leaving with the Steam or
Home button does not ask; unsaved changes are lost.

Use **Search IGN metadata** to find source information by the game's name, or
edit the fields yourself. Select **Save** when you finish editing.

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

The rename and restore options may be unavailable when Steam does not provide a usable name or shortcut, when the shortcut name has changed outside Decky Metadata, or until you save a new Steam match in the editor. The editor explains when the action is unavailable. **Forget saved name history** only removes Decky Metadata's restore history; it does not change the shortcut name.

Your personal SteamGridDB artwork stays in place when Decky Metadata adds game details. The running game's icon also appears in the Steam Menu. Game Info can show links to the Steam store, DLC, and Points Shop when available; links that do not apply are left out.

## Find missing game details or start again

In the Decky Metadata panel, select **Metadata** to open it. **Missing metadata** shows how many of your added games do not have saved details. Select **Refresh metadata** to find and save details for these games.

To remove saved matches and details for all games so they can be matched again, select **Clear cache**. This is different from **Remove metadata** in one game's editor, which removes only that game's saved details.

To update the list of games Steam no longer sells, find **Delisted Steam games** inside **Metadata** and select **Refresh delisted games**.

For installation, see [Install Decky Metadata](installation.md).
