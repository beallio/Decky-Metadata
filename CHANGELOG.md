# Changelog

All notable changes to this project are documented here in Keep a Changelog form, and this project adheres to Semantic Versioning.

## [Unreleased]

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
