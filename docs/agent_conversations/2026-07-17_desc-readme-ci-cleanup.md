# Description, README, and CI action cleanup

## Date

2026-07-17

## Objective

Implement the existing `desc-readme-ci-cleanup` plan by synchronizing the package
description with the plugin publishing metadata, correcting the plugin's display
name in one README sentence, and updating the Node-based GitHub Actions to their
current major versions.

## Files modified

- `package.json`: copied `plugin.json`'s canonical `publish.description` verbatim.
- `README.md`: changed only `Decky-Metadata updates` to `Decky Metadata updates`.
- `.github/workflows/ci.yml`: bumped `actions/checkout` and `actions/setup-node`
  from `@v4` to `@v5`.
- `.github/workflows/release.yml`: bumped the same two action pins to `@v5`.
- `.github/workflows/dev-release.yml`: bumped the same two action pins to `@v5`.

No files under `src/`, `backend/`, `dist/`, or `main.py` were changed.

## Design decisions

- Treated `plugin.json`'s publishing description as the source of truth and left
  all other package metadata unchanged.
- Preserved hyphenated filenames, repository identifiers, badge slugs, and the
  `Decky-Metadata.zip` asset reference while correcting only the human-readable
  update phrase.
- Left every workflow trigger, permission, job, `with:` block, Node version,
  cache setting, ref, and fetch-depth unchanged.
- No behavior changed, so the plan required no new or modified tests and no
  on-device verification.

## Validation

- Confirmed `package.json.description` exactly equals
  `plugin.json.publish.description`.
- Confirmed the README contains `Decky Metadata updates`, contains no
  `Decky-Metadata updates`, and retains its `Decky-Metadata.zip` reference.
- Confirmed exactly six `actions/checkout@v5` / `actions/setup-node@v5` pins are
  present across the three workflows and no matching `@v4` pins remain.
- Parsed every `.github/workflows/*.yml` file successfully with PyYAML.
- `scripts/orchestration/run-quality-gates`: PASS, including TypeScript checks,
  Rollup build, 187 Vitest tests, Python byte-compilation, and pytest.
- `scripts/orchestration/check-review-notes-not-deleted`: PASS.
- `git diff --check`: PASS.

GitHub-hosted execution of the `@v5` actions is deferred to the next real push or
tag that triggers the workflows; it cannot be exercised locally.
