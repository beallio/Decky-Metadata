# Show HowLongToBeat times

HowLongToBeat (HLTB) collects how long players take to finish games. Decky
Metadata can show four HLTB times on a game's page, for Steam games and for
non-Steam games: **Main Story**, **Main + Extras**, **Completionist**, and
**All Styles**. Select **Details** to open the game's HowLongToBeat page.

## Turn on HLTB times

1. Open the Quick Access Menu, select **Decky**, then open **Decky Metadata**.
2. Select **HLTB times**, or press **A** on its heading.
3. Turn on **Show HowLongToBeat times**. It is off by default.

When it is off, Decky Metadata sends nothing to HowLongToBeat and shows no times.

## Show times on Store pages

On a Steam Store game page, Decky Metadata shows an info row directly below the
trailers and screenshots. It is boxed like Steam's own rows, such as
**Reviews**. The **HowLongToBeat** box shows the same four times as the game
page, and the **Toggle … stat** switches also hide or show them here. It works
for games you do not own. Select the box to open the game on HowLongToBeat,
unless **Hide "Details"** is on.

The **Store** switch in the **HLTB times** section turns the HowLongToBeat box
on. It is on by default. The row also holds a ProtonDB box, which the ProtonDB
**Store** switch controls. If only one box has data, it fills the row. If both
switches are off, no row appears.

The row needs Steam's remote browser debugging. See [Enable the Store
row](protondb-badges.md#enable-the-store-row).

## Choose how the times look

| Setting | What it does |
| --- | --- |
| **HLTB Style** | **Default** puts a row of times at the bottom of the game's header image, just above the Play button. The **"Clean"** styles place the times over the header image, with a **Details** button that looks like the buttons beside Play. They are meant for the CSS Loader theme "Clean Gameview". The times always use the same background as the Play bar. |
| **Push Play button down** | **Default** and **"Clean" Default** styles only. Puts the times in their own row below the header image and moves the Play button down, like HLTB for Deck. Off by default, so the times stay at the bottom of the header image just above Play. |
| **Background blur** | **"Clean"** styles only. **Match Play bar** (the default) copies the Play bar's blur, including the Clean Gameview **Blur** style. **Blur** always blurs the HLTB background. **None** removes its blur. In **"Clean" Default**, when the Play bar is blurred and this setting is not **None**, the times sit on the Play bar's own blur, so both rows look like one panel unless **Push Play button down** is on. This setting never changes the Play bar's blur. |
| **Use Steam button corners** | **"Clean"** styles only. Keeps the corners of the **Details** button as Steam draws them, so the CSS Loader theme "Round" does not round them. Off by default. |
| **Hide "Details"** | Removes the button that opens the HowLongToBeat page. |
| **Toggle … stat** | Show or hide each of the four times. |
| **Customize appearance** | Change the background opacity, a text shadow, the text size, and (Default style only) the bottom border. Background opacity and the bottom border apply to the **Default** style only, because the **"Clean"** styles match the Play bar. **Reset appearance** returns these to their defaults. |
| **Clear HLTB cache** | Forgets saved times. Each game looks up its times again the next time you open it. |

## How a game is matched

- **Steam games** are matched by their Steam App ID. HowLongToBeat lists the
  Steam game on its own page, so a different edition is not used by mistake.
  If HowLongToBeat does not list the Steam App ID, no times appear.
- **Non-Steam games** use the Steam match saved in **Change Metadata...** in the
  same way. Without a Steam match, the game's name is used. When HowLongToBeat
  finds only one game for the name, that game is used. HowLongToBeat also
  searches other names of a game, so "Minecraft Bedrock" finds "Minecraft".
- If **Remove metadata** was used for a non-Steam game, its times are hidden and
  not looked up by name. They come back when you pick a Steam match or an IGN
  result in **Change Metadata...**, or after **Clear cache**. You can also choose
  an HLTB game by hand (below); that works even after Remove metadata.

### Choose the HLTB game for a non-Steam game

1. Open the game's menu and select **Change Metadata...**.
2. Under **HowLongToBeat game**, the number field and **Current game** show the
   game whose times the game page shows, and whether you chose it or it was
   found automatically. To choose another game, either:
   - select **Search HLTB**, change the name if needed, and select a game from
     the results. It is saved right away; or
   - paste the game's number or its page link, for example
     `https://howlongtobeat.com/game/7231`, then select **Apply HLTB game** or
     **Save**. Decky Metadata checks the number and does not save a number
     HowLongToBeat does not have.
3. To go back to automatic matching, empty the number field and select
   **Apply HLTB game**.

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

- Check that **Show HowLongToBeat times** is on, and that **Store** is on if the
  game is on a Store page.
- For a non-Steam game, check its Steam match in **Change Metadata...**, or choose
  the HLTB game by hand.
- Select **Clear HLTB cache** in the **HLTB times** section to look up every
  game again. A message under the button tells you when the cache is clear.
- HowLongToBeat has no official API. If it changes its site, times may stop
  appearing until Decky Metadata is updated. Check the logs as described in
  [updates and troubleshooting](updates-and-troubleshooting.md).

[Help home](README.md)
