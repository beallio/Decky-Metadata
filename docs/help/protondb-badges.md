# Show ProtonDB ratings

ProtonDB collects community reports about how games run with Proton, the software Steam uses to run Windows games on Linux. Decky Metadata can show a game's ProtonDB tier on covers, game pages, and Store pages.

These ratings are separate from Valve's Steam Deck compatibility labels. Neither a community tier nor a label you choose guarantees that your copy will run well.

## Turn on badges

1. Open the Quick Access Menu, select **Decky**, then open **Decky Metadata**.
2. Select **ProtonDB badges**, or press **A** on its heading.
3. Turn on **Enable ProtonDB badges**. The feature is off by default.
4. Choose the views where you want badges to appear.

Closing the section or Quick Access Menu does not turn badges off. Turning the main switch off keeps your choices for each view.

![Community rating icons on Library covers](../../assets/decky-metadata-protondb-badges.png?cacheBuster=20261003)

## Choose where badges appear

| Setting | Where the rating appears |
| --- | --- |
| **Home game covers** | On game covers in Home. |
| **Library game covers** | On game covers in the Library, including the Non-Steam tab. |
| **Game view** | As a Steam-styled button before the controller button on the game's details page. |
| **Store** | As a colored icon at the bottom right of the Steam Store page. |

The four switches are independent. For example, you can keep game-page ratings on while hiding cover badges.

**Cover badge position** offers **Bottom left**, **Top left**, and **Top right**. **Covers only on focus or hover** limits Home and Library badges to the cover selected with your controller or under the pointer. It does not limit game-page or Store badges.

Cover badges are not separate controller buttons. They do not change how you select or launch a game. Select the game-page button or Store icon to open that game's ProtonDB page and read its reports.

## Match a non-Steam game

Steam games use their own Steam App IDs. A non-Steam game uses a valid saved Metadata Steam App ID first. Without one, Metadata can look up the shortcut's name. A name can match the wrong edition or a different game with a similar title.

To choose the intended game:

1. Open the non-Steam game's menu and select **Decky metadata...**.
2. Enter the correct Steam App ID or paste the game's Steam Store URL.
3. Select **Apply Steam App ID**. This saves the match.

Changing or clearing a saved match updates badges that are already on screen. Clearing the ID allows name lookup again; it does not necessarily remove every badge. Use the view switches if you do not want badges on a particular surface. See [matching and editing games](editing-games.md#add-or-correct-a-steam-match).

## Read a rating

The tier names are **Platinum**, **Gold**, **Silver**, **Bronze**, and **Borked**. They summarize community reports, not Valve certification, emulator performance, or a new test of your own installation. Open the ProtonDB page for details about game versions, settings, and reported problems.

A game without a match or a ProtonDB tier has no badge. A failed network request is not treated as a Borked rating.

Ratings are reused across the different views and cached for 24 hours. An expired rating can refresh while the game is visible. A first lookup may take time. Cached badges stay with their covers or controls during Steam's page animations.

## Enable Store badges

Store badges need Steam's remote browser debugging to be enabled:

1. Open Decky Loader settings and select **Developer**.
2. Turn on **Allow Remote CEF Debugging**.
3. Return to the Store page and allow the badge to load.

CEF is Steam's built-in browser. This debugging setting allows unauthenticated browser access from other devices on your network, so use it only on a trusted network. Follow any reload prompt from Decky; finish a running game before restarting Steam.

## Use one badge plugin

When **ProtonDB Badges** is enabled in Decky Loader, Metadata pauses its own badges. The **ProtonDB badges** section names the conflict. Detection checks whether that plugin is active, not its individual feature settings.

Disable or remove ProtonDB Badges in Decky Loader to use Metadata's badges. Hiding it or freezing its updates does not disable it.

If Metadata's switch was on, your saved choice stays on while the badges are paused. They resume when the other plugin is disabled or removed. You can turn Metadata's switch off while paused to prevent that automatic resume. Once it is off, you cannot turn it back on until the conflict clears.

Only badges are paused. Metadata's other features remain available. If plugin detection is unavailable, the section shows a warning instead of assuming there is a conflict; check manually that only one badge plugin is enabled.

## If a badge is missing or wrong

- Check **Enable ProtonDB badges** and the switch for the view you are using.
- With **Covers only on focus or hover** on, select or hover the cover.
- Read any conflict or settings error in the **ProtonDB badges** section.
- For a non-Steam game, check the saved Steam match and edition. Correct it with **Apply Steam App ID** if needed.
- For a Store page, check **Allow Remote CEF Debugging**.
- Allow time for the first name or rating lookup, and check that the Deck is online.
- A game can have no tier even when the match is correct. Open ProtonDB to check its reports.

Do not clear the Metadata cache just to refresh a rating: **Clear cache** removes saved matches and metadata. See [updates and troubleshooting](updates-and-troubleshooting.md) for logs and useful information to include in a report.

[Help home](README.md)
