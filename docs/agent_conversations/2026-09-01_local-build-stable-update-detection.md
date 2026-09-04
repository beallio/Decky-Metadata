# Local build stable-update detection

Date: 2026-09-01

## Objective

Merge Dependabot PR #9 into `dev`, then fix the updater so a local `X.Y.Z+<hash>` build can move to the published stable `X.Y.Z` release.

## Changes

- Retargeted PR #9 from `main` to `dev`, reviewed its lockfile-only fast-uri update, merged it, and verified its GitHub workflows.
- Updated stable candidate selection to recognize a canonical same-base stable release when the installed version has build metadata.
- Allowed the QAM panel to install stable candidates from local builds while keeping development candidates manual-only.
- Added backend and frontend regression coverage for same-base stable handoff, newer and older stable releases, canonical stable no-op, and development-channel blocking.
- Updated the on-device updater runbook and unreleased changelog notes.
- Regenerated `dist/index.js` and its source map.

## Design decisions

- SemVer comparison still ignores build metadata. The exception is limited to candidate selection when the candidate is canonical stable and the installed version has build metadata.
- Local builds cannot install development prereleases. This prevents CI builds from replacing the build under test.
- A lower stable release is not offered as an automatic handoff.

## Validation

- Focused frontend updater tests: 6 passed.
- Focused backend updater tests: 7 passed.
- Project quality gate through `scripts/decky verify-change HEAD --explain`: 26 Vitest files and 390 tests passed; pytest passed; build and static checks passed.
- Steam Deck end-to-end check:
  - Installed local `0.3.11+ad592d5` through Decky Loader's ZIP installer.
  - The QAM panel showed `Move to Stable v0.3.11`.
  - Approved Decky's update prompt.
  - `scripts/decky capture` reported installed version `0.3.11` without build metadata in `/tmp/Decky-Metadata/diagnostics/20260902T043804Z/doctor.json`.
