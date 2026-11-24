# Set a compatibility status

Decky Metadata lets you choose a Steam Deck compatibility status for non-Steam games and apps. You can set a default for a group or choose a status for one game.

## Choose a default

Open Decky Metadata from the Quick Access Menu, then select the gear or **Open settings**. Open the **Compatibility status** tab and choose **Default compatibility status**.

Choose one of these options:

- **Automatic** uses each game's Steam-matched status. If Steam has no status
  for the match, the shortcut keeps its original status.
- **Verified**, **Playable**, or **Unsupported** applies that status as your default.
- **Unknown** removes the compatibility badge.

Leave **Automatic** selected if you want to use Steam's status whenever one is available.

## Choose which games use your default

When you choose a status other than **Automatic**, use **Apply default to** to select the games that receive it:

| Option | Games included |
| --- | --- |
| **Steam-matched games** | Games with saved metadata that includes a Steam App ID. The record can come from any source; a delisted Steam game still counts if its App ID is saved. |
| **Saved games without a Steam ID** | Games with saved metadata but no Steam App ID, including details you entered yourself or that came from a metadata provider. |
| **All games with saved metadata** | Every game with a saved metadata record, whether or not it has a Steam App ID. |
| **All non-Steam games** | Every non-Steam game or app, including entries with no saved metadata or Steam match. |

For example, choose **Playable** and **All non-Steam games** to apply that status to every non-Steam game and app in your library.

With a manual default, only games in the selected group inherit it; a per-game choice still takes priority. Games outside the group use Steam's status when available or keep their original status. **Apply default to** is unavailable while **Automatic** is selected; Decky Metadata remembers your selection for when you choose a manual default again.

## Choose a status for one game

For a non-Steam game, open **Edit Metadata...** and select **Compatibility**.
Under **Compatibility status**, choose one of these options:

- **Use global default** inherits the default in **Settings > Compatibility status** for this game.
  If the default is **Automatic**, it uses the game's Steam-matched status.
  If a manual default does not include this game, it uses the Steam-matched
  status when available. If there is no Steam status, it keeps the original
  status.
- **Follow Valve** always uses Valve's status for the Steam match. It ignores
  your default and the group it applies to. If Valve has no status for the
  match, it keeps the original status.
- **Verified**, **Playable**, **Unsupported**, or **Unknown** sets a status just for this game. This choice takes priority over your default and scope. **Unknown** removes the badge.

Select **Save** when you finish.

## When a change appears

Other eligible games update when you change the default or its scope. If the
game's **Game Info** tab is already open, its current status stays in place
until you leave that tab. Opening Settings from a game's page leaves that page
and applies its held status update at once.

## What the status means

A status you choose is your label. It does not mean Valve tested or certified the game, guarantee that it will run, or report emulator performance.

On a SteamOS device that is not a Steam Deck, such as the Lenovo Legion Go S, Steam shows a **SteamOS Compatibility** row. Decky Metadata sets that row too. SteamOS has only **Compatible**, **Unsupported**, and **Unknown**, so **Verified** and **Playable** show as **Compatible** there. Steam Machine and Steam Frame devices use their own rows in the same way.

For implementation-level details, see the [compatibility status technical reference](../specs/compatibility-status.md).

[Help home](README.md)
