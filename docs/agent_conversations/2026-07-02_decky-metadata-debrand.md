# 2026-07-02 decky-metadata-debrand

## Objective

Implement `docs/plans/2026-07-02_decky-metadata-debrand.md`: remove the
remaining `playhub` internal identifiers and persisted filenames, and match
the busy/status treatment used by `beallio/SDH-Ludusavi`.

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
- Updated the review-requested spinner reference to `beallio/SDH-Ludusavi`.
  The busy treatment now uses Decky's `Spinner` component tinted Steam-blue
  (`#1a9fff`) at 18px, in flex rows with a 10px gap, for the Scan button,
  Refresh delisted index button, and delisted busy status line.
- Added Steam-blue (`#1a9fff`) status-message text for the scan status row,
  Activity refresh status row, and delisted status row while preserving the
  surrounding font size and weight.

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
- Review round 01 follow-up: rebuilt after replacing the rejected rotating-icon
  implementation with Decky's blue `Spinner`; confirmed `decky-spin` is absent
  from the source and bundle.

## Deferred on-device checks

- Confirm Scan metadata and Refresh delisted index buttons show the blue
  Ludusavi-style Decky spinner while busy.
- Confirm scan, Activity refresh, and delisted status-message text uses the
  Steam-blue accent without disrupting layout.
- Confirm the Steam Activity/community-feed passthrough still renders and
  refreshes after the paired CSS/DOM/window-key renames.
- Confirm a fresh scan writes `decky_metadata.json`.
- Confirm devices previously on 0.1.0 show an empty metadata set until
  re-scanned, which is the expected clean-break consequence.
