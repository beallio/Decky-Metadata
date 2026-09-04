# npm audit: dev-only lockfile advisories

## Date

2026-09-04

## Objective

Clear the open GitHub security alerts found while preparing the v0.3.12 stable
release.

## Findings

`gh api repos/beallio/Decky-Metadata/dependabot/alerts` reported one open alert.
`npm audit` reported two advisories, both high severity and both in the
`development` scope:

- `browserslist <= 4.28.6` — GHSA-73wf-gq98-2v4g (CVE-2026-73088, uncaught crash
  or prototype write through an untrusted `browserslist-stats.json`) and
  GHSA-c83g-rgw3-j3cx (unbounded memory growth). Dependabot alert 10, open.
  Reached only through `@types/webpack` -> `webpack` -> `browserslist`.
- `nanoid < 3.3.18` — GHSA-2v37-7h3g-55p8 (a custom generator can loop
  indefinitely when size is zero). Dependabot alert 9, auto-dismissed. Reached
  only through `vitest` -> `vite` -> `postcss` -> `nanoid`.

Code scanning reported no analysis, and secret scanning is disabled on the
repository.

Neither package reaches the shipped plugin. `browserslist` arrives only through
the `@types/webpack` type package; the bundle is built by rollup, which does not
use it. `nanoid` arrives only through the vitest test runner. Neither is present
in `Decky-Metadata.zip`.

## Implementation

`npm audit fix` changed 7 packages and rewrote 28 lines of
`package-lock.json`. No entry in `package.json` changed, and no override was
needed. Resulting versions: `browserslist` 4.28.8 and `nanoid` 3.3.18.

## Validation

- `./run.sh npm audit` — `found 0 vulnerabilities`.
- `./scripts/orchestration-hooks/quality-gates` exited 0: tsc clean, rollup
  built, vitest 26 files / 390 tests, `py_compile` clean, pytest 477 passed.
- `dist/index.js` md5 is `a0712d3a402eb9cf51d28c629a33acb8` before and after the
  bump, so the shipped bundle is byte-identical.
- Working tree after the change contained only `package-lock.json`.

## Release impact

The published `v0.3.12` artifact is not affected. Both advisories are
development-scope only, and the rebuilt bundle is byte-identical, so no
re-release is required for security reasons. No `CHANGELOG.md` entry was added,
which follows the precedent of `b5090ae chore(deps): patch dev-only advisories
in the lockfile`: dev-only lockfile changes are not user-visible.

## Deferred verification

No Steam Deck check was run. No `src/`, `backend/`, or test file changed.
