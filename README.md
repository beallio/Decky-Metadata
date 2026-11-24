# Decky Metadata

[![Latest release](https://img.shields.io/github/v/release/beallio/Decky-Metadata)](https://github.com/beallio/Decky-Metadata/releases/latest)
[![License: GPL-3.0-or-later](https://img.shields.io/badge/license-GPL--3.0--or--later-blue)](LICENSE)

Decky Metadata adds Steam game details to non-Steam games in your library. It
can show descriptions, news, community posts, and controller layouts from the
matching game without replacing your custom artwork. For Steam and non-Steam
games, you can also show ProtonDB community ratings, HowLongToBeat times, and
watch game trailers.
For Steam games, you can restore the small achievement progress bar beside
Play Time.

![Decky Metadata in the Quick Access Menu](assets/decky-metadata-qam.png?cacheBuster=202611240820)

## Install

You need SteamOS Gaming Mode and [Decky Loader](https://decky.xyz/).

The same ZIP works with standard Decky Loader and the
[beallio Loader fork](https://github.com/beallio/decky-loader). The plugin includes
its backend; you do not need to set up Rust or Python.

1. Open the [latest release](https://github.com/beallio/Decky-Metadata/releases/latest).
2. Download `Decky-Metadata.zip`. Do not unzip it.
3. Open the Quick Access Menu and select Decky.
4. Open Decky Loader settings, then select **Developer**.
5. Under **Install Plugin from ZIP File**, select **Browse**.
6. Choose `Decky-Metadata.zip`, then select **Install**.

Decky Metadata will appear in the Decky menu. See the [installation guide](docs/help/installation.md)
if you need more help.

## Get started

Open Decky Metadata from the Quick Access Menu. The panel shows counts for
detected non-Steam games, saved metadata, and missing metadata, plus **Refresh
metadata** and its progress bar. It shows **Install** only when an update is
available. Open Settings with the gear or **Open settings** button; the panel
closes when Settings opens.

Settings is a full-screen page with Steam-style side tabs. The tabs are
Metadata, Compatibility status, ProtonDB badges, HLTB times, Game trailers,
Mini achievements, and Context menu. After a separator are Logs, Updates, and
Versions. Changes apply at once; there is no Save button. Press **B** to return
from a settings page to the tab list, then press **B** again to close Settings.
Opening Settings from a game's page leaves that page. The **Metadata** tab
includes **Clear cache** and **Delisted Steam games**.

![Decky Metadata Settings page on the Metadata tab](assets/decky-metadata-settings.png?cacheBuster=202611240820)

To edit a non-Steam game, select **Edit Metadata...** from the Library card's
**Options** menu or from the gear menu on the game page. The editor has a
sidebar of pages, like Steam's own settings. On **Game Match**, select **Search Steam** to find the game by
name. Check the result's artwork, developer, and release date, then select
**Use this Steam match**. If you know the Steam page link or app ID, enter it
under **Steam App ID** and select **Apply Steam App ID**. Select **Save** at
the bottom of the sidebar or press **X** to store the changes.

On **Shortcut Name**, you can preview a different name for the shortcut.
The name only changes when you confirm, and you can restore the original
name later. You do not need to select **Save**. See [matching and editing
games](docs/help/editing-games.md) for the full steps.

![Shortcut-name preview and controller-selectable action](assets/decky-metadata-shortcut-name.png?cacheBuster=202610011846)

![Decky Metadata editor for Wobbly Life, a non-Steam game, showing Game Match](assets/decky-metadata-editor.png?cacheBuster=20261115)

## What you can see

### Game details and links

After you match a game, its **Game Info** page can show a description, release
date, developer, publisher, screenshots, and Steam Deck compatibility rating.
It can also show links to the Steam store and other pages when available. Your
SteamGridDB artwork stays in place, including the game icon, cover, background,
and logo.

Descriptions use the source's short summary when available, then its longer
text. Manual descriptions keep your text and paragraph spacing. Release dates
are saved as calendar dates, so a timezone change does not change the saved day.
Older saved timestamps are converted once, keeping their local calendar day.
Correct an already-wrong date on **Details** or import the game's metadata again.
See [editing games](docs/help/editing-games.md).

![Game Info details for Wobbly Life](assets/decky-metadata-gameinfo-top.png?cacheBuster=202611151912)

![Game Info buttons and SteamOS compatibility for Wobbly Life](assets/decky-metadata-gameinfo-buttons.png?cacheBuster=202611151912)

### Compatibility status

Use the matching Steam game's compatibility rating, or choose a label for all
or just some of your non-Steam games. You can also choose a different label for
one game. A label you choose does not mean Valve tested your copy or promise
that the game will run well. See [choosing a compatibility
status](docs/help/compatibility-status.md).

If an older Metadata version was already loaded, restart Steam after the update
to refresh cached Library indicators.

### ProtonDB ratings

In Settings, open the **ProtonDB badges** tab and turn on **Enable ProtonDB badges**. It is off by
default. Choose ratings on Home covers, Library covers, game pages, or Steam
Store pages. Each view has its own switch. You can choose a cover corner and
show cover badges only when a game is focused or hovered.

Select the game-page button or the Store box to open that game's ProtonDB
reports. On a Steam Store game page the rating is in a boxed info row below the
trailers and screenshots, beside a **How Long To Beat** box. The ratings are
**Platinum**, **Gold**, **Silver**, **Bronze**, or **Borked**.
They describe community experience, not Valve certification or a guarantee
that your copy will run. Games without a match or rating have no badge.

See the [ProtonDB guide](docs/help/protondb-badges.md) for controls, matching,
Store row requirements, and troubleshooting.

![ProtonDB tier icons on Steam Library game covers](assets/decky-metadata-protondb-badges.png?cacheBuster=20261003)

![Store info row with How Long To Beat times and the ProtonDB rating for Brotato](assets/decky-metadata-store-row.png?cacheBuster=20261115)

### HowLongToBeat times

In Settings, open the **HLTB times** tab and turn on **Show HowLongToBeat times**. It is off by
default. A game's page then shows how long players take to finish it: Main
Story, Main + Extras, Completionist, and All Styles. The same times appear in a
**How Long To Beat** box on Steam Store game pages. Steam games are matched by
their Steam App ID; non-Steam games use their saved Steam match or their name.
You can choose the match for a non-Steam game on the editor's **HowLongToBeat**
page. The styles and appearance options of HLTB for Deck are included. The
**"Clean"** styles match the Clean Gameview **Transparent**, **Blur**, and
**Connected with Body** Play bars. When the Play bar is blurred, the **"Clean" Default** times
and the Play bar form one blurred panel. **Background blur** never changes the
Play bar's blur. **Use Steam button corners** gives the **"Clean"** styles'
**Details** button Steam's normal corners instead of the theme's rounded ones.
**Push Play button down** is available in the **Default** and **"Clean" Default**
styles. It moves the Play button below the times instead of layering the times
over the header image. **Keep Play above the footer**, on by default, moves
Play down only as far as its button stays a few pixels above Big Picture's
footer (Menu, Options, Select, Back), including footers that themes make taller,
shorter, or hide. When there is no room, the times stay on the image and Play
does not move. Turn it off to always move Play down by the full height of the
times.
While a Steam Cloud or SDH-Ludusavi save status bar sits at the bottom of the
header image, the times stay on the image and the Play button does not move, so
the bar keeps its artwork background. With themes that already put Play below
the image, the times get their own row when it fits above the footer.

When HLTB times are turned on, Decky Metadata sends game titles and
HowLongToBeat game numbers to howlongtobeat.com. It does not need your Steam
account or send your library.

See the [HLTB guide](docs/help/hltb.md) for settings, matching, and troubleshooting.

### Game trailers

In Settings, open the **Game trailers** tab and turn on **Enable trailers**, the
main switch. Settings are grouped under plain **Detail view** and **Home view**
subheadings. Detail includes its switch, delay, audio, and logo settings. Home
includes its switch and delay; Home previews stay muted behind the carousel.
The main switch is off by default; Detail is selected by default and Home is not.
**Video quality** applies to both views.

Steam trailers play first when available, with IGN as a fallback. Your saved
artwork is not changed. See [watching game trailers](docs/help/game-trailers.md)
for settings and controller controls.

Trailers keep a stable height while Steam opens or closes the game page, including after you turn the status theme off and on. Switching from the artwork to a trailer does not add another size change. Steam's normal page animation still plays.

The trailer follows the height of a visible, full-width Steam Cloud or Ludusavi status bar. A theme's hidden, compact, or moved indicator does not add extra trailer space.

![Hades artwork giving way to a game trailer on Steam Deck](assets/decky-metadata-trailers.webp?cacheBuster=202610011846)

### Mini achievements

In Settings, open **Mini achievements** and turn on **Enable mini achievements**
to show Steam's own ACHIEVEMENTS row beside Play Time on a game's page. The row
shows the earned/total count (for example 80/179) and a small progress bar. It
uses Steam's own data, look, and behavior. Touch or select it with a mouse to
open the game's My Achievements page. Like Steam's own row, the D-pad does not
stop on it.

The setting is off by default. Non-Steam games get a row only when another
plugin, such as Emuchievements, gives Steam their achievements. Steam still
hides the row in some cases, for example when the stats row is full.

See [mini-achievements help](docs/help/updates-and-troubleshooting.md#mini-achievements)
for setup, when the row appears, and troubleshooting.

![Steam's mini achievement progress bar on Brotato](assets/decky-metadata-mini-achievements.png?cacheBuster=20261113)

### Context menu

In Settings, open **Context menu** to change how the **Edit Metadata...** page
looks. Turn on **Game icon in editor header** to show the game's icon beside its
name at the top of the editor, like Steam's own menu. Long names scroll.

**Use Steam icon if missing** is on by default. When a non-Steam game has no
icon of its own, the editor shows the icon of the Steam game it is matched to.
If neither icon exists (for example, a delisted Steam match), the name shows
without an icon. You can change this option only when the main toggle is on.

### Community posts and news

A matched game can show Steam Community posts and news. If there are no Steam
Community cards, Decky Metadata can show screenshots from IGN instead. See
[community posts and news](docs/help/community-and-news.md).

![Steam Community content for Warhammer 40,000: Space Marine](assets/decky-metadata-community.png?cacheBuster=202610011846)

![Steam activity news for Warhammer 40,000: Space Marine](assets/decky-metadata-activity-news.png?cacheBuster=202610011846)

### Controller layouts

Find recommended, official, and community controller layouts from the matching
Steam game. Your own layouts and Steam's templates remain available. See
[using controller layouts](docs/help/controller-layouts.md).

![Controller layouts for Warhammer 40,000: Space Marine](assets/decky-metadata-controller-layouts.png?cacheBuster=202610011846)

## Languages

The plugin's own text follows your Steam language. It is available in Albanian,
Arabic, Bulgarian, Chinese (Simplified and Traditional), Czech, Dutch, English,
Finnish, French, Georgian, German, Greek, Italian, Japanese, Korean, Polish,
Portuguese (Brazil and Portugal), Romanian, Russian, Spanish, Swedish, Turkish,
and Ukrainian. If your Steam language has no plugin text, the plugin uses your
system language when that language has plugin text. Otherwise, the plugin uses
English. Steam has no Albanian or Georgian setting. The plugin uses those only
when your system language is Albanian or Georgian and the Steam language has no
plugin text.

The non-English text is a machine translation that no native speaker has
reviewed yet. Corrections are welcome. HowLongToBeat data and IGN details stay
in English.

For a non-Steam game matched to a Steam store page, Steam news follows your
Steam language. Steam sends the news in your language when the publisher wrote
a translation, and in English when not. The description and genres follow your
Steam language when the plugin first gets the game's Steam details. Names,
developers, publishers, and release dates stay in English. If you change your
Steam language later, the plugin does not replace a description by itself,
because you may have edited it. On **Game Match**, select **Load Steam text
in** *your language*, then select **Save**.
Steam gives English text if the store page has no text in your language.

## Updates and help

Open **Updates** in Settings to check for updates. Open **Logs** to view recent
logs; include those logs and the versions shown under **Versions** when you
report a problem. See [updates and troubleshooting](docs/help/updates-and-troubleshooting.md).

See the [changelog](CHANGELOG.md) for release changes. The images show examples
from Steam Gaming Mode; artwork and layout can vary with your games and themes.

## License and credits

Decky Metadata is licensed under the [GNU General Public License v3.0 or later](LICENSE).

It is a fork of [Playhub Metadata](https://github.com/LoZazaMastro/Playhub-Metadata)
by ZazaMastro and started from the
[Decky Plugin Template](https://github.com/SteamDeckHomebrew/decky-plugin-template).
HowLongToBeat times follow
[HLTB for Deck](https://github.com/morwy/hltb-for-deck) by hulkrelax, morwy, and
contributors (MIT).
The game-menu integration is based on
[decky-steamgriddb](https://github.com/SteamGridDB/decky-steamgriddb) by the
SteamGridDB project.
