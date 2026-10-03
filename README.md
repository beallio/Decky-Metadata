# Decky Metadata

[![Latest release](https://img.shields.io/github/v/release/beallio/Decky-Metadata)](https://github.com/beallio/Decky-Metadata/releases/latest)
[![License: GPL-3.0-or-later](https://img.shields.io/badge/license-GPL--3.0--or--later-blue)](LICENSE)

Decky Metadata adds Steam game details to non-Steam games in your library. It
can show descriptions, news, community posts, and controller layouts from the
matching game without replacing your custom artwork. For Steam and non-Steam
games, you can also show ProtonDB community ratings and watch game trailers.
For Steam games, you can restore the small achievement progress bar beside
Play Time.

![Metadata controls in the Quick Access Menu](assets/decky-metadata-qam.png?cacheBuster=20261003)

## Install

You need SteamOS Gaming Mode and [Decky Loader](https://decky.xyz/).

1. Open the [latest release](https://github.com/beallio/Decky-Metadata/releases/latest).
2. Download `Decky-Metadata.zip`. Do not unzip it.
3. Open the Quick Access Menu and select Decky.
4. Open Decky Loader settings, then select **Developer**.
5. Under **Install Plugin from ZIP File**, select **Browse**.
6. Choose `Decky-Metadata.zip`, then select **Install**.

Decky Metadata will appear in the Decky menu. See the [installation guide](docs/help/installation.md)
if you need more help.

## Get started

Open Decky Metadata from the Quick Access Menu to find games that need details.
Select a section heading to show its controls. **Versions** starts open;
**Metadata**, **Compatibility status**, **ProtonDB badges**, **Game trailers**,
**Mini achievements**, **Logs**, and **Updates** start closed. Press A on a
heading or select it to open or close that section. **Metadata** includes the
cache and **Delisted Steam games** tools. **Compatibility status** is immediately
below it.

To edit one game, open its menu and select **Decky metadata...**. Find the right
game in the Steam Store, paste its page link into **Steam App ID**, and select
**Apply Steam App ID**. Select **Save** for other details you change. If the
match is wrong, replace it with the right one.

The editor can preview a cleaner shortcut name. It changes the name only if you
confirm; you can restore the original name later. See [matching and editing
games](docs/help/editing-games.md) for the full steps.

![Shortcut-name preview and controller-selectable action](assets/decky-metadata-shortcut-name.png?cacheBuster=202610011846)

![Decky Metadata editor for a non-Steam game](assets/decky-metadata-editor.png?cacheBuster=202610011846)

## What you can see

### Game details and links

After you match a game, its **Game Info** page can show a description, release
date, developer, publisher, screenshots, and Steam Deck compatibility rating.
It can also show links to the Steam store and other pages when available. Your
SteamGridDB artwork stays in place, including the game icon, cover, background,
and logo.

![Game Info details for Warhammer 40,000: Space Marine](assets/decky-metadata-gameinfo-top.png?cacheBuster=202610011846)

![Game Info buttons for Warhammer 40,000: Space Marine](assets/decky-metadata-gameinfo-buttons.png?cacheBuster=202610011846)

### Compatibility status

Use the matching Steam game's compatibility rating, or choose a label for all
or just some of your non-Steam games. You can also choose a different label for
one game. A label you choose does not mean Valve tested your copy or promise
that the game will run well. See [choosing a compatibility
status](docs/help/compatibility-status.md).

### ProtonDB ratings

Open **ProtonDB badges** and turn on **Enable ProtonDB badges**. It is off by
default. Choose ratings on Home covers, Library covers, game pages, or Steam
Store pages. Each view has its own switch. You can choose a cover corner and
show cover badges only when a game is focused or hovered.

Select the game-page button or Store badge to open that game's ProtonDB reports.
The ratings are **Platinum**, **Gold**, **Silver**, **Bronze**, or **Borked**.
They describe community experience, not Valve certification or a guarantee
that your copy will run. Games without a match or rating have no badge.

See the [ProtonDB guide](docs/help/protondb-badges.md) for controls, matching,
Store requirements, and troubleshooting.

![ProtonDB tier icons on Steam Library game covers](assets/decky-metadata-protondb-badges.png?cacheBuster=20261003)

### Game trailers

Turn on **Game trailers** to show a video on a game's main Library page. Steam
trailers play first when available; Decky Metadata can look for a matching IGN
trailer if Steam has none. Trailers are off by default and stream while you
watch. See [watching game trailers](docs/help/game-trailers.md) for sound,
quality, and controller controls.

Trailers keep a stable height while Steam opens or closes the game page, including after you turn the status theme off and on. Switching from the artwork to a trailer does not add another size change. Steam's normal page animation still plays.

The trailer follows the height of a visible, full-width Steam Cloud or Ludusavi status bar. A theme's hidden, compact, or moved indicator does not add extra trailer space.

![Hades artwork giving way to a game trailer on Steam Deck](assets/decky-metadata-trailers.webp?cacheBuster=202610011846)

### Mini achievements

Open **Mini achievements** and turn on **Enable mini achievements** to restore
Steam's small achievement progress bar beside Play Time on game details pages.
It is off by default and uses Steam's own progress data; it does not add
achievement tracking to non-Steam games.

See [mini-achievements help](docs/help/updates-and-troubleshooting.md#mini-achievements)
for setup, supported games, and troubleshooting.

![Steam's mini achievement progress bar on Brotato](assets/decky-metadata-mini-achievements.png?cacheBuster=20261003)

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

## Updates and help

Check for updates in the Decky Metadata panel. If something does not work,
start with the [help pages](docs/help/README.md). You can also view recent logs
in the panel; include those logs and the versions shown under **Versions** when
you report a problem. See [updates and troubleshooting](docs/help/updates-and-troubleshooting.md).

See the [changelog](CHANGELOG.md) for release changes. The images show examples
from Steam Gaming Mode; artwork and layout can vary with your games and themes.

## License and credits

Decky Metadata is licensed under the [GNU General Public License v3.0 or later](LICENSE).

It is a fork of [Playhub Metadata](https://github.com/LoZazaMastro/Playhub-Metadata)
by ZazaMastro and started from the
[Decky Plugin Template](https://github.com/SteamDeckHomebrew/decky-plugin-template).
The game-menu integration is based on
[decky-steamgriddb](https://github.com/SteamGridDB/decky-steamgriddb) by the
SteamGridDB project.
