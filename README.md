# Decky Metadata

[![Latest release](https://img.shields.io/github/v/release/beallio/Decky-Metadata)](https://github.com/beallio/Decky-Metadata/releases/latest)
[![License: GPL-3.0-or-later](https://img.shields.io/badge/license-GPL--3.0--or--later-blue)](LICENSE)

Decky Metadata makes games you added to Steam feel like a natural part of your
library. It finds the matching Steam game and adds useful details, news,
community posts, and controller layouts.

![Decky Metadata in the Quick Access Menu](assets/decky-metadata-qam.png?cacheBuster=20260718)

This README describes the current branch. See the [changelog](CHANGELOG.md)
for released and unreleased changes; screenshots may show an earlier layout.

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

After you save a valid Steam match, the same **Decky metadata...** editor can
show Steam's cleaned shortcut name. You can preview the change, confirm it,
and later restore the exact original shortcut name. Decky Metadata never
changes shortcut names automatically.
The **Shortcut name** section is selectable with the D-pad, even when no rename
action is available.

![Shortcut-name preview and controller-selectable action](assets/decky-metadata-shortcut-name.png?cacheBuster=20260907)

## Set the compatibility status

Use Steam's compatibility rating, or choose your own label for the non-Steam
games in your library.

### Choose a default

Open Decky Metadata in the Quick Access Menu and find **Default compatibility
status**.

- **Automatic — use matched Steam status** uses the matching Steam game's
  rating. If none is available, your game's original status stays unchanged.
- Choose **Verified**, **Playable**, or **Unsupported** to set your own label.
- **Unknown** shows no compatibility badge.

Leave **Automatic** selected if you just want Steam's rating.

### Choose which games it applies to

If you choose your own label, use **Apply default to**:

| Option | Games included |
| --- | --- |
| **Steam-matched games** | Games matched to a game on Steam. |
| **Saved games without a Steam ID** | Games with saved information but no Steam match, including information you added yourself. |
| **All games with saved metadata** | Any game with saved information in Decky Metadata. |
| **All non-Steam games** | Every non-Steam game or app, including entries you have not matched. |

For example, choose **Playable** and **All non-Steam games** to give all your
added games that label.

Games you leave out still use Steam's rating when one is available, or keep
their original status. This control is disabled under **Automatic**, but
remembers your selection.

### Change just one game

Open the game's menu, select **Decky metadata...**, and find **Compatibility
status**:

- **Use global default** follows the choices above.
- **Follow Valve** ignores your default and uses Steam's rating for that game.
  If no rating is available, it keeps the game's original status.
- Choose **Verified**, **Playable**, **Unsupported**, or **Unknown** to set a
  label just for this game.

Select **Save** when you finish. A per-game choice takes priority over your
default.

**When will I see the change?** Other games update straight away. If you have
a game's **Game Info** tab open, leave that tab and return to see its new
status. Closing the Quick Access Menu alone does not update that open view.

Choosing a label does not mean Valve tested your game or guarantee how well
it will run. For more detail, see the
[compatibility guide](docs/specs/compatibility-status.md).

![Decky Metadata editor for a non-Steam game](assets/decky-metadata-editor.png?cacheBuster=20260717)

## See more in Game Info

After a game is matched, Game Info can show its artwork, description, developer,
publisher, release date, and Steam Deck compatibility.

A game whose title is made up only of words like `Prototype` now matches its
Steam entry automatically.

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
Removing metadata also removes that game's injected Activity news immediately.

![Steam activity news for Warhammer 40,000: Space Marine](assets/decky-metadata-activity-news.png?cacheBuster=20260717)

## Use Steam controller layouts

Controller Settings can show recommended, official, and community layouts from
the matching Steam game. Your own layouts and Steam's templates remain
available.

![Controller layouts for Warhammer 40,000: Space Marine](assets/decky-metadata-controller-layouts.png?cacheBuster=20260717)

## Updates and help

Use the Decky Metadata panel in the Quick Access Menu to check for updates and
view recent logs.

If you report a problem, include recent logs and the versions shown in the
**Versions** panel.

For manual sideload testing, the rolling
[`dev-build` prerelease](https://github.com/beallio/Decky-Metadata/releases/tag/dev-build)
contains a development ZIP. Its fixed tag is **not** an in-plugin updater
source. The updater's **Receive development releases** option instead finds
versioned `vX.Y.Z-dev.g<sha>` prereleases. Testing builds may be less stable.

## Development and documentation

- [Agent workflow](docs/runbooks/agent-workflow.md): current local checks,
  device inspection, and package delivery.
- [On-device verification](docs/runbooks/on-device-verification.md): required
  live checks and explicit deployment/launch permissions.
- [Compatibility behavior](docs/specs/compatibility-status.md): current
  precedence, scopes, persistence, and lifecycle rules.

Dated plans and session logs are historical records or research proposals,
not a current backlog by default. Read their status notices before acting.
Completed and superseded plans must not be launched again; their original
paths and [review records](docs/review/) are retained for audit references.

## License and credits

Decky Metadata is licensed under the [GNU General Public License v3.0 or later](LICENSE).

It is a fork of [Playhub Metadata](https://github.com/LoZazaMastro/Playhub-Metadata)
by ZazaMastro and started from the
[Decky Plugin Template](https://github.com/SteamDeckHomebrew/decky-plugin-template).
The game-menu integration is based on
[decky-steamgriddb](https://github.com/SteamGridDB/decky-steamgriddb) by the
SteamGridDB project.
