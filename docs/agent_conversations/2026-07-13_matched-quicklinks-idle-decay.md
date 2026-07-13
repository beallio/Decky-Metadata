# Matched Quick-Links Idle Decay

**Date:** 2026-07-13
**Branch:** `feat/matched-quicklinks-idle-decay`

## Objective

Implement `docs/plans/2026-07-12_matched-quicklinks-idle-decay.md`: identify the
matched non-Steam Game Info details-rebuild trigger and keep the five native
quick links plus Decky's injected description populated through idle rebuilds.

## Investigation and decisions

- The device Steam bundle shows that Store Page, Community Hub, Discussions,
  Guides, and Support share `!overview.BIsModOrShortcut()` as their relevant
  gate. They do not depend on `details` or async store-item data.
- A 100 ms CDP identity probe plus cache-setter instrumentation captured
  `SetCachedDataForApp(shortcutId, "achievements", 2, ...)` replacing the native
  `details` object about 2.65 seconds after a fresh open.
- The durable boundary is `appDetailsStore.GetAppData`. A per-app identity guard
  populates each new matched-shortcut details object before SteamUI receives it.
- The guard requires a positive metadata `steam_appid`, so unmatched shortcuts
  remain entirely on the existing quick-links-suppression path.
- The pure description/association/screenshot merge lives separately for direct
  Vitest coverage. The implementation does not alter the route shield,
  `BIsModOrShortcut` decision ordering, or in-call launch truth.
- The first default-fixture `run_all.sh` retry hit the smoke probe's
  viewport-sensitive `Developer` text assertion even though CDP showed complete
  description and developer arrays on the React props. The final suite used
  deterministic semantic fixtures whose developer rows were mounted.

## Files modified

- `src/steam/detailsReassert.ts`
- `src/steam/detailsReassert.test.ts`
- `src/steam/metadataPatch.ts`
- `dist/index.js`
- `dist/index.js.map`
- `docs/research/2026-07-10_matched-game-quicklinks-idle-decay.md`
- `docs/agent_conversations/2026-07-13_matched-quicklinks-idle-decay.md`

## Validation

- Focused Vitest: 4 tests passed.
- Full local quality gate: type-check, build, 38 Vitest tests, Python compile,
  pytest, version drift, review-note deletion, and diff checks passed.
- Device deploy: hard reload completed and Decky reported ready.
- `run_all.sh --no-launch`: passed with listed `2155012430`, delisted
  `3497159354`, and never-on-Steam `2977244592`; rerender smoke recorded zero
  cache writes over three subsection round-trips.
- Transformers (`3015223078` -> `338930`) retained all five links, the full
  1,109-character description, shortcut ids, and `BIsModOrShortcut() === false`
  for idle samples of 91.6 seconds, 117.5 seconds after re-entry, and 87.3
  seconds on the exact final bundle.
- Launch smoke was intentionally skipped: no `--allow-launch` authorization was
  supplied. The getter guard does not change launch/spoof decision code.

## Follow-up

- The `check_quicklinks.js` Developer marker is viewport-sensitive for long
  descriptions. A separate tooling plan could make that assertion inspect the
  React details/associations data instead of mounted body text.
