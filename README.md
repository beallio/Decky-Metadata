# Playhub Metadata

Playhub Metadata is a Decky Loader plugin for Windows.

This plugin is built for Steam Big Picture on Windows, especially for non-Steam
PC games, Game Pass games, Xbox App games, and emulated games.

The goal is simple: make your Steam Big Picture library feel cleaner, richer,
and more console-like, even when the games are not from Steam.

It can add metadata, community images and videos, categories, and achievements to non-Steam games,
including RetroAchievements and Xbox PC achievements.

## Features

- Finds missing game metadata automatically.
- Adds descriptions, developers, publishers, release dates, ratings, and info fields.
- Adds screenshots and community media when available.
- Lets you edit metadata manually for each game.


## Steam Activity News

For non-Steam shortcuts that can be matched to a Steam Store app, Playhub Metadata can fetch Steam news and announcements and feed them into Steam Big Picture's normal Activity area.


## Achievements

Playhub Metadata can show achievements for non-Steam games inside Steam Big Picture.

It supports two achievement sources:

- RetroAchievements for ROMs and emulator shortcuts.
- Xbox / OpenXBL achievements for Xbox PC, Game Pass, Microsoft Store. (Important! You need to use UWPHook to import your games in Steam!).

You can choose the achievement source per game:

- Auto
- RetroAchievements
- Xbox
- Disabled

## Xbox PC Achievements

Playhub Metadata can show Xbox PC / Game Pass achievements directly inside Steam Big Picture for matched UWPHook games.

This means Xbox PC achievements can appear in Steam's interface for non-Steam shortcuts.

To use Xbox achievements, you need an OpenXBL API key first.

## OpenXBL Setup

1. Create an account at `https://xbl.io`.
2. Open your OpenXBL dashboard.
3. Copy your API key.
4. Open Playhub Metadata in Decky.
5. Paste the API key in the OpenXBL field.
6. Press `Login`.
7. Press `Scan Xbox achievements`.

OpenXBL API limits apply, so Playhub keeps scans conservative and uses cache settings to avoid unnecessary requests.

## RetroAchievements Setup

1. Create or open your RetroAchievements account.
2. Copy your RetroAchievements web API key from your account settings.
3. Open Playhub Metadata in Decky.
4. Enter your RetroAchievements username and API key.
5. Press `Login`.

For individual ROMs, Playhub can try to detect the matching RetroAchievements game automatically. You can also search and select the correct game manually.

## Cache Options

Playhub Metadata lets you choose when achievement data should refresh:

- Hourly
- Daily
- Weekly
- PC session
- Manually

Manual mode is useful if you want fewer API calls and prefer refreshing only when you explicitly scan or sync.

## Notes

Keep in mind that Playhub Metadata does not turn non-Steam achievements into "real" Steam achievements. It just displays supported achievement data inside Steam Big Picture.
Xbox achievement data comes from OpenXBL. RetroAchievements data comes from RetroAchievements.

## License & credits

Playhub Metadata is licensed under the **GNU General Public License v3.0 or later** (see `LICENSE`).

Playhub Metadata was bootstrapped from the [Decky Plugin Template](https://github.com/SteamDeckHomebrew/decky-plugin-template). Full credit and thanks to the Steam Deck Homebrew contributors.

The library context-menu integration (`src/contextMenuPatch.tsx`) is derived from the
[decky-steamgriddb](https://github.com/SteamGridDB/decky-steamgriddb) plugin by the SteamGridDB
project, which is licensed under the GPL-3.0. Full credit and thanks to its authors and contributors.
