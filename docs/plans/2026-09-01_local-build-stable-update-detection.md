# Local Build Stable Update Detection

## Problem Definition

A local package uses `X.Y.Z+<hash>`. The updater correctly ignores build metadata for SemVer precedence, so a published stable `X.Y.Z` compares equal and is not selected. The QAM panel also blocks every local build from invoking Decky's installer. As a result, an installed local `0.3.11+<hash>` build cannot move to the published stable `0.3.11` release.

The updater must allow a local build to move to a canonical stable release at the same or a newer base version. It must continue to reject development prereleases, other local builds, and lower stable versions.

## Architecture Overview

Keep `ParsedPluginVersion` ordering unchanged because SemVer build metadata must remain outside precedence. Add a narrow candidate-selection exception in `select_candidate`: when the installed version has build metadata and the best candidate is a canonical stable release without build metadata at the same base version, return it with the existing `move_to_stable` action.

The existing greater-version path continues to select a newer stable release. Update the QAM install gate so a local build may invoke Decky's installer only when the selected candidate is stable. Development candidates remain manual-only for local builds.

## Public Interfaces and Data Shapes

No RPC or persisted-data shape changes are required.

Existing values remain in use:

- Installed local version: `X.Y.Z+<build>`
- Canonical stable candidate: `X.Y.Z` without prerelease or build metadata
- Candidate channel: `stable`
- Same-base action: `move_to_stable`
- Newer-base action: `update`

## Dependency Requirements

No new frontend or backend dependency is required. The change uses the existing version parser, candidate action type, Decky installer path, and updater UI.

## Validation Strategy

- Add backend tests for same-base local-to-stable selection, newer stable selection, canonical stable no-op, and lower stable rejection.
- Add frontend tests that allow stable installation from a local build and continue to block a development candidate.
- Run the focused updater tests and the project quality gate.
- Build and install a full local `0.3.11+<hash>` validation package on the Deck because backend code changes require full-package installation.
- Force a stable-channel update check and verify that `v0.3.11` is offered as `Move to Stable` and can be installed.
- Confirm the installed manifest becomes the canonical stable `0.3.11` package after handoff.
