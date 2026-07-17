# Reorganize QAM Panels — Implementation Session

## Objective

Implement the approved `reorganize-qam-panels` plan: compose the Quick Access
Menu from four native Decky sections, remove bulk Activity refresh only from the
frontend, add a bounded viewer for the existing plugin log, and preserve native
controller focus and spacing behavior.

## Files changed

- Reworked `src/ContentPanel.tsx` as the data and operation coordinator.
- Added typed presentational components under `src/components/qam/` for
  Metadata, Delisted Index, Logs, Versions, and the Plugin Logs modal.
- Added the bounded log-tail RPC in `main.py` and its callable in
  `src/backend.ts`.
- Removed the unreachable bulk Activity event listener and install wiring from
  `src/steam/activity.ts` and `src/steam/install.ts` while retaining all backend
  bulk-refresh and frontend per-app refresh entry points.
- Removed QAM-only styles from `src/styles.tsx`.
- Added focused regression coverage in `tests/test_plugin_logs.py` and
  `tests/test_qam_frontend_contract.py`.
- Updated `README.md`, `dist/index.js`, and `dist/index.js.map`.

## Design decisions

- Followed SDH-PlayTime's thin `DeckyPanelPage` composition pattern: the
  top-level panel owns state and callbacks while each section receives explicit
  typed props.
- Followed SDH-Ludusavi's native Logs and Versions presentation, using Decky
  `ButtonItem`, `ToggleField`, `Field`, `ConfirmModal`, and `showModal` controls.
- Preserved the approved section order and separator contract: no separator
  after Refresh metadata, standard separators after Clear cache and Refresh
  delisted index.
- The Decky `preferredFocus` hint alone did not select the Metadata summary on a
  fresh live entry. The correction keeps Decky's native `Focusable` ref and
  preferred-child policy, matches the exact wrapper in the native focus trees,
  and requests `BTakeFocus()` on the next animation frame. It does not query
  generated Steam classes, call raw DOM `focus()`, or use a timer.
- The log helper reads at most 128 KiB from the existing rotating file handler,
  seeks from the end, drops only a known partial first line, decodes invalid
  UTF-8 with replacement, and safely returns an empty or short result when the
  log is missing, unavailable, truncated, or rotated. The RPC accepts no path.
- Activity compatibility remains intentionally asymmetric: the QAM control,
  state, dispatch, and now-unreachable bulk listener are gone, while
  `start_refresh_steam_activities`, progress reporting, TypeScript callables,
  and both per-app refresh paths remain unchanged.

## TDD and static verification

- Captured the initial 15 expected focused-test failures under
  `/tmp/Decky-Metadata/reorganize-qam-panels-red.txt` before production changes.
- Added and passed focused cases for missing, short, oversized, mid-line,
  newline-free, invalid UTF-8, truncated/rotated, flushed-handler, fallback, and
  unavailable log reads.
- Added and passed source-contract checks for section order, native focus,
  approved labels and separators, the log modal, Activity frontend removal, and
  preserved backend/per-app Activity interfaces.
- Baseline and implementation checks used `scripts/decky doctor`,
  `scripts/decky verify-change dev --explain`, the orchestration quality gate,
  TypeScript checking, Rollup, Vitest, Python byte-compilation, and Pytest.

## Live Deck verification

- Deployed the frontend during iteration, then built, pushed, and installed
  `Decky-Metadata.zip` through Decky's Developer UI so both the frontend and new
  Python RPC were active. Installed-state verification reported the package as
  current at `0.2.1+75bd308`.
- On a fresh QAM entry, the Metadata summary had native `gpfocus`; D-pad order
  was summary, Refresh metadata, Clear cache, Refresh delisted index, View Logs,
  Debug Logging, then Versions.
- Confirmed the four section headings, exact helper text, nested cache group,
  standard native separators, QAM scrolling, and full packaged version.
- Exercised Refresh metadata live. The button and inline `Refreshing metadata...`
  status appeared without clipping, then completed as
  `Refresh complete: 0/4 saved, 4 not matched` while the rest of the panel
  remained available.
- Opened a long real plugin log through the installed backend RPC. The modal had
  one visible OK action; its 340 px body scrolled a 41,540 px log, used
  selectable monospace pre-wrapped text, and dismissed through both the cancel/
  Escape path and OK without trapping focus on return to the QAM. The shorter
  `No recent logs` fallback and base-only version use the same bounded layouts;
  their values are also covered by focused tests.
- The committed on-device suite passed quick-links, zero-write same-app
  re-render churn, and community fallback checks. Controller-layout and launch
  smokes were skipped by the suite's explicit fixture policy. A transient Deck
  network loss was diagnosed with `scripts/decky doctor --deck`; after
  reachability recovered, the complete suite passed.

## Scope notes

No metadata-editor behavior, native Activity stores, feed patches, caches, or
per-app refresh semantics were changed. No unrelated follow-up work was folded
into this implementation.
