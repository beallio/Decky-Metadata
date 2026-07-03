# 2026-07-03 Missing Count Consistency

## Objective

Make the QAM "Missing metadata" stat match the number of games the metadata scan will process.

## Root Cause

The frontend derived "Missing metadata" as `games.length - metadataCount`, which only counted
games with no metadata cache entry. The backend scan uses `_metadata_needs_scan`, which also
treats empty/manual shell entries as missing, so a placeholder entry could make the QAM stat
lower than the scan total.

## Changes

- Added `Plugin.get_missing_metadata_count` in `main.py`, using `_metadata_needs_scan` as the
  authoritative source for whether each game needs scan work.
- Added `tests/test_missing_count.py` to cover no entry, complete metadata, empty/manual shell
  metadata, blank app IDs, and non-numeric app IDs.
- Added the `getMissingMetadataCount` Decky callable binding in `src/backend.ts`.
- Updated `src/components.tsx` so the QAM stat stores the backend-provided missing count in
  state and refreshes it alongside metadata count updates.
- Rebuilt `dist/index.js` through `npm run build`.

## Notes

The frontend has no TypeScript test runner in this repo, so frontend validation is through
`tsc --noEmit` and the Rollup build. No changes were made to `_metadata_needs_scan`,
`_scan_missing`, `src/steam.ts`, the other stats, styling, or QAM layout.

## Validation

- `scripts/orchestration/run-quality-gates` passed before implementation.
- `./run.sh uv run --with pytest -- pytest -q tests/test_missing_count.py` failed first because
  `Plugin.get_missing_metadata_count` did not exist, then passed after implementation.
- `./run.sh npx tsc --noEmit` passed.
- `./run.sh npm run build` passed.
- `scripts/orchestration/run-quality-gates` passed after implementation.
