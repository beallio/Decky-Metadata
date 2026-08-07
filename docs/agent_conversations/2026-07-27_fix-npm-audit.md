# Fix npm audit findings

## Date

2026-07-27

## Objective

Remove all npm audit findings from the frontend build dependency graph while
preserving the existing Decky Rollup preset and shipped plugin behavior.

## Files Modified

- `package.json`
- `package-lock.json`
- `docs/plans/2026-07-27_fix-npm-audit.md`
- `docs/agent_conversations/2026-07-27_fix-npm-audit.md`

The pre-existing untracked `docs/issues-to-import.md` was left untouched and is
not part of this change.

## Design Decisions

- Kept `@decky/rollup@1.0.2`, because it is the current published release and
  centralizes the repository's expected Rollup configuration.
- Added npm overrides scoped to `@decky/rollup` for
  `@rollup/plugin-commonjs@^29.0.3` and `rollup-plugin-delete@^3.0.2`.
- Used patched upstream majors because the vulnerable versions are selected by
  stale transitive ranges and npm reports no direct upgrade for
  `@decky/rollup`.
- Accepted the new transitive Node 18 minimum from `del@8`; all committed CI
  workflows use Node 22.
- Retained the pre-existing package-lock root version normalization from
  `0.3.4` to the committed package version `0.3.6` during lock regeneration.
- Did not update README or runtime documentation because the plugin's behavior,
  configuration, and package contents are unchanged.
- Did not run on-device checks because no `src/steam/` or runtime source files
  changed.

## Dependency Result

- `@rollup/plugin-commonjs`: `26.0.3` -> `29.0.3`
- `rollup-plugin-delete`: `2.2.0` -> `3.0.2`
- `del`: `6.1.1` -> `8.0.1`
- Removed the vulnerable `glob`, `rimraf`, `minimatch`, and
  `brace-expansion` paths from `@decky/rollup`.

## Validation Results

- Baseline `./run.sh scripts/decky verify-change dev --explain`: PASS
- `./run.sh npm install --package-lock-only`: PASS, 0 vulnerabilities
- `./run.sh npm ci`: PASS, 0 vulnerabilities
- `./run.sh npm audit --json`: PASS, 0 vulnerabilities
- `./run.sh npm ls ... --all`: PASS; overrides resolve to the intended versions
- Final `./run.sh scripts/decky verify-change dev --explain`: PASS
  - TypeScript static check: PASS
  - Rollup production build: PASS
  - Vitest: 17 files, 193 tests passed
  - Python byte compilation: PASS
  - Pytest: PASS
  - Version drift guard: PASS

Command logs are retained under `/tmp/Decky-Metadata/audit-fix/`.
