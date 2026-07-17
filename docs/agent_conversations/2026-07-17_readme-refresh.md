# README Refresh Implementation

## Date

2026-07-17

## Objective

Refresh the public README with warmer, player-facing copy; remove contributor-facing templates and outdated sections; and replace the feature screenshots with an approved Warhammer 40,000: Space Marine set captured from a live Steam Deck.

## Changes

- Reworked `README.md` into a short introduction, QAM hero image, simple release install instructions, and plain-language feature sections.
- Removed the build-from-source and notes material, plus the personal maintainer wording in the credits.
- Preserved the Playhub Metadata, Decky Plugin Template, and decky-steamgriddb license attributions.
- Deleted `CONTRIBUTING.md`, `.github/pull_request_template.md`, `.github/ISSUE_TEMPLATE/bug_report.md`, and `.github/ISSUE_TEMPLATE/feature_request.md` while preserving both workflow files.
- Replaced `assets/decky-metadata-gameinfo-quicklinks.png` with separate Game Info top and button-row screenshots.
- Updated every README image reference to `?cacheBuster=20260717` and updated the release-asset test for the final seven-image set.
- Left `src/`, `main.py`, `backend/`, `dist/index.js`, and `package-lock.json` unchanged.

## Final image set

Reused without recapture:

- `assets/decky-metadata-qam.png`
- `assets/decky-metadata-editor.png`
- `assets/decky-metadata-activity-news.png`

Captured from the live Steam Deck with `scripts/deck/screenshot.sh` at 1281x801:

| Asset | Temporary source | SHA-256 | On-device path exercised |
| --- | --- | --- | --- |
| `assets/decky-metadata-gameinfo-top.png` | `/tmp/Decky-Metadata/screenshots/decky-metadata-gameinfo-top.png` | `c1f2c3da893f7bc6f49fafe87820cffa9e6bd2eb52288d11033efc8d9ce2c6d5` | `/library/app/2155012430` -> Game Info, top of the tab |
| `assets/decky-metadata-gameinfo-buttons.png` | `/tmp/Decky-Metadata/screenshots/decky-metadata-gameinfo-buttons.png` | `101e3346d0d79c16f188a365fe09a583f00ccd98d4bee0400c349dc76ff04cdd` | `/library/app/2155012430` -> Game Info -> Details -> quick-links row |
| `assets/decky-metadata-community.png` | `/tmp/Decky-Metadata/screenshots/decky-metadata-community.png` | `3ed709ea13cdaa62fcbb73048672398717150725b2631f620350170ba2a6e22f` | `/library/app/2155012430` -> Community; 30 Steam-hosted card images rendered |
| `assets/decky-metadata-controller-layouts.png` | `/tmp/Decky-Metadata/screenshots/decky-metadata-controller-layouts.png` | `c0be23773a1ef29a2653a421ee6a0c4fddfb53ced15fc0f7c34b549854da2733` | `/library/app/2155012430` -> Configure Controller -> current layout -> Community Layouts |

Each capture was visually inspected before being copied into `assets/`. The Game Info pair covers the Space Marine artwork and description at the top, followed by developer, publisher, release date, Steam Deck compatibility, and the quick-links buttons at the bottom.

## Design decisions

- Kept the language friendly and concise while retaining the existing behavior claims in plain terms.
- Split Game Info across two direct device captures so its long Space Marine description and lower metadata/button row remain readable at the Deck's native viewport.
- Kept the test strict: the expected image count moved from five to seven only when the four real captures were added, with no placeholder assets.
- Used the committed deploy, CDP navigation/focus, and screenshot tooling; no product behavior or live metadata was modified for the captures.

## Validation

- Baseline `./run.sh scripts/orchestration/run-quality-gates`: PASS.
- Deck reachability: `./run.sh scripts/decky doctor --deck` and `./run.sh scripts/deck/wait_online.sh`: PASS.
- Live deployment: `./run.sh scripts/deck/deploy.sh`: PASS; bundle reloaded and Decky reported ready.
- Focused `./run.sh uv run --with pytest -- pytest -q tests/test_release_assets.py`: PASS (4 tests).
- Post-capture `./run.sh scripts/orchestration/run-quality-gates`: PASS, including TypeScript checks/build, 154 Vitest tests, Python compilation, pytest, and the review-note deletion guard.
- Final pre-commit round gate, focused asset test, static content checks, and review-note deletion guard: PASS. Clean-tree verification is performed after this documentation commit.
