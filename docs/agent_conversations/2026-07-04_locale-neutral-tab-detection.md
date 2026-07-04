# 2026-07-04 Locale-Neutral Tab Detection

## Objective

Implement `docs/plans/2026-07-03_locale-neutral-tab-detection.md`.

## Files Modified

- `src/steam/core.ts`
- `dist/index.js`
- `tests/test_locale_neutral_tab_detection.py`

## Design Decisions

- The Steam source has already been split into modules; the planned `src/steam.ts`
  tab-normalization code now lives in `src/steam/core.ts`.
- The obsolete `"Attività"` internal key and `knownDetailsTabLabels` table were not
  present in current source, so no sentinel migration was needed there.
- `normalizedTabText` now uses locale-neutral `toLocaleLowerCase()` instead of
  pinning `it-IT`.
- Added a pytest source guard so fixed Italian tab normalization cannot return.

## Validation Results

- Baseline `scripts/orchestration/run-quality-gates`: passed before changes.
- Focused red test:
  `./run.sh uv run --with pytest -- pytest -q tests/test_locale_neutral_tab_detection.py`
  failed on `toLocaleLowerCase("it-IT")`.
- Focused green test:
  `./run.sh uv run --with pytest -- pytest -q tests/test_locale_neutral_tab_detection.py`
  passed after the source change.
- `./run.sh npm run build`: passed and rebuilt `dist/index.js`.
