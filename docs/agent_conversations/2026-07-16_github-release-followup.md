# GitHub Release Follow-up

**Date:** 2026-07-16  
**Branch:** `feat/github-release-followup`

## Objective

Implement the existing GitHub release follow-up plan without changing product
code: document both GitHub Releases installation paths, restore README image
cache-busters and their enforcement, and add two on-device feature screenshots.

## Documentation and test changes

- `README.md` now tells users they can either download the stable
  `Decky-Metadata.zip` release asset or paste the release asset URL into Decky's
  install-from-URL flow. The rolling `dev` prerelease and build-from-source paths
  retain their previous intent.
- The README references five committed screenshots. Every image reference uses
  the exact `?cacheBuster=20260716` query, including the new Game Info and
  controller-layout images referenced from their corresponding feature bullets.
- `AGENTS.md` again documents the `?cacheBuster=YYYYMMDD` convention and requires
  bumping the value whenever committed screenshots are re-captured.
- `tests/test_release_assets.py` now separates the raw README image references
  from their filesystem paths, strips the query with `partition("?")[0]` before
  resolving each path below `assets/`, expects all five images, and positively
  asserts that every reference contains `?cacheBuster=`. This query stripping is
  necessary because the cache-buster is part of the Markdown URL but is not part
  of the committed filename. The existing no-`user-attachments` assertion and
  package/plugin version-agreement assertion remain unchanged.
- TDD red evidence is saved at
  `/tmp/Decky-Metadata/github-release-followup-red.log`; the new cache-buster
  assertion failed against the original three query-free README references
  before the documentation and path-resolution changes were implemented.

## On-device screenshots

The Deck was reachable after the plan-authorized SSH escalation. The current
bundle was deployed with `./run.sh scripts/deck/deploy.sh`, and
`./run.sh scripts/deck/verify/run_all.sh --no-launch` passed before capture.
Captures used `scripts/deck/screenshot.sh` and the committed CDP navigation,
controller-input, and focus probes. No game was launched and no controller
layout was selected or saved.

- `assets/decky-metadata-gameinfo-quicklinks.png`
  - Source capture:
    `/tmp/Decky-Metadata/screenshots/github-release-followup-gameinfo-quicklinks.png`
  - Source SHA-256:
    `1c9d74ae20c4ab732d36720eb8aa99f9510cfdd96fdc2aaff54b71a7c4c13b58`
  - UI path: Wobbly Life listed non-Steam shortcut `2405230651` at
    `/library/app/2405230651/tab/GameInfo`, matched to Steam app `1211020`.
    The live feature smoke passed and the approved image shows Store Page, DLC,
    Community Hub, Points Shop, Discussions, and Guides, with Support and
    Community Market absent.
- `assets/decky-metadata-controller-layouts.png`
  - Source capture:
    `/tmp/Decky-Metadata/screenshots/github-release-followup-controller-layouts.png`
  - Source SHA-256:
    `41378ae633bf5153c0bb3c330b875433845230380e9e410e92aaa194f339b442`
  - UI path: Windrose listed non-Steam shortcut `2702354849`, matched to Steam
    app `3041230`; from its game details page, open Controller Settings, open the
    current layout, then select Community Layouts in Load new layout. The
    committed controller-layout probe reported one displayed Official layout
    and one displayed Community layout. The approved image shows both the
    Recommended and Community Layouts categories and the borrowed Community
    layout card.

Wobbly Life was used for Game Info because it is the available listed match with
both DLC and Points Shop metadata. Windrose was used for Controller Settings
because it is the available listed match with both an Official/Recommended and a
Community layout; no single current Deck fixture demonstrated all four surfaces.

## Validation

- Baseline `./run.sh scripts/orchestration/run-quality-gates`: passed (9 Vitest
  files / 154 tests plus the full Python suite).
- `./run.sh scripts/deck/verify/run_all.sh --no-launch`: passed for listed,
  delisted, never-on-Steam, quick-links, re-render, Community, controller-layout,
  and Search-isolation checks.
- `./run.sh scripts/deck/verify/smoke_quicklinks.sh 2312439508 3462906031 3497159354 2405230651`:
  passed, including Wobbly Life's DLC and Points Shop targets.
- `./run.sh uv run --with pytest -- pytest -q tests/test_release_assets.py`:
  passed after both real PNGs were staged and committed.
- Final `./run.sh scripts/orchestration/run-quality-gates`: passed (9 Vitest
  files / 154 tests plus the full Python suite); review-note preservation and
  `git diff --check` also passed.

No unrelated improvements were made. Product code under `src/`, `main.py`,
`backend/`, and `dist/index.js` was not changed by this implementation.
