# Runbook: On-Device Verification

Every frontend change that touches Steam patching must be verified on the Deck
before `dev` is considered good — the quality gates cover types/build/backend
only, and two shipped fixes (the launch regression's armer assumption,
`hide-quicklinks-row-nonsteam`'s insertion point) were wrong in ways only the
live Steam tree reveals. Session logs must not defer these checks without
naming who runs them and when; prefer running `run_all.sh` before merge.

## Tooling (committed — do not recreate ad hoc)

All under `scripts/deck/`. Assumes SSH alias `steamdeck` (override
`DECKY_DECK_HOST`) and CEF debugging enabled on device
(`~/.steam/steam/.cef-enable-remote-debugging`, port 8080).

| Tool | Purpose |
| --- | --- |
| `tunnel.sh up\|down\|status` | SSH tunnel `localhost:18081` → deck debugger |
| `cdp.py list\|eval\|reload\|wait-ready` | stdlib CDP client; `eval` takes inline JS, `@file`, or `-`, with `--var KEY=VALUE` substituting `__KEY__` in snippets |
| `deploy.sh [--no-build]` | build → scp `dist/index.js` → hard reload → wait ready. A plain Decky reload does NOT bust the CEF cache; only the hard reload (or full Steam restart) does |
| `logs.sh reasons\|hijacks\|gameactions\|launches\|tail\|sync\|audit` | canned queries plus deterministic local audit |
| `js/*.js` | parameterized probes: `nav`, `click_play`, `goback`, `state`, `check_quicklinks`, `fiber_walk`, RunGame tracer pair, cache-write counter pair, `terminate` |
| `verify/run_all.sh [--no-launch] [--extended]` | the suite using a persisted semantic fixture manifest; extended adds bounded idle sampling |

Prefer `scripts/decky verify-change BASE --device` for change-aware routing. The
dispatcher requires `--allow-launch` before the real launch smoke and captures a
diagnostic bundle on behavioral failure. See [Agent Workflow](agent-workflow.md).

Typical loop:

```bash
scripts/deck/deploy.sh            # push the current change
scripts/deck/verify/run_all.sh    # verify (really launches a game briefly)
```

## Which checks a change must run

| Change touches | Required checks |
| --- | --- |
| `BIsModOrShortcut` afterPatch, bypassCounter, route shield (`metadataPatch.ts`, `core.ts` shield fns) | `smoke_launch.sh` (Play inside the shield window must launch with a 64-bit gameid) AND `smoke_quicklinks.sh` (the spoof must keep rendering the rich page) |
| Route render patches, `applyMetadata`, activity refresh (`routerPatches.ts`) | `smoke_rerender.sh` (0 cache writes on same-app subsection round-trips) + a manual subsection→B focus check with a controller |
| Quick-links suppression / section hooks | `smoke_quicklinks.sh` both directions |
| Anything else in `src/steam/` | `run_all.sh` — the suite is cheap; run all of it |

A manual physical-controller Play press remains the final say for launch
behavior — the smoke test dispatches synthetic pointer events, which has
matched real behavior so far but is not identical input.

## Debugging beyond the suite

- `cdp.py eval SharedJSContext @scripts/deck/js/state.js` — device state.
- `cdp.py eval "Steam Big Picture Mode" @scripts/deck/js/fiber_walk.js --var TEXT="Store Page"` —
  component chain above any text node; `wrapped: true` marks our suppression wrapper.
- `logs.sh hijacks` — render-shield decisions that overrode in-call truth
  (`bypassCounterBefore='-1'`); any hit is the launch-killer signature.
- `logs.sh gameactions <appid>` — a launch that reaches `CreatingProcess` →
  `Completed` succeeded; `DownloadingDepots` on a shortcut, or no GameAction at
  all, means Steam was handed a bare appid.

## Hazards (learned the hard way)

- **Never enumerate MobX store instances (overview/details/appStore) inside a
  render-phase tree walk.** Observer renders subscribe to every key touched;
  the renderer wedges. Walk only React elements/arrays (`reactTreeWalk.ts`).
  If the UI freezes: `ssh steamdeck 'steam -shutdown'` — Gaming Mode restarts
  Steam automatically (~1 min); the on-disk bundle is untouched.
- **Element `type` swaps need cached wrapper identity** — a fresh wrapper per
  render remounts the subtree every render (focus loss, state reset).
- **Clicking text-matched elements**: ancestors share the button's text;
  `click_play.js` picks the innermost focusable for this reason. Don't write
  ad-hoc clickers.
- Webpack module exports are getter-only and non-configurable — patch class
  prototypes (writable) or swap element `type` in a reachable render output;
  never try to reassign a module export.
