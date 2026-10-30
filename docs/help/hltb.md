# Show HowLongToBeat times

HowLongToBeat (HLTB) collects how long players take to finish games. Decky
Metadata can show four HLTB times on a game's page, for Steam games and for
non-Steam games: **Main Story**, **Main + Extras**, **Completionist**, and
**All Styles**. Select **View Details** to open the game's HowLongToBeat page.

## Turn on HLTB times

1. Open the Quick Access Menu, select **Decky**, then open **Decky Metadata**.
2. Select **HLTB times**, or press **A** on its heading.
3. Turn on **Show HowLongToBeat times**. It is off by default.

When it is off, Decky Metadata sends nothing to HowLongToBeat and shows no times.

## Choose how the times look

| Setting | What it does |
| --- | --- |
| **HLTB Style** | **Default** puts a row of times above the Play button. The **"Clean"** styles place the times over the game's header image. They are meant for the CSS Loader theme "Clean Gameview". |
| **Hide "View Details"** | Removes the button that opens the HowLongToBeat page. |
| **Toggle … stat** | Show or hide each of the four times. |
| **Customize appearance** | Change the background opacity, the **View Details** color, a text shadow, the text size, and (Default style only) the bottom border. **Reset appearance** returns these to their defaults. |
| **Clear HLTB cache** | Forgets saved times. Each game looks up its times again the next time you open it. |

To hide the times for one game, open the game's menu and select
**Show/Hide HLTB Stats**. Select it again to show them.

## How a game is matched

- **Steam games** are matched by their Steam App ID. HowLongToBeat lists the
  Steam game on its own page, so a different edition is not used by mistake.
  If HowLongToBeat does not list the Steam App ID, no times appear.
- **Non-Steam games** use the Steam match saved in **Decky metadata...** in the
  same way. Without a Steam match, the game's name is used.
- If **Remove metadata** was used for a non-Steam game, its times are hidden and
  not looked up by name. They come back when you pick a Steam match or an IGN
  result in **Decky metadata...**, or after **Clear cache**. You can also choose
  an HLTB game by hand (below); that works even after Remove metadata.

### Choose the HLTB game for a non-Steam game

1. Open the game's menu and select **Decky metadata...**.
2. Under **HowLongToBeat game**, paste the game's number or its page link, for
   example `https://howlongtobeat.com/game/7231`.
3. Select **Apply HLTB game**. Decky Metadata checks the number and shows the
   game's name. Leave the field empty and apply it to go back to automatic matching.

## How fresh the times are

Times are saved, so a game you opened before shows them right away, also after a
restart. Saved times are refreshed after 14 days; until then they can be up to
14 days old. A game that HowLongToBeat does not have is checked again after
7 days. The first visit to a game can take a second or two.

## Privacy

When HLTB times are turned on, Decky Metadata sends game titles and
HowLongToBeat game numbers to howlongtobeat.com. It does not need your Steam
account or send your library.

## Use one HLTB plugin

When **HLTB for Deck** is enabled in Decky Loader, Decky Metadata cannot turn on
its own HLTB times, so you do not see two rows. The **HLTB times** section names
the conflict. Disable **HLTB for Deck** in Decky Loader to use Decky Metadata's
times. Its settings are not copied.

## If times are missing or wrong

- Check **Show HowLongToBeat times** and that the game is not hidden from its menu.
- For a non-Steam game, check its Steam match in **Decky metadata...**, or choose
  the HLTB game by hand.
- HowLongToBeat has no official API. If it changes its site, times may stop
  appearing until Decky Metadata is updated. Check the logs as described in
  [updates and troubleshooting](updates-and-troubleshooting.md).

[Help home](README.md)
