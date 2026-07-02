# 2026-07-02 decky-metadata-debrand

## Objective

Implement `docs/plans/2026-07-02_decky-metadata-debrand.md`: remove the
remaining `playhub` internal identifiers and persisted filenames, and replace
the Decky `Spinner` button treatment with a Ludusavi-style rotating icon.

## Files modified

- `src/steam.ts`
- `src/components.tsx`
- `main.py`
- `tests/test_log_file.py`
- `tests/test_platform_capabilities.py`
- `tests/package_mjs_test.mjs`
- `dist/index.js`

## Changes and decisions

- Renamed the remaining internal Steam Activity/community-feed identifiers in
  `src/steam.ts` from `playhub`/`Playhub`/`PLAYHUB` to
  `decky`/`Decky`/`DECKY`, including CSS classes, DOM ids, `data-*`
  attributes, CSS custom properties, window-global keys, comments, and the
  Steam Activity tag string.
- Renamed persisted backend files to `decky_metadata.json` and
  `decky-metadata.log`, and changed the IGN GraphQL User-Agent to
  `DeckyMetadata/0.1 (+Decky Loader)`.
- This is an intentional clean break with no migration from
  `playhub_metadata.json` or `playhub-metadata.log`. Devices that ran the
  shipped 0.1.0 build will start with an empty `decky_metadata.json` until a
  fresh scan repopulates saved matches.
- Replaced Decky's `Spinner` component in the Scan button, Refresh delisted
  index button, and delisted status line with a `react-icons/fa`
  `FaCircleNotch` icon using a `decky-spin` keyframe class. The button labels
  remain flex rows with stable minimum width and disabled-while-busy behavior.

## Validation

- Baseline before implementation: `scripts/orchestration/run-quality-gates`
  passed.
- Focused frontend check after spinner edits: `./run.sh npx tsc --noEmit`
  passed.
- Bundle rebuild: `./run.sh npm run build` passed and regenerated
  `dist/index.js`.
- Final quality gate: `scripts/orchestration/run-quality-gates` passed.
- Review-note deletion guard: `scripts/orchestration/check-review-notes-not-deleted`
  passed.
- Grep gates: `grep -rniI "playhub" src/ main.py` found zero matches, and
  `grep -c "playhub" dist/index.js` returned `0`.

## Deferred on-device checks

- Confirm Scan metadata and Refresh delisted index buttons show a smoothly
  rotating Ludusavi-style icon while busy.
- Confirm the Steam Activity/community-feed passthrough still renders and
  refreshes after the paired CSS/DOM/window-key renames.
- Confirm a fresh scan writes `decky_metadata.json`.
- Confirm devices previously on 0.1.0 show an empty metadata set until
  re-scanned, which is the expected clean-break consequence.
