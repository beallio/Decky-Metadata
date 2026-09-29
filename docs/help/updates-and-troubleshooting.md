# Updates and troubleshooting

Open Decky Metadata from the Quick Access Menu. Select **Updates** or **Logs** to open its controls; **Versions** starts open.

## Check for updates

In **Updates**, select **Check now** to check immediately. **Automatically check for updates** controls background checks while the plugin is loaded. The **Status** field shows the result and, when available, when the check was last made.

By default, the updater checks stable releases. Turn on **Receive development releases** to include prereleases intended for testing. Testing builds may contain regressions. A local build whose installed version includes a `+` can use the updater only to move to a stable release; install a development release manually instead.

If the updater cannot install a candidate in your Decky environment, open **View Release Notes** and install the release ZIP manually. For the stable release, download `Decky-Metadata.zip` from the [latest release](https://github.com/beallio/Decky-Metadata/releases/latest), then use Decky's **Developer** settings and **Install Plugin from ZIP File** to choose the ZIP with **Browse** and select **Install**. Do not unzip it. The [README installation steps](../../README.md#install) show the full path through Decky.

### Development ZIPs are not the same updater channel

The rolling [`dev-build` prerelease](https://github.com/beallio/Decky-Metadata/releases/tag/dev-build) provides a development ZIP for manual sideload testing. That fixed tag is not an in-plugin updater source. **Receive development releases** instead includes versioned development prereleases (`vX.Y.Z-dev.g<sha>`). Both are testing builds and may be less stable than a stable release. The updater may not automatically install a development release over a local `+` build.

## Share useful troubleshooting information

In **Logs**, select **View Logs** to see recent plugin logs. Turn on **Debug Logging** to enable more verbose troubleshooting logs, reproduce the issue, then include the logs with your report. Turn it off when you no longer need verbose logging.

Include the values shown in **Versions** as well: Decky Metadata, Decky, and SteamOS. If an update check fails, include the message shown in **Status** and any retry time shown with it. The status may say **Check interrupted** or **Failed to check**; if a retry time is displayed, wait until then before trying again.

For a problem with missing Community posts or news, see [Community posts and news](community-and-news.md). For missing matched-game layouts, see [Controller layouts](controller-layouts.md).
