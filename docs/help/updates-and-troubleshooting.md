# Updates and troubleshooting

Open Decky Metadata from the Quick Access Menu. Select **Updates** or **Logs** to open its controls; **Versions** starts open.

## Check for updates

In **Updates**, select **Check now** to check immediately. **Automatically check for updates** controls background checks while the plugin is loaded. The **Status** field shows the result and, when available, when the check was last made.

By default, the updater checks stable releases. Turn on **Receive development releases** to include prereleases intended for testing. Testing builds may contain regressions. A local build whose installed version includes a `+` can use the updater only to move to a stable release; install a development release manually instead.

If the updater cannot install a candidate in your Decky environment, open **View Release Notes** and install the release ZIP manually. For the stable release, download `Decky-Metadata.zip` from the [latest release](https://github.com/beallio/Decky-Metadata/releases/latest), then use Decky's **Developer** settings and **Install Plugin from ZIP File** to choose the ZIP with **Browse** and select **Install**. Do not unzip it. The [README installation steps](../../README.md#install) show the full path through Decky.

### Development ZIPs are not the same updater channel

The rolling [`dev-build` prerelease](https://github.com/beallio/Decky-Metadata/releases/tag/dev-build) provides a development ZIP for manual sideload testing. That fixed tag is not an in-plugin updater source. **Receive development releases** instead includes versioned development prereleases (`vX.Y.Z-dev.g<sha>`). Both are testing builds and may be less stable than a stable release. The updater may not automatically install a development release over a local `+` build.

## Mini achievements

1. Open the Quick Access Menu, select **Decky**, then open **Decky Metadata**.
2. Select **Mini achievements** or press **A** on its heading.
3. Turn on **Enable mini achievements**, then open a Steam game that has
   recorded achievement progress.

The setting is off by default and stays saved when you close the panel or
reload the plugin. Turning it off restores Steam's normal display. Closing
the section or Quick Access Menu does not turn the feature off.

This brings back Steam's small achievement progress bar beside Play Time on
game details pages. It uses Steam's existing data. Matching a non-Steam game
does not add achievement tracking to that game.

![Brotato's native achievement progress beside Play Time](../../assets/decky-metadata-mini-achievements.png?cacheBuster=20261003)

When **Decky UI Restored** is enabled in Decky Loader, Metadata pauses its mini
achievements. The panel names the conflict. Detection checks the whole plugin,
not its individual feature settings, so turning off only the peer's mini
achievements is not enough.

Disable or remove Decky UI Restored to use Metadata's display. Hiding the peer
or freezing its updates does not disable it. If your switch was on, it remains
on as your saved choice while the display is paused. It resumes when the
conflict clears.

You can turn Metadata's switch off while paused if you do not want it to resume.
Once it is off, you cannot turn it back on until the peer is disabled or removed.

If a setting cannot load or save, the section shows an error. A failed save
keeps the previous setting active. Reload the plugin to retry a failed load.
If the bar is missing, check the game's achievement progress in Steam, confirm
Metadata's switch is on, and check that Decky UI Restored is disabled in Decky
Loader. Games without Steam achievement data do not get a progress bar.

## Other plugin conflicts

Metadata also pauses ProtonDB badges while **ProtonDB Badges** is enabled and
game trailers while **TrailerHero** is enabled. Only the overlapping feature is
paused. The saved-choice and opt-out behavior described above applies to these
features too. See [ProtonDB ratings](protondb-badges.md) and
[game trailers](game-trailers.md#streaming-and-trailerhero).

If Metadata cannot check Loader's plugin list, the affected section shows a
warning instead of assuming there is a conflict. Check manually that only one
plugin supplies that feature.

## Share useful troubleshooting information

In **Logs**, select **View Logs** to see recent plugin logs. Turn on **Debug Logging** to enable more verbose troubleshooting logs, reproduce the issue, then include the logs with your report. Turn it off when you no longer need verbose logging.

Include the values shown in **Versions** as well: Decky Metadata, Decky, and SteamOS. If an update check fails, include the message shown in **Status** and any retry time shown with it. The status may say **Check interrupted** or **Failed to check**; if a retry time is displayed, wait until then before trying again.

For a problem with missing Community posts or news, see [Community posts and news](community-and-news.md). For missing matched-game layouts, see [Controller layouts](controller-layouts.md).
