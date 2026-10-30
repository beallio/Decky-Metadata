# Changelog

All notable changes to this project are documented here in Keep a Changelog form, and this project adheres to Semantic Versioning.

## [Unreleased]

### Added

- **HowLongToBeat times.** Turn on **HLTB times** to see how long players take
  to finish a game, on the game's page, for Steam and non-Steam games. Steam
  games are matched by their Steam App ID, so a remaster or remake is not
  confused with the original. You can choose the HowLongToBeat game for a
  non-Steam game in its editor and hide the times for one game from its menu.
  It is off by default and cannot be turned on while HLTB for Deck is enabled.

### Changed

- **ProtonDB badges appear right after a restart.** Ratings are now saved, so
  badges show at once after Steam or the Deck restarts. Ratings older than a
  day still refresh in the background.

### Fixed

- Screenshots for games matched through IGN now appear the first time you open
  the game. Before, a background news check could stop them from loading until
  your next visit.

## [0.6.0] - 2026-10-25

Faster plugin, Steam match picker, and removed metadata stays removed

### Added

- **Pick a Steam match in the editor.** In a game's editor, search Steam and
  compare the results by artwork, developer, and release date. Select **Use
  this Steam match** to save one. Looking at results or selecting Cancel
  changes nothing, and Cancel returns you to the result you had selected.
- You can still type a Steam App ID or paste a Steam page link, and IGN search
  is still there. Choosing a Steam match does not rename the shortcut or
  replace your custom artwork.

### Changed

- **Faster plugin.** The part of the plugin that runs in the background was
  rewritten. Saving a game's details is much faster, also with large
  libraries. It works with the standard Decky Loader and with the beallio
  Loader fork. Your saved details, settings, and shortcut-name history stay in
  place.
- The plugin loads less data when it starts and when you open the Quick Access
  panel. A game's Steam news now loads when you open that game.
- Each game's details are now kept in their own file, in a `metadata` folder
  next to the settings file. The first start after the update moves your
  existing details there.
- **Going back to an older version:** use the plugin's built-in updater. It
  first copies your details back into the single settings file, so the older
  version still finds them. An older version that you install by hand from a
  ZIP file does not show your saved details.
- On the standard Decky Loader, the plugin gives back memory it used for large
  data transfers when it is idle.
- Updated the tools used to build and test the plugin, to fix reported security
  problems. These tools are not part of the installed plugin.

### Fixed

