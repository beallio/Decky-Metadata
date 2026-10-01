# Decky Metadata

[![Latest release](https://img.shields.io/github/v/release/beallio/Decky-Metadata)](https://github.com/beallio/Decky-Metadata/releases/latest)
[![License: GPL-3.0-or-later](https://img.shields.io/badge/license-GPL--3.0--or--later-blue)](LICENSE)

Decky Metadata adds Steam game details to games you added to Steam yourself. It
can show descriptions, news, community posts, and controller layouts from the
matching game. It can also play trailers on game pages. You can correct a match
if needed, and your custom artwork stays in place.

![Decky Metadata in the Quick Access Menu](assets/decky-metadata-qam.png?cacheBuster=20260718)

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
**Metadata**, **Compatibility status**, **Game trailers**, **Mini achievements**,
**Logs**, and **Updates** start closed. Press A on a heading or select it to open or close
that section. **Metadata** includes the cache and **Delisted Steam games**
tools. **Compatibility status** is immediately below it.

To edit one game, open its menu and select **Decky metadata...**. Find the right
game in the Steam Store, paste its page link into **Steam App ID**, and select
**Apply Steam App ID**. Select **Save** for other details you change. If the
match is wrong, replace it with the right one.

The editor can preview a cleaner shortcut name. It changes the name only if you
confirm; you can restore the original name later. See [matching and editing
games](docs/help/editing-games.md) for the full steps.

![Shortcut-name preview and controller-selectable action](assets/decky-metadata-shortcut-name.png?cacheBuster=20260907)

![Decky Metadata editor for a non-Steam game](assets/decky-metadata-editor.png?cacheBuster=20260717)

## What you can see

### Game details and links

After you match a game, its **Game Info** page can show a description, release
date, developer, publisher, screenshots, and Steam Deck compatibility rating.
It can also show links to the Steam store and other pages when available. Your
SteamGridDB artwork stays in place, including the game icon, cover, background,
and logo.

![Game Info details for Warhammer 40,000: Space Marine](assets/decky-metadata-gameinfo-top.png?cacheBuster=20260717)

![Game Info buttons for Warhammer 40,000: Space Marine](assets/decky-metadata-gameinfo-buttons.png?cacheBuster=20260717)

### Compatibility status

Use the matching Steam game's compatibility rating, or choose a label for all
or just some of your non-Steam games. You can also choose a different label for
one game. A label you choose does not mean Valve tested your copy or promise
that the game will run well. See [choosing a compatibility
status](docs/help/compatibility-status.md).

### ProtonDB ratings

Open **ProtonDB badges** in the Decky Metadata panel and turn on **Enable
ProtonDB badges**. It is off by default. You can show ratings on Home and Library
game covers, beside the controller button on game pages, and on Steam Store
pages. Steam games use their own app IDs. Non-Steam games use their saved
Metadata Steam App ID first. If no valid ID is saved, the shortcut name is
looked up using Steam, then ProtonDB's title index when Steam finds no match.
Changing or clearing a saved match updates badges that are already on screen.

The game-page button comes before the controller button and uses Steam's
button style. Select it, or the Store badge, to open the game's ProtonDB page.
The Store badge is a colored icon at the bottom right, with no visible text.
Cover icons do not change how you select or launch a game. Choose a cover
corner, or show cover icons only when a game is focused or hovered.
The four view switches are separate. Turning off the main switch keeps your
choices for each view.

The colors mean **Platinum**, **Gold**, **Silver**, **Bronze**, or **Borked**.
These are ProtonDB community ratings, not Valve certification or a guarantee
that your copy works now. Games with no match or rating have no badge. Ratings
are fetched directly from ProtonDB, shared between views, and refreshed after
24 hours while the game is visible. No additional compatibility service is used.

If you also use **ProtonDB Badges**, turn off one plugin's overlapping badges
to avoid duplicates. Store badges require CEF Remote Debugging in Decky's
Developer settings.


### Game trailers

Turn on **Game trailers** to show a video on a game's main Library page. Steam
trailers play first when available; Decky Metadata can look for a matching IGN
trailer if Steam has none. Trailers are off by default and stream while you
watch. See [watching game trailers](docs/help/game-trailers.md) for sound,
quality, and controller controls.

Trailers keep a stable height while Steam animates the game page into view, including when a transparent save-status bar is below the artwork. Steam's normal page animation still plays.

![Hades artwork giving way to a game trailer on Steam Deck](assets/decky-metadata-trailers.webp?cacheBuster=20260928)

### Mini achievements

Open **Mini achievements** and turn on **Enable mini achievements** to restore
Steam's small achievement progress bar beside Play Time on game details pages.
It is off by default and uses Steam's own progress data; it does not add
achievement tracking to non-Steam games.

Before enabling it here, turn off **Enable mini achievements** in **Decky UI
Restored**. Use only one plugin's mini-achievements toggle at a time. Its other
fixes can stay enabled. See [mini-achievements help](docs/help/updates-and-troubleshooting.md#mini-achievements).

### Community posts and news

A matched game can show Steam Community posts and news. If there are no Steam
Community cards, Decky Metadata can show screenshots from IGN instead. See
[community posts and news](docs/help/community-and-news.md).

![Steam Community content for Warhammer 40,000: Space Marine](assets/decky-metadata-community.png?cacheBuster=20260717)

![Steam activity news for Warhammer 40,000: Space Marine](assets/decky-metadata-activity-news.png?cacheBuster=20260717)

### Controller layouts

Find recommended, official, and community controller layouts from the matching
Steam game. Your own layouts and Steam's templates remain available. See
[using controller layouts](docs/help/controller-layouts.md).

![Controller layouts for Warhammer 40,000: Space Marine](assets/decky-metadata-controller-layouts.png?cacheBuster=20260717)

## Updates and help

Check for updates in the Decky Metadata panel. If something does not work,
start with the [help pages](docs/help/README.md). You can also view recent logs
in the panel; include those logs and the versions shown under **Versions** when
you report a problem. See [updates and troubleshooting](docs/help/updates-and-troubleshooting.md).

This page may describe features not yet in the latest release. See the
[changelog](CHANGELOG.md) for what changed. Screenshots may show an earlier layout.

## License and credits

Decky Metadata is licensed under the [GNU General Public License v3.0 or later](LICENSE).

It is a fork of [Playhub Metadata](https://github.com/LoZazaMastro/Playhub-Metadata)
by ZazaMastro and started from the
[Decky Plugin Template](https://github.com/SteamDeckHomebrew/decky-plugin-template).
The game-menu integration is based on
[decky-steamgriddb](https://github.com/SteamGridDB/decky-steamgriddb) by the
SteamGridDB project.
