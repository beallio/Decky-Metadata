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

In the Decky Metadata Quick Access Menu, use **Default compatibility status**
to set a live default for selected existing and new non-Steam shortcuts:

1. **Automatic — use matched Steam status**
2. **Verified**
3. **Playable**
4. **Unsupported**
5. **Unknown**

Automatic is the initial setting. It uses the matched Steam category when one
is available; otherwise it leaves the shortcut's original Steam status alone.
The default changes existing cards as well as new shortcuts. It does not create
metadata records or use ProtonDB.

Use **Apply default to** to select the default scope:

1. **Steam-matched games**: saved records with a valid Steam App ID.
2. **Saved games without a Steam ID**: saved manual or provider records without
   a valid Steam App ID.
3. **All games with saved metadata**: every saved record.
4. **All non-Steam games**: every native non-Steam shortcut, including one
   without saved metadata.

The scope uses the saved record and Steam App ID. It does not use the metadata
provider or current store availability. A no-record shortcut belongs only to
**All non-Steam games**. Per-game choices are unaffected. The scope selector is
unavailable while the default is Automatic, but it keeps its saved selection.
On upgrade, the old toggle's On value becomes **All games with saved metadata**;
Off becomes **All non-Steam games**.

Saving a default saves it immediately. Other eligible shortcuts update at once.
If the current game's **Game Info** tab is open, that game's current status and
rich Game Info stay in place until you leave the tab. Closing QAM or cancelling
a context menu does not count as leaving. Switch to another tab, page, or game,
or choose **Decky metadata...** to open the editor. The editor is an exit; a
later editor Save uses its latest per-game choice.

For one game, open **Decky metadata...** and use **Compatibility status**:

1. **Use global default**
2. **Follow Valve**
3. **Verified**
4. **Playable**
5. **Unsupported**
6. **Unknown**

Per-game choices take priority. **Follow Valve** ignores the global default and
uses only the current matched Steam category; with no category, it restores or
keeps the original Steam status. A fixed per-game category always wins.
**Unknown** is a real Valve category, but Steam shows it with no compatibility
badge. These choices are user-selected labels, not Valve certification or a
claim about emulator performance.

| Situation | Result |
| --- | --- |
| Global Verified, a game inside the selected scope using the default | Verified |
| Follow Valve with Valve Playable | Playable |
| Follow Valve with missing Valve data | Original Steam status |
| Follow Valve with Valve Unknown | Unknown, with no badge |
| Global Automatic | Matched category, or original Steam status if unavailable |
| Changing the global default | Only inheriting games inside the selected scope take the new default |
| Current Game Info tab during a default change | Keeps its current value until you leave; other games update now |
| Steam-matched scope, shortcut with no saved metadata | Original Steam status |
| Game outside the selected scope | Per-game choice, otherwise Valve category or original Steam status |

See the full [compatibility-status behavior reference](docs/specs/compatibility-status.md)
for upgrade, persistence, and lifecycle details.

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
