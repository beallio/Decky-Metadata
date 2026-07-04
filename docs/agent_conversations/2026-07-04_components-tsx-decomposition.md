# 2026-07-04 - components-tsx-decomposition

## Objective

Implement `docs/plans/2026-07-03_components-tsx-decomposition.md` by decomposing
`src/components.tsx` (1,020 lines) into focused modules while preserving the
`Content`/`MetadataPage` public surface consumed by `src/index.tsx` and
behavior identical to the original.

## Test coupling check

The plan flagged `tests/test_qam_controller_scroll.py` as pinning
`components.tsx` by source text. That file was already removed in commit
`1731eb8` (`test(frontend): remove source-pinned qam assertions`), part of
the earlier `behavioral-frontend-tests` work. No test in `tests/` references
`components.tsx`, `PLUGIN_VERSION`, `splitVersion`, or `parseSteamAppId`, so
no test updates were required for this round.

## Module Map

- `src/styles.tsx`: all shared inline style constants (`pageStyle`,
  `qamPanelStyle`, `rowStackStyle`, `buttonRowStyle`, `fieldStyle`,
  `inlineStatusStyle`, diagnostics/grid styles, etc.) plus the small shared
  presentational components `FocusableButton`, `BusySpinner`, and
  `ButtonLabel`. Named `.tsx` (not `.ts` per the plan's literal filename)
  because these three components use JSX, which only compiles from a `.tsx`
  file under this project's `moduleResolution`/`jsx` config.
- `src/metadataForm.ts`: form parse/serialize helpers used by `MetadataPage`
  (`metadataTemplate`, `personsToText`, `textToPersons`, `epochToDate`,
  `dateToEpoch`, `parseRating`, `parseSteamAppId`).
- `src/useNonSteamGames.ts`: the `useNonSteamGames` hook, unchanged.
- `src/ContentPanel.tsx`: the QAM panel (`Content`), plus its private helpers
  (`scanCompleteMessage`, `scanCompleteStatusKind`, `activityCompleteMessage`,
  a local `epochToDate`, `PLUGIN_VERSION`, `splitVersion`). These two version
  helpers and the version constant are only referenced from `Content`
  (confirmed via repo-wide grep), so they moved here rather than into a
  shared module.
- `src/MetadataPage.tsx`: the metadata editor (`MetadataPage`), unchanged
  logic, now importing style/form helpers from the new modules.
- `src/components.tsx`: deleted.

## Public Surface

`src/index.tsx` now imports `Content` from `./ContentPanel` and
`MetadataPage` from `./MetadataPage` instead of both from `./components`.
`src/contextMenuPatch.tsx` never imported from `./components`, so it is
unchanged. No other file referenced `./components`.

## Validation

- Baseline before implementation: `./run.sh npx tsc --noEmit` passed against
  the pre-split `components.tsx`.
- `./run.sh npx tsc --noEmit` passed after the split.
- `./run.sh npm run build` passed and rebuilt `dist/index.js` / `dist/index.js.map`.
- `./run.sh uv run --with pytest -- pytest -q` — full suite green (114 tests).
- `scripts/orchestration/run-quality-gates` passed.
- Deferred: on-device verification of QAM panel/editor rendering and
  controller-scroll behavior (per plan, this is a deferred on-device check).