- **Removed metadata stays removed.** After **Remove metadata**, the plugin no
  longer matches that game again by itself. Before, the background news update
  could match the game's name to a Steam game about 15 minutes later, and the
  news came back. Opening the game no longer fetches IGN details for it, and
  **Refresh metadata** skips it. To match the game again, pick a Steam match or
  an IGN result in its editor, or use **Clear cache**. If you removed a game's
  metadata before this update, remove it once more after you update. Fix for
  [issue #3](https://github.com/beallio/Decky-Metadata/issues/3).
- If a game's news cannot load, its Activity tab keeps what it already showed.
- When you choose a different Steam match, the new store link and Steam name
  are kept.
- If the plugin cannot read its settings file, it no longer saves over that
  file, so your saved details are not lost.
- Screenshots that finish loading late no longer overwrite changes you made in
  the meantime.
- **View logs** now works even if the log file could not be set up when the
  plugin started.

## [0.5.4] - 2026-10-11

Add Home trailer previews and separate controls for each view

### Added

- Added muted trailer previews behind the selected game on Home. Home previews
  stay off until you enable them. Existing game-page trailer choices stay in place.
- Added hourly checks for game-data and plugin-update services. Repeated failures
  open one issue with error details; a successful check closes it. Manual checks
  do not change issues or failure counts.

### Changed

- Added separate Home and Detail switches and fade-in delays under one main
  trailer switch. Video quality remains shared.
- Grouped the trailer controls under larger, plain Detail view and Home view
  headings. The groups do not have separate expand or collapse actions.

## [0.5.3] - 2026-10-10

Fix game page freezes with Unifideck

### Fixed

- Fixed an issue where Steam game pages froze when Decky Metadata and Unifideck were used together. Fixes [#19](https://github.com/beallio/Decky-Metadata/issues/19).
- Metadata edits and refreshes continue to work, with or without Unifideck.

## [0.5.2] - 2026-10-09

Fix non-Steam cover flicker

### Fixed

- Non-Steam game covers no longer briefly show a broken-image icon when returning from a game page. Custom artwork and Game Info keep working. Fixes [#29](https://github.com/beallio/Decky-Metadata/issues/29), reported in [#18](https://github.com/beallio/Decky-Metadata/issues/18).

## [0.5.1] - 2026-10-07

Fix game descriptions, release dates, and duplicate Verified badges

### Fixed

- Game descriptions now use the source's short summary when available instead of page text and advertisements. Paragraphs and lists remain readable, and your custom descriptions are preserved.
- Steam imports now support both English release-date formats, fixing missing dates. For example, Dave the Diver now imports its full Steam release date of June 28, 2023.
- Dates saved in the editor no longer display one day early, and changing time zones does not shift the date. Clearing a date removes it from Game Info.
- Quickly leaving a game page no longer displays a duplicate Verified badge on its Library cover. Cached covers may require one Steam restart after updating to correct the display.
- Turning off trailers now stops background checks and restores the game artwork. Other causes of slow scrolling on the Home screen are still being investigated.

### Security

- Updated source-map-js to version 1.2.2 to resolve a security vulnerability in a development dependency.

### After updating

After updating, open Decky Metadata, go to Metadata, and select Clear cache under Metadata cache. This deletes all saved metadata, matches, and manual edits, and begins a new scan. Back up any changes you wish to keep before clearing the cache. Wait for the scan to complete. You can select Refresh metadata in the same section to scan again if needed.

Manual IGN imports still use IGN's listed date. For Dave the Diver, IGN lists its early-access date of October 27, 2022; selecting full-release dates from IGN is not included in this update.

## [0.5.0] - 2026-10-03

Add ProtonDB badges, mini achievements, and collapsible settings

### Added

- **ProtonDB badges.** Optional community ratings on Home and Library covers,
  game pages, and Steam Store pages. Each view has its own switch, with cover
  position and focus/hover controls. Select a game-page or Store badge to open
  its reports. Ratings are shared across views and cached for 24 hours; games
  without a match or tier stay hidden, and lookup errors are not Borked ratings.
- **Mini achievements.** A default-off setting restores Steam's small
  achievement progress bar beside Play Time. It uses Steam's own data and
  does not add achievement tracking to non-Steam games.
- **Collapsible Quick Access Menu sections.** Select a heading or press A to
  show its controls. Versions starts open; other sections start closed.
  Background update checks continue while Updates is closed.
- **Known plugin conflict guards.** Metadata pauses badges while ProtonDB
  Badges is active, trailers while TrailerHero is active, and mini achievements
  while Decky UI Restored is active. The panel names the peer. Detection checks
  plugin activity, not the peer's individual settings. Saved choices resume
  when the conflict clears unless you turn our switch off while paused.
  Residual TrailerHero players also prevent duplicate trailer playback.

### Changed

- Quick Access Menu headings have larger text and icons. Compatibility choices,
  version values, and help text are easier to read.
- Metadata cache and Delisted Steam games are grouped inside Metadata.
  Game counts no longer take controller focus.
- Sections no longer draw a divider after their final control; internal
  dividers and spacing make the tool groups clearer.
- The README gives a short product tour. Detailed help covers ProtonDB
  controls, matching, mini achievements, and plugin conflict behavior.

### Fixed

- Section headings stay in view when D-pad focus reaches them below expanded
  controls or long help notes. Dropdown cancellation and return preserve focus.
- Trailers keep a stable height when a game page opens or closes with a visible
  save-status bar, including after a theme is turned off and on. Taller
  full-width bars get more trailer space; hidden, compact, or moved indicators
  do not add extra space. Steam's normal page animation still plays.
- ProtonDB badges stay with their native covers and controls during page
  animations and remain available on Library tabs, including Non-Steam.
- Non-Steam badges prefer a valid saved Metadata Steam App ID, then a title
  lookup. Correcting or clearing the match updates visible badges without
  retaining the previous game's rating.
- Project skill installation checks the destination repository correctly when
  invoked from a Git hook, without bypassing external-worktree protection.


## [0.4.0] - 2026-09-28

Add opt-in game trailer streaming with Steam-first playback and an IGN fallback.

### Added

- **Game trailers.** Enable game trailers in the Quick Access Menu. Existing
  installs stay disabled until you opt in. Steam movies take priority; when
  Steam has no playable movie, a clearly matched IGN game trailer can play.
  Non-Steam shortcuts can use IGN even without a saved Steam match. The
  original hero stays visible until a playable trailer is ready and remains
  in place when neither source has a suitable movie. Set audio and Auto,
  720p, 1080p, 1440p, or 2160p quality in the new section. Trailers stream;
  they are not saved offline. Uninstall the separate TrailerHero Decky plugin
  before enabling this feature.
- **Trailer fade-in delay.** Set the wait before a ready trailer replaces the
  artwork from 0 to 10 seconds. Existing installs keep the three-second default.
- **Optional trailer logo.** A new setting hides the game logo only while a
  trailer is visible. It is off by default and restores the logo when playback
  stops, fails, or the game page changes.
- **Expanded trailer view.** Press Y while a trailer is visible to hide the
  game page controls and enlarge the video without restarting it. Press Y or B
  to return. Steam's footer shows the action, and the page returns when
  playback stops or you leave the game.
- **IGN trailer health.** An hourly check alerts maintainers with one open
  issue if game lookup, trailer selection, or MP4 delivery stops working.

### Fixed

- Trailer audio now stays silent behind the hero artwork and fades in with the
  video when it appears, instead of playing before the video is visible.
- Artwork and trailers now show through transparent save-status bars on game
  pages. The bar stays in place, and the artwork returns to its usual size
  when the bar is gone.
- Game trailer quality changes now return D-pad focus after the Steam menu
  closes, including while a trailer is playing. Trailers paused during SteamOS
  sleep resume in place, even when sleep interrupts the initial artwork delay.
  If playback cannot resume, Metadata restores the original artwork without
  repeated retries.
- The trailer audio X hint appears when Steam's footer loads after playback
  starts and returns if Steam redraws the footer.
- Non-Steam games with saved metadata now load their running-game Steam Menu
  icon even when Game Info requests it before Steam has cached the image. Closes
  [issue #15](https://github.com/beallio/Decky-Metadata/issues/15).

## [0.3.14] - 2026-09-20

Add configurable compatibility defaults for non-Steam games

### Added

- **Library-wide compatibility defaults.** Choose Automatic, Verified,
  Playable, Unsupported, or Unknown in the Decky Metadata panel. The setting
  applies to existing and new non-Steam shortcuts, including ones without
  saved metadata. Other shortcuts update immediately; the current Game Info
  game updates after its tab exits. Per-game choices now include **Use global
  default** and **Follow Valve**. Fixes [issue #12](https://github.com/beallio/Decky-Metadata/issues/12).
- **Compatibility default scopes.** The **Apply default to** dropdown selects
  Steam-matched games, saved games without a Steam ID, all saved metadata, or
  all native non-Steam games. It uses the saved record and valid Steam ID, so
  manual records are in the no-ID scope and a provider name does not decide
  eligibility. The saved selection stays available after Automatic is chosen.

### Fixed

- Place the compatibility scope separator below its explanation, directly above
  **Refresh metadata**.

### Security

- Update test and CI tooling so mock redirects stay inside allowed file-system
  paths, uv downloads use verified checksums, and installs use safer defaults.

## [0.3.13] - 2026-09-07

Add Steam shortcut names and fix stale Activity news

### Added

- **Use Steam's name for a non-Steam shortcut.** The per-game **Decky metadata...** editor shows the current shortcut name beside the official Steam name for its saved match. Select **Use Steam name** to preview and confirm the change. Names never change automatically.
- **Restore the original shortcut name.** After a confirmed rename, use **Restore original name** to return to the saved original. If another tool changes the name, the editor reports the conflict instead of overwriting it.

### Fixed

- **Activity news clears when metadata is removed.** **Remove metadata → Save → Done** now removes that shortcut's injected news without a SteamUI reload or plugin uninstall. Other games' Activity remains unchanged. Fix for [issue #3](https://github.com/beallio/Decky-Metadata/issues/3).
- **Controller access to shortcut names.** The name/status section is selectable with the D-pad even when no rename action is available. It scrolls fully into view and uses the editor's background with an outline for controller focus.
- **Steam title matching.** Page-title matching now ignores trademark, registered, and copyright marks consistently, so those symbols do not prevent a saved match from being recognized.

### Shortcut-name controls

![Current and Steam shortcut names with the Use Steam name action](https://raw.githubusercontent.com/beallio/Decky-Metadata/v0.3.13/assets/decky-metadata-shortcut-name.png)

## [0.3.12] - 2026-09-04

Fix stable installs from local builds and marker-word title matching

### Fixed

- A local `X.Y.Z+<hash>` build now recognizes and can install the canonical stable `X.Y.Z` release, while development prereleases remain manual-only.
- Games whose titles are made up of words like `Prototype` or `Test` now match their Steam store entry, so they receive Steam details, news, compatibility, and quick links.

## [0.3.11] - 2026-09-01

Compatibility badges remain visible after plugin or SteamUI reload without selecting each game.

### Fixed

- Non-Steam Playable, Verified, and Unsupported badges now refresh on already-mounted Library Home and grid cards after a plugin or SteamUI reload.
- Home compatibility badges now recover when cards mount after a Steam JavaScript-context restart.

## [0.3.10] - 2026-08-30

Compatibility badges now load automatically

### Fixed

- Non-Steam compatibility badges now appear as soon as saved metadata loads and remain correct after plugin or SteamUI reloads; selecting each game is no longer required.

## [0.3.9] - 2026-08-28

Set the compatibility status for non-Steam games

### Added

- The **Decky metadata...** editor now lets you choose Automatic, Verified,
  Playable, Unsupported, or Unknown for non-Steam games.

## [0.3.8] - 2026-08-27

SteamGridDB artwork now works with matched non-Steam games

### Fixed

- Matched non-Steam shortcuts now keep their SteamGridDB artwork and Library Home icons while Decky Metadata enriches Game Info pages ([#5](https://github.com/beallio/Decky-Metadata/issues/5)).

## [0.3.7] - 2026-08-27

Community controller layouts now work correctly on Legion Go S

### Fixed

- Matched non-Steam games on Legion Go S now show compatible Community layouts instead of appearing empty, while Steam's normal visible controller filter remains intact.
- Choosing Show All Layouts now keeps you on the controller-layout tab you were viewing instead of jumping back to Your Layouts.

### Added

- The Quick Access Menu Versions panel now shows the connected controller type, making device-specific layout behavior easier to understand and troubleshoot.

## [0.3.6] - 2026-08-07

Controller Settings → Search now shows only the layouts belonging to the game you are configuring.

### Fixed

- Controller Settings → Search on a non-Steam game lists that game's layouts and
  its matched Steam game's layouts, and nothing else. Previously the layouts of
  any other game whose Controller Settings you had opened during the session —
  including ordinary Steam games — kept appearing on every game you visited
  afterwards.
- Controller Settings → Search on a regular Steam game no longer lists layouts
  belonging to your non-Steam games. Steam's own cross-game search results for
  Steam titles are unchanged.
- The Search filter now takes the app being configured from Steam's controller
  configurator rather than inferring it from the previous request, so it can no
  longer act on a stale game after switching pages.

## [0.3.5] - 2026-07-25

Maintenance release: CI build-toolchain action updates.

- No on-device/plugin behavior changes in this release.

### Changed

- CI: the quality-gates workflow now uses `actions/setup-python@v7` and
  `astral-sh/setup-uv@v9.0.0`. Both actions run only on the build runner and
  are never part of the packaged plugin, so installed plugins are unaffected.

## [0.3.4] - 2026-07-24

Maintenance release: store listing image and build-toolchain dependency patches.

- No on-device/plugin behavior changes in this release.

### Changed

- The plugin's store listing image no longer points at the plugin template's
  placeholder, which rendered a GitHub repository card for an unrelated
  project. It now shows Decky Metadata's own Steam Community controller
  layouts screenshot.

### Security

- Patched four high-severity advisories in transitive build dependencies
  (`brace-expansion`, `fast-uri`), plus `postcss`, via a lockfile-only update.
  All are devDependencies of the rollup/vitest toolchain and are never part of
  the packaged plugin, so no installed plugin was ever exposed.

## [0.3.3] - 2026-07-21

Bug fixes for the library context menu and the metadata editor's description field.

### Fixed

- Library context menu: opening "Decky metadata..." for one non-Steam game and
  then another no longer shows the first game's metadata for every subsequent
  game; each entry now opens the game whose menu is actually open.
- Metadata editor: the multiline Description field now accepts on-screen
  keyboard input on the Deck. It previously took focus but could not be typed
  into, because Steam only routes the virtual keyboard to its own field
  components; the editor now uses Steam's gamepad-aware text area.

## [0.3.2] - 2026-07-18

Maintenance release: release-notes tooling and CI hardening.

- No on-device/plugin behavior changes in this release.
- Release-notes gate: every stable and dev release now requires curated,
  dated `CHANGELOG.md` notes, enforced by `scripts/changelog.py` in CI and
  `scripts/release.sh`, with the release title drawn from the section summary.
- Deterministic `scripts/changelog.py rollover` command for cutting a version.
- New `decky-release-notes` maintainer skill that drafts the notes and performs
  an authorized local release cut; installer now selects among project skills.
- CI: added Dependabot for GitHub Actions and moved maintained actions off Node 20.
- Docs: on-device install / self-update runbook; plugin description now mentions
  Steam community controller layouts.

## [0.3.1] - 2026-07-17

Added trusted self-update discovery, installation handoff, and QAM controls.

## [0.3.0] - 2026-07-17

Refined the editor and QAM while adding stable and development release tooling.

## [0.2.0] - 2026-07-14

Added matched-game controller layouts with isolated Steam search state.

## [0.1.0] - 2026-07-13

Established the SteamOS-native metadata, diagnostics, and packaging foundation.
