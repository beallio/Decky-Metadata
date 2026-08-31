# Changelog

All notable changes to this project are documented here in Keep a Changelog form, and this project adheres to Semantic Versioning.

## [Unreleased]

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
