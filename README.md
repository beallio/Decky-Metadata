# Decky Metadata

[![License: GPL-3.0-or-later](https://img.shields.io/badge/license-GPL--3.0--or--later-blue)](LICENSE)
[![Latest release](https://img.shields.io/github/v/release/beallio/Decky-Metadata)](https://github.com/beallio/Decky-Metadata/releases/latest)
[![CI](https://github.com/beallio/Decky-Metadata/actions/workflows/ci.yml/badge.svg)](https://github.com/beallio/Decky-Metadata/actions/workflows/ci.yml)

<!-- Badges may require GitHub authentication while this repository is private. -->

Decky Metadata helps your non-Steam games feel at home in your Steam library. On SteamOS and Steam Deck, it finds the details a shortcut is missing, brings in content from the matching Steam game, and gives you simple controls through Decky Loader.

![Decky Metadata Quick Access Menu panels](assets/decky-metadata-qam.png?cacheBuster=20260718)

## Install

Open the [latest release](https://github.com/beallio/Decky-Metadata/releases/latest), then download `Decky-Metadata.zip` and sideload it with Decky's developer-mode plugin installer. You can also copy the ZIP asset's URL and paste it into Decky's install-from-URL flow.

Want to try changes before the next stable release? The rolling [`dev-build` prerelease](https://github.com/beallio/Decky-Metadata/releases/tag/dev-build) is the testing channel, so it may be less stable.

## Find the details your games are missing

Decky Metadata can match detected non-Steam games and fill in descriptions, developers, publishers, release dates, ratings, screenshots, and other Steam details. It also keeps a local list of games Steam no longer sells, so removed store pages can still be matched by title.

From the Quick Access Menu, you can see how many games were found, refresh missing metadata, clear saved matches, update the list of delisted games, view recent logs, turn on debug logging, check for and install Decky Metadata updates, and check your Decky Metadata, Decky Loader, and SteamOS versions.

## Edit metadata from a game's menu

Open a non-Steam game's context menu and choose the metadata editor to search for a match or adjust its details yourself. You can also pin a Steam app ID when you know exactly which Steam game belongs with the shortcut.

![Decky Metadata editor for a non-Steam game](assets/decky-metadata-editor.png?cacheBuster=20260717)

## See more in Game Info

For a matched shortcut, the Game Info tab can show the Steam game's artwork, description, developer, publisher, release date, and Steam Deck compatibility.

![Game Info details for Warhammer 40,000: Space Marine](assets/decky-metadata-gameinfo-top.png?cacheBuster=20260717)

The buttons at the bottom also point to useful pages for the matched Steam game. The Store Page stays available while the game is listed, and known DLC and Points Shop links open the right Steam pages. Links that do not make sense for a non-Steam shortcut are left out.

![Game Info buttons for Warhammer 40,000: Space Marine](assets/decky-metadata-gameinfo-buttons.png?cacheBuster=20260717)

## Browse Steam Community content

Matched shortcuts can show content from the Steam game's Community page. If Steam's usual page is empty, Decky Metadata looks for fresh Community posts, and can fall back to IGN screenshots when Steam has no cards to show.

![Steam Community content for Warhammer 40,000: Space Marine](assets/decky-metadata-community.png?cacheBuster=20260717)

## Use layouts from the matched Steam game

Controller Settings can include recommended, official, and community layouts from the matching Steam game. Your shortcut's personal layouts and Steam's general templates stay available, and you still preview and choose layouts through Steam's normal controls.

![Controller layouts for Warhammer 40,000: Space Marine](assets/decky-metadata-controller-layouts.png?cacheBuster=20260717)

## Keep up with Steam activity

When a non-Steam shortcut matches a Steam game, Decky Metadata brings that game's news and announcements into Steam's normal Activity area. The feed refreshes automatically when you open the matched game's details.

![Steam activity news for Warhammer 40,000: Space Marine](assets/decky-metadata-activity-news.png?cacheBuster=20260717)

## License & Credits

Decky Metadata is licensed under the **GNU General Public License v3.0 or later** (see `LICENSE`).

Decky Metadata is a fork of [Playhub Metadata](https://github.com/LoZazaMastro/Playhub-Metadata) by ZazaMastro. Full credit and thanks to the original author and contributors.

Decky Metadata was bootstrapped from the [Decky Plugin Template](https://github.com/SteamDeckHomebrew/decky-plugin-template). Full credit and thanks to the Steam Deck Homebrew contributors.

The library context-menu integration (`src/contextMenuPatch.tsx`) is derived from the [decky-steamgriddb](https://github.com/SteamGridDB/decky-steamgriddb) plugin by the SteamGridDB project, which is licensed under the GPL-3.0. Full credit and thanks to its authors and contributors.
