# Decky Metadata

[![Latest release](https://img.shields.io/github/v/release/beallio/Decky-Metadata)](https://github.com/beallio/Decky-Metadata/releases/latest)
[![License: GPL-3.0-or-later](https://img.shields.io/badge/license-GPL--3.0--or--later-blue)](LICENSE)

Decky Metadata makes games you added to Steam feel like a natural part of your
library. It finds the matching Steam game and adds useful details, news,
community posts, and controller layouts.

![Decky Metadata in the Quick Access Menu](assets/decky-metadata-qam.png?cacheBuster=20260718)

## What it can add

For a non-Steam game, Decky Metadata can add:

- Descriptions, developers, publishers, release dates, ratings, and screenshots
- A Steam Deck compatibility status
- Steam news and community posts
- Controller layouts from the matching Steam game
- Useful Steam links in Game Info

Your custom artwork from SteamGridDB stays in place.

## Install

You need SteamOS Gaming Mode and Decky Loader.

1. Open the [latest release](https://github.com/beallio/Decky-Metadata/releases/latest).
2. Download `Decky-Metadata.zip`. Do not unzip it.
3. Open the Quick Access Menu and select Decky.
4. Open Decky Loader settings, then select **Developer**.
5. Under **Install Plugin from ZIP File**, select **Browse**.
6. Choose `Decky-Metadata.zip`, then select **Install**.

Decky Metadata will appear in the Decky menu after installation.

## Get started

Open Decky Metadata from the Quick Access Menu. From there, you can find missing
metadata, clear saved matches, update the list of games that Steam no longer
sells, view logs, and check for plugin updates.

To work with one game:

1. Open the game's menu.
2. Select **Decky metadata...**.
3. Search for the correct Steam game or change the details yourself.
4. Select **Save** when you finish.

If a game matched incorrectly, clear the match and choose the correct one.

## Set the compatibility status

The **Decky metadata...** editor includes a **Compatibility status** setting.
Choose Automatic, Verified, Playable, Unsupported, or Unknown.

Automatic uses Steam's status for the matching game when one is available. It
does not use ProtonDB.

![Decky Metadata editor for a non-Steam game](assets/decky-metadata-editor.png?cacheBuster=20260717)

## See more in Game Info

After a game is matched, Game Info can show its artwork, description, developer,
publisher, release date, and Steam Deck compatibility.

![Game Info details for Warhammer 40,000: Space Marine](assets/decky-metadata-gameinfo-top.png?cacheBuster=20260717)

Game Info can also show links to the Steam store, DLC, and Points Shop when they
are available. Links that do not apply to the game are left out.

![Game Info buttons for Warhammer 40,000: Space Marine](assets/decky-metadata-gameinfo-buttons.png?cacheBuster=20260717)

## Keep your custom artwork

Decky Metadata works with custom artwork from SteamGridDB. Your Library Home
icon, capsule, hero, and logo stay in place while Game Info receives the extra
Steam details.

## See community posts and news

Your added game can show posts from the matching Steam Community page. If Steam
has no cards to show, Decky Metadata can use screenshots from IGN instead.

![Steam Community content for Warhammer 40,000: Space Marine](assets/decky-metadata-community.png?cacheBuster=20260717)

News and announcements from the matching Steam game can also appear in the
normal Activity area.

![Steam activity news for Warhammer 40,000: Space Marine](assets/decky-metadata-activity-news.png?cacheBuster=20260717)

## Use Steam controller layouts

Controller Settings can show recommended, official, and community layouts from
the matching Steam game. Your own layouts and Steam's templates remain
available.

Search shows layouts for your added game and the Steam game it matches. It does
not mix in layouts from unrelated games.

On Legion Go S, matching layouts remain available with Steam's controller filter
turned on. **Show All** keeps the tab you were already viewing. Normal Steam Deck
behavior is unchanged.

![Controller layouts for Warhammer 40,000: Space Marine](assets/decky-metadata-controller-layouts.png?cacheBuster=20260717)

## Updates and help

Use the Decky Metadata panel in the Quick Access Menu to check for updates and
view recent logs.

If you report a problem, include the recent logs and the versions shown in the
**Versions** panel. For a controller-layout problem, also include the controller
name and number shown there.

Want to test changes before the next stable release? Use the rolling
[`dev-build` prerelease](https://github.com/beallio/Decky-Metadata/releases/tag/dev-build).
Testing builds may be less stable.

## License and credits

Decky Metadata is licensed under the [GNU General Public License v3.0 or later](LICENSE).

It is a fork of [Playhub Metadata](https://github.com/LoZazaMastro/Playhub-Metadata)
by ZazaMastro and started from the
[Decky Plugin Template](https://github.com/SteamDeckHomebrew/decky-plugin-template).
The game-menu integration is based on
[decky-steamgriddb](https://github.com/SteamGridDB/decky-steamgriddb) by the
SteamGridDB project.
