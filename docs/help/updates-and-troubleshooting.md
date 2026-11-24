# Updates and troubleshooting

Open Decky Metadata from the Quick Access Menu, then select the gear. Open **Updates** or **Logs** in Settings.

## Check for updates

In **Updates**, select **Check now** to check immediately. **Automatically check for updates** controls background checks while the plugin is loaded. The **Status** field shows the result and, when available, when the check was last made.

By default, the updater checks stable releases. Turn on **Receive development releases** to include prereleases intended for testing. Testing builds may contain regressions. A local build whose installed version includes a `+` can use the updater only to move to a stable release; install a development release manually instead.

**Installed Version** always shows the version that is running now. When you select **Install**, Decky Loader asks you to confirm the update in its own window. The new version is installed only after you confirm, and Decky Loader then reloads the plugin. Until then, the update stays offered. If you closed Decky Loader's window, or nothing happened, select **Install** again.

If the updater cannot install a candidate in your Decky environment, open **View Release Notes** and install the release ZIP manually. For the stable release, download `Decky-Metadata.zip` from the [latest release](https://github.com/beallio/Decky-Metadata/releases/latest), then use Decky's **Developer** settings and **Install Plugin from ZIP File** to choose the ZIP with **Browse** and select **Install**. Do not unzip it. The [README installation steps](../../README.md#install) show the full path through Decky.

Version 0.6.0 changed how the plugin saves your game details. When you go back to a version older than 0.6.0 with the plugin's updater, it first saves your game details in a form that the older version can read. A version older than 0.6.0 that you install by hand from a ZIP file does not show your saved details. Older versions from 0.6.0 onward read your details normally.

### Development ZIPs are not the same updater channel

The rolling [`dev-build` prerelease](https://github.com/beallio/Decky-Metadata/releases/tag/dev-build) provides a development ZIP for manual sideload testing. That fixed tag is not an in-plugin updater source. **Receive development releases** instead includes versioned development prereleases (`vX.Y.Z-dev.g<sha>`). Both are testing builds and may be less stable than a stable release. The updater may not automatically install a development release over a local `+` build.

## Mini achievements

1. Open Decky Metadata from the Quick Access Menu, then select the gear.
2. Open the **Mini achievements** tab in Settings.
3. Turn on **Enable mini achievements**, then open a Steam game that has
   recorded achievement progress.

The setting is off by default and stays saved when you close Settings or
reload the plugin. Turning it off hides the row at once, without a restart.

With the setting on, Steam's own ACHIEVEMENTS row shows beside Play Time on a
game's page. It shows the earned/total count (for example 80/179) and a small
progress bar. It uses Steam's own data, look, and behavior. Touch or select it
with a mouse to open the game's My Achievements page. Like Steam's own row, the
D-pad does not stop on it.

![Brotato's native achievement progress beside Play Time](../../assets/decky-metadata-mini-achievements.png?cacheBuster=20261113)

When **Decky UI Restored** is enabled in Decky Loader, Metadata pauses its mini
achievements. The panel names the conflict. Detection checks the whole plugin,
not its individual feature settings, so turning off only the peer's mini
achievements is not enough.

Disable or remove Decky UI Restored to show the row. Hiding the peer
or freezing its updates does not disable it. If your switch was on, it remains
on as your saved choice while the row is hidden. It returns when the conflict
clears.

You can turn Metadata's switch off while paused if you do not want it to resume.
Once it is off, you cannot turn it back on until the peer is disabled or removed.

If a setting cannot load or save, its tab shows an error. A failed save
keeps the previous setting active. Reload the plugin to retry a failed load.

### Why don't I see it?

Steam decides when to show the row. It stays hidden in these cases:

- The game has no Steam achievements.
- The game is not installed and has no earned achievements.
- Family View or parental controls block achievements.
- The right panel is narrow.
- The stats row is full, for example **Install** with **Space Required** or an
  update status. Steam moves the row to a second line that stays hidden.
- The game is a non-Steam shortcut and no other plugin, such as
  Emuchievements, gives Steam its achievements.
- **Enable mini achievements** is off.
- Decky UI Restored is enabled in Decky Loader.

Check the game's achievements in Steam, confirm the setting is on, and confirm
Decky UI Restored is disabled in Decky Loader.

## Other plugin conflicts

Metadata also pauses ProtonDB badges while **ProtonDB Badges** is enabled and
game trailers while **TrailerHero** is enabled. Only the overlapping feature is
paused. The saved-choice and opt-out behavior described above applies to these
features too. See [ProtonDB ratings](protondb-badges.md) and
[game trailers](game-trailers.md#streaming-and-trailerhero).

If Metadata cannot check Loader's plugin list, the affected tab shows a
warning instead of assuming there is a conflict. Check manually that only one
plugin supplies that feature.

## Share useful troubleshooting information

In **Logs**, select **View Logs** to see recent plugin logs. Turn on **Debug Logging** to enable more verbose troubleshooting logs, reproduce the issue, then include the logs with your report. Turn it off when you no longer need verbose logging. Decky Loader's own debug setting also records the plugin's debug messages, even while **Debug Logging** is off.

Include the values shown in **Versions** as well: Decky Metadata, Decky, and SteamOS. If an update check fails, include the message shown in **Status** and any retry time shown with it. The status may say **Check interrupted** or **Failed to check**; if a retry time is displayed, wait until then before trying again.

For a problem with missing Community posts or news, see [Community posts and news](community-and-news.md). For missing matched-game layouts, see [Controller layouts](controller-layouts.md).
