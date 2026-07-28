# Fix npm audit findings

## Objective

Eliminate the eight high-severity `npm audit` findings in the frontend build
toolchain without changing the shipped Decky plugin runtime or replacing the
project's `@decky/rollup` preset.

## Problem Definition

`@decky/rollup@1.0.2` currently resolves two stale transitive build tools:

- `@rollup/plugin-commonjs@26.0.3`, which pulls the vulnerable
  `glob` -> `minimatch` -> `brace-expansion` chain.
- `rollup-plugin-delete@2.2.0`, which pulls the vulnerable
  `del` -> `rimraf` -> `glob` chain.

The package itself has no newer release and `npm audit` reports no automatic
fix for the direct dependency. The findings affect development dependencies;
the packaged plugin does not ship these Node modules.

## Scope

### In scope

- Constrain the two vulnerable transitive tools to patched releases using npm
  overrides.
- Regenerate `package-lock.json` and the local install deterministically.
- Confirm that `npm audit` reports zero vulnerabilities.
- Confirm compatibility through the repository's full quality gate.

### Out of scope

- Replacing `@decky/rollup` or rewriting `rollup.config.js`.
- Runtime frontend or Python behavior changes.
- Steam Deck deployment or live-device checks; no `src/steam/` files change.

## Architecture Overview

Keep `@decky/rollup` as the public build preset and add root-level npm
`overrides` scoped to that dependency. Override `@rollup/plugin-commonjs` to
the current patched major and `rollup-plugin-delete` to its current patched
major. Both retain the plugin entry points and option shapes used by the
preset (`commonjs()` and `del({ targets, force })`).

## Public Interfaces / Data Shapes

No plugin API, RPC, UI, manifest, or package payload interface changes. The
only manifest surface added is the standard npm `overrides` object in
`package.json`.

## Dependency Requirements

- Preserve direct dependency versions unless lockfile regeneration selects a
  compatible release already allowed by an existing range.
- Resolve `@rollup/plugin-commonjs` to `29.0.3` or a later compatible patched
  release within major 29.
- Resolve `rollup-plugin-delete` to `3.0.2` or a later compatible patched
  release within major 3.
- Keep all npm caches under `/tmp/Decky-Metadata` via `./run.sh`.

## Implementation Phases

1. Add narrowly scoped npm overrides to `package.json`.
2. Regenerate `package-lock.json` and `node_modules` through the wrapper.
3. Verify the resolved dependency graph and audit report.
4. Run `scripts/decky verify-change dev --explain` and the full quality gate.
5. Record the implementation and validation results in
   `docs/agent_conversations/`.

## Validation Strategy

- `./run.sh npm ls @rollup/plugin-commonjs rollup-plugin-delete del glob minimatch brace-expansion --all`
- `./run.sh npm audit --json`
- `./run.sh npm ci`
- `./run.sh scripts/decky verify-change dev --explain`
- `git diff --check`

## Git Strategy

Work on `fix/npm-audit-20260727` and commit the coherent dependency hardening,
lockfile update, plan, and session record as
`fix(deps): resolve npm audit findings` after all gates pass.

## Existing Worktree State

Before this task, `package-lock.json` already contained a two-line root-version
normalization from `0.3.4` to the committed package version `0.3.6`, and
`docs/issues-to-import.md` was untracked. The dependency lock regeneration
necessarily retains the version normalization; the unrelated document remains
untouched and uncommitted.
