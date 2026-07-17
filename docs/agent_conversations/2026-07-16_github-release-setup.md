# GitHub release setup implementation

**Date:** 2026-07-16  
**Branch:** `feat/github-release-setup`  
**Objective:** Prepare Decky Metadata for private GitHub publication, automated
CI, stable and development release channels, and reproducible repository-hosted
screenshots without changing plugin runtime behavior.

## Implementation

- Added `.github/workflows/ci.yml` for pull requests and pushes to `dev`/`main`.
  It uses a full tag checkout, Node 22, Python, and uv; mirrors the local
  TypeScript/build/Vitest/Python/Pytest/version-drift gate; and verifies that
  `dist/index.js` remains current. It contains no Deck/device operations.
- Added `.github/workflows/release.yml` with one shared build/package job:
  stable `vX.Y.Z` tags produce a hash-free non-prerelease asset, while `dev`
  pushes and manual dispatches update one serialized rolling prerelease with a
  commit-hashed package.
- Added guarded `scripts/release.sh X.Y.Z`. It requires a valid version, clean
  tree, unused tag, clean `main`, and a passing full gate before creating the
  local release commit, annotated tag, and hash-free package. It never pushes;
  it prints the human-run `main` and tag pushes plus the next-patch reminder.
- Added a stdlib `Page.captureScreenshot` command to `scripts/deck/cdp.py` and a
  `/tmp/Decky-Metadata`-restricted `scripts/deck/screenshot.sh` wrapper. The
  default is the visual `Steam Big Picture Mode` page, with explicit visual
  overlay targets supported for QAM capture.
- Replaced external `user-attachments` image URLs with stable relative paths,
  documented Releases installation and the dev testing channel, added badges,
  contributor/community files, and updated the agent and on-device runbooks.
- Added focused tests for screenshot payload decoding, committed README assets,
  removal of external attachment URLs, and package/plugin version agreement.
  Intentional red runs are preserved under `/tmp/Decky-Metadata/` as
  `github-release-setup-cdp-red.log` and `github-release-setup-assets-red.log`.

No file under `src/`, `main.py`, `backend/`, or `dist/index.js` changed.
The base version remains `0.3.0`; `*.zip` remains ignored.

## Live screenshot evidence

The Deck passed `scripts/decky doctor --deck`, the bounded
`scripts/deck/wait_online.sh` SSH check, deployment, hard reload, and CDP
readiness. Each candidate was inspected visually before copying from
`/tmp/Decky-Metadata/screenshots` into `assets/`:

- `assets/decky-metadata-qam.png` — live Decky Metadata QAM counts and controls;
  source SHA-256 `4d6e67ee784dbbfc8e99f46d938988cd0791e8b0dd6779975845044447317368`.
- `assets/decky-metadata-editor.png` — populated X-Men Origins Wolverine editor;
  source SHA-256 `999b6da2552370f1897a0ab2cd530370f2d596c2244c81e6cfce607a185a9e93`.
- `assets/decky-metadata-activity-news.png` — native Space Marine Activity feed
  showing dated injected news and artwork; source SHA-256
  `0e690e587b11f3af9ec934410ac7765bc942257a139de62af80c0d8dcad3516d`.

## GitHub result

`gh auth status` confirmed account `beallio`. The repository was created as
`beallio/Decky-Metadata`, visibility `PRIVATE`, with SSH origin
`git@github.com:beallio/Decky-Metadata.git` and default branch `main`.

Only these refs were pushed during implementation:

- `main`
- stable tags `v0.1.0` and `v0.2.0`
- `feat/github-release-setup` with upstream tracking

Remote `dev` was explicitly verified absent. The feature-branch push does not
match the CI workflow triggers, so no CI run is expected from it. CI should be
verified with a pull request or the later human-approved `dev`/`main` push.

## Validation

- Baseline `scripts/decky doctor`: passed with expected cache/local-package
  warnings.
- Baseline and final `scripts/orchestration/run-quality-gates`: passed.
- Frontend: TypeScript check, Rollup build, and 154 Vitest tests passed.
- Python: main/backend byte-compilation and full Pytest suite passed.
- Focused screenshot/release-asset tests: 6 passed.
- `scripts/orchestration/check-review-notes-not-deleted`: passed.
- `git diff --check`: passed; `dist/index.js` remained unchanged.
- `scripts/release.sh` malformed-version, dirty-tree, and existing-tag guards
  were exercised without creating a release commit or tag.

## Post-finalization human gates

These actions remain intentionally deferred until orchestration finalization:

1. Push the locally merged `dev` branch, which triggers the first rolling dev
   prerelease.
2. Promote `dev` to `main` through the project’s human-gated release process.
3. Change repository visibility from private to public when publication is
   approved.
4. Cut the first tagged stable GitHub Release with `scripts/release.sh` and the
   script's printed push commands.
