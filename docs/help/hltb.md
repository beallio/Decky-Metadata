# Show HowLongToBeat times

HowLongToBeat (HLTB) collects how long players take to finish games. Decky
Metadata can show four HLTB times on a game's page, for Steam games and for
non-Steam games: **Main Story**, **Main + Extras**, **Completionist**, and
**All Styles**. Select **Details** to open the game's HowLongToBeat page.

## Turn on HLTB times

1. Open Decky Metadata from the Quick Access Menu, then select the gear or **Open settings**.
2. Open the **HLTB times** tab in Settings.
3. Turn on **Show HowLongToBeat times**. It is off by default.

When it is off, Decky Metadata sends nothing to HowLongToBeat and shows no times.

## Show times on Store pages

On a Steam Store game page, Decky Metadata shows an info row directly below the
trailers and screenshots. It is boxed like Steam's own rows, such as
**Reviews**. The **How Long To Beat** box shows the same four times as the game
page, and the **Toggle … stat** switches also hide or show them here. It works
for games you do not own. Select the box to open the game on HowLongToBeat,
unless **Hide "Details"** is on.

The **Store** switch in the **HLTB times** tab turns the
**How Long To Beat** box on. It is on by default, and you can change it only
while **Show HowLongToBeat times** is on. The row also holds a ProtonDB box,
which the ProtonDB **Store** switch controls. If only one box has data, it
fills the row. If both switches are off, no row appears.

The row needs Steam's remote browser debugging. See [Enable the Store
row](protondb-badges.md#enable-the-store-row).

## Choose how the times look

| Setting | What it does |
| --- | --- |
| **HLTB Style** | **Default** puts a row of times at the bottom of the game's header image, just above the Play button. The **"Clean"** styles place the times over the header image, with a **Details** button that looks like the buttons beside Play. **"Clean" Left** puts the times on the left side of the header image instead of the right. They are meant for the CSS Loader theme "Clean Gameview". The times always use the same background as the Play bar. |
| **Push Play button down** | **Default** and **"Clean" Default** styles only. Puts the times in their own row below the header image and moves the Play button down, like HLTB for Deck. While a Steam Cloud or SDH-Ludusavi save status bar shows at the bottom of the header image, the times stay on the image and the Play button does not move, so the status bar keeps its artwork background. The times return to their own row when that bar goes away. With themes where the Play button already sits below the header image, the times always get their own row. Off by default, so the times stay at the bottom of the header image just above Play. |
| **Keep Play above the footer** | **Default** and **"Clean" Default** styles only, and only while **Push Play button down** is on. Moves the Play button down only as far as its bottom stays a few pixels above Big Picture's footer (Menu, Options, Select, Back). Themes can make the footer taller, shorter, or hide it; the push follows the footer's current size, so Play never ends up behind it. When no room is left, the times stay on the header image instead. On by default. |
| **Background blur** | **"Clean"** styles only. **Match Play bar** (the default) copies the Play bar's blur, including the Clean Gameview **Blur** style. **Blur** always blurs the HLTB background. **None** removes its blur. In **"Clean" Default**, when the Play bar is blurred and this setting is not **None**, the times sit on the Play bar's own blur, so both rows look like one panel unless **Push Play button down** is on. This setting never changes the Play bar's blur. |
| **Use Steam button corners** | The switch shows in every style, but changes only the **"Clean"** styles' **Details** button. Keeps its corners as Steam draws them, so the CSS Loader theme "Round" does not round them. Off by default. |
| **Hide "Details"** | Removes the button that opens the HowLongToBeat page. It also removes the link from the **How Long To Beat** box on Store pages. |
| **Toggle … stat** | Show or hide each of the four times. |
| **Customize appearance** | Change the background opacity, a text shadow, the text size, and (Default style only) the bottom border. Background opacity and the bottom border apply to the **Default** style only, because the **"Clean"** styles match the Play bar. **Reset appearance** returns these to their defaults. |
| **Clear HLTB cache** | Forgets saved times. Each game looks up its times again the next time you open it. |

## How a game is matched

- **Steam games** are matched by their Steam App ID. HowLongToBeat lists the
  Steam game on its own page, so a different edition is not used by mistake.
  If HowLongToBeat does not list the Steam App ID, no times appear.
- **Non-Steam games** use the Steam match saved on **Game Match**. If there
  is no Steam match, HowLongToBeat searches for the game's name. If it finds
  only one game, Decky Metadata uses that game. HowLongToBeat also searches
  for other names of a game, so "Minecraft Bedrock" finds "Minecraft".
- If you used **Remove Metadata** on **Advanced**, Decky Metadata hides the
  times and does not search for the game by name. The times can come back
  when you save a Steam match or an IGN result, or select **Clear cache**.
  You can also choose a HowLongToBeat game after you remove the metadata.

### Choose the HLTB game for a non-Steam game

1. Open the game's menu and select **Edit Metadata...**.
2. On **HowLongToBeat**, the number field and **Current game** show the
   game whose times the game page shows, and whether you chose it or it was
   found automatically. To choose another game, either:
   - Select **Search HLTB**, change the name if necessary, and select a game
     from the results. This loads the game into the form; or
   - Paste the game's number or its page link, for example
     `https://howlongtobeat.com/game/7231`, then select **Apply HLTB game**.
     Decky Metadata checks the number or link and shows the game it found. If
     HowLongToBeat does not have the number, nothing is changed.
3. Select **Save** to store the chosen game. Nothing is saved until then.
4. To go back to automatic matching, empty the number field, select
   **Apply HLTB game**, then select **Save**.

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
its own HLTB times, so you do not see two rows. The **HLTB times** tab names
the conflict. Disable **HLTB for Deck** in Decky Loader to use Decky Metadata's
times. Its settings are not copied.

## If times are missing or wrong

- Check that **Show HowLongToBeat times** is on, and that **Store** is on if the
  game is on a Store page.
- For a non-Steam game, open **Edit Metadata...** and check the saved match
  on **Game Match**, or choose a game on **HowLongToBeat**.
- Select **Clear HLTB cache** in the **HLTB times** tab to look up every
  game again. A message under the button tells you when the cache is clear.
- HowLongToBeat has no official API. If it changes its site, times may stop
  appearing until Decky Metadata is updated. Check the logs as described in
  [updates and troubleshooting](updates-and-troubleshooting.md).

[Help home](README.md)
