# 2026-07-02 decky-build-version

## Objective

Implement the existing `decky-build-version` plan on
`feat/decky-build-version`: package local builds with a git short-hash version
fingerprint and show that build identity in the QAM Diagnostics versions panel.

## Files modified

- `main.py`
- `src/backend.ts`
- `src/components.tsx`
- `scripts/package.mjs`
- `tests/test_package_version.py`
- `tests/test_plugin_version.py`
- `tests/package_mjs_test.mjs`
- `README.md`
- `dist/index.js`

## Changes and decisions

- Mirrored the SDH-Ludusavi build-identity flow for this single-file backend:
  the packaged JSON carries the resolved version, and the backend reads that
  runtime JSON instead of relying on a frontend bundle literal.
- Added `PLUGIN_BASE_VERSION = "0.1.0"` and a never-raising runtime resolver in
  `main.py`. It searches upward from `main.py` for the plugin root, reads
  `plugin.json` first, falls back to `package.json`, then falls back to the base
  literal. Failures are logged at debug level.
- Exposed `get_plugin_version` through the Decky backend and bound it in
  `src/backend.ts`.
- Kept `PLUGIN_VERSION` in the frontend as the initial fallback only. The QAM
  Diagnostics panel now loads the runtime version on mount and renders two rows:
  `Plugin` for the base version and `Commit` for the short hash, or `local` when
  no hash is present.
- Changed `scripts/package.mjs` to validate `package.json` and `plugin.json`
  versions match, compute `git rev-parse --short HEAD` for local builds, and
  write the resolved version only into the staged copies of `plugin.json` and
  `package.json`.
- The package filename now includes the resolved version. Local builds use
  `Decky-Metadata_0.1.0+<shorthash>_Installer.zip`; `--release` and `--no-hash`
  builds use `Decky-Metadata_0.1.0_Installer.zip`.
- No `src/steam.ts` changes were made.

## Validation

- Baseline before code changes: `./scripts/orchestration-hooks/quality-gates`
  passed.
- Red tests were observed for dev package hash injection and backend runtime
  version resolution before implementation.
- Targeted pytest after implementation:
  `./run.sh uv run --with pytest -- pytest -q tests/test_package_version.py`
  passed.
- Targeted backend pytest after implementation:
  `./run.sh uv run --with pytest -- pytest -q tests/test_plugin_version.py`
  passed.
- Frontend type-check: `./run.sh npx tsc --noEmit` passed.
- Backend byte-compile: `./run.sh python3 -m py_compile main.py` passed.
- Node packager smoke tests: `./run.sh node --test tests/package_mjs_test.mjs`
  passed.
- Final quality-gate results are recorded in the implementing turn summary.

## Deferred on-device check

Rebuild from `dev`, run `npm run package`, uninstall the old plugin, install
the fresh `Decky-Metadata_0.1.0+<shorthash>_Installer.zip` through Decky
Developer Mode, then confirm the QAM Versions panel shows `Plugin` as `0.1.0`
and `Commit` as the packaged git short hash.
