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
| `cdp.py list\|eval\|reload\|wait-ready\|input\|screenshot` | stdlib CDP client; `eval` takes inline JS, `@file`, or `-`, with `--var KEY=VALUE` substituting `__KEY__` in snippets; `input [<target>] <key>…` dispatches synthetic D-pad/`enter`/`escape` key events (default target Big Picture) to drive gamepad focus without a physical controller; `screenshot OUTPUT.png [TARGET]` captures a visual page below `/tmp/Decky-Metadata` |
| `screenshot.sh OUTPUT.png [TARGET]` | Opens the debugger tunnel and captures a PNG below `/tmp/Decky-Metadata/screenshots`; defaults to the composited `Steam Big Picture Mode` target and accepts a visual overlay target such as the active `QuickAccess_uid*` page |
| `deploy.sh [--no-build]` | build → scp `dist/index.js` → hard reload → wait ready. A plain Decky reload does NOT bust the CEF cache; only the hard reload (or full Steam restart) does |
| `install_release.sh <tag> [update\|downgrade]` | install a published GitHub *release* build via Decky's own installer (over CDP) — the way to move OFF a local `+hash` build onto a real release so the self-updater is enabled. Fetches the zip URL + whole-zip sha256, then fires `utilities/install_plugin`; you confirm the prompt on the Deck. See the self-update section below |
| `logs.sh reasons\|hijacks\|gameactions\|launches\|tail\|sync\|audit` | canned queries plus deterministic local audit |
| `js/*.js` | parameterized probes: `nav`, `click_play`, `goback`, `state`, `check_quicklinks`, `fiber_walk`, RunGame tracer pair, cache-write counter pair, `terminate`; focus probes `gpfocus_dump` (read-only "what is selected now") and `focus_order` (active focusable inventory with rects) |
| `verify/run_all.sh [--no-launch] [--extended]` | the suite using a persisted semantic fixture manifest; extended adds bounded idle sampling |

Prefer `scripts/decky verify-change BASE --device` for change-aware routing. The
dispatcher requires `--allow-launch` before the real launch smoke and captures a
diagnostic bundle on behavioral failure. See [Agent Workflow](agent-workflow.md).
The controller-layout smoke populates Steam's in-memory controller configuration
cache while issuing bounded read queries, so it also requires explicit current
device approval even though it never persists a selection or launches a game.

`scripts/decky verify-change --device` deploys only the frontend bundle
(`dist/index.js`) through `scripts/deck/deploy.sh`. It does not deploy changes to
`main.py` or `backend/`. When either backend path changes, on-device verification
and release require a full-plugin build and push:

```bash
scripts/decky package-push --build --push
```

Install the resulting zip through the Decky UI before running the live checks.

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

## Controller navigation & initial focus

QAM/panel and editor changes have a hard gate the static tests cannot prove:
the intended control is selected on a fresh entry, and D-pad order matches the
visual order. The `reorganize-qam-panels` `preferredFocus` → `BTakeFocus` fix
lived and died here. Drive it deterministically with the committed tooling
instead of hand-rolling a key-dispatch script each time:

```bash
scripts/deck/deploy.sh                                   # push the change, hard reload
# open the plugin fresh (physical controller or js/nav.js), then:
T="Steam Big Picture Mode"
scripts/deck/cdp.py eval "$T" @scripts/deck/js/gpfocus_dump.js   # is the intended control selected on entry?
scripts/deck/cdp.py input "$T" down                              # one D-pad step
scripts/deck/cdp.py eval "$T" @scripts/deck/js/gpfocus_dump.js   # did focus move to the next control?
# repeat down/dump to walk the whole panel in order; `enter` activates; `escape` (B) backs out of a modal
scripts/deck/cdp.py input "$T" enter                             # activate the focused control
scripts/deck/cdp.py input "$T" escape                            # dismiss a modal / back out
```

- `gpfocus_dump.js` is the **order oracle**: dispatching a real `down` and
  re-reading `gpfocus` reflects Steam's actual gamepad nav tree. Confirm initial
  focus by dumping immediately after entry, before any input.
- `focus_order.js` is a **static inventory** (labels + rects + scroll margins of
  every focusable in a subtree). Use it to catch clipped/overlapping/off-screen
  controls and to audit labels — not to assert nav order (DOM order ≠ gamepad
  order).
- For modal focus return, open the modal, `escape` it, then `gpfocus_dump.js`
  and confirm focus landed back on the launching control rather than being
  trapped in the (now closed) modal.

`preferredFocus` is only a hint; when it does not select on-device, use a native
mechanism (match the wrapper in `getGamepadNavigationTrees()` and call
`BTakeFocus()`), never a timer-driven raw DOM `.focus()`.

## Self-update: verifying / driving updates on-device

The self-update panel only works on a **release build**. The on-device dev loop
installs `X.Y.Z+<hash>` **local** builds, which are deliberately non-updatable
(`isLocalBuild`, plus `+build` metadata out-ranks any same-base `-dev.g…`
prerelease), so the panel shows "(Local Build)" and hides Install. To use or test
the updater you must first put the Deck on a real release build:

```bash
# 1. Move off the local build onto a release (Decky's own installer; confirm the
#    on-device prompt). Downgrade is fine — the local +hash build has a higher base.
scripts/deck/install_release.sh v0.3.1

# 2. In the panel, enable "Receive development releases", then Check now. A newer
#    dev prerelease (higher base, or same base + different -dev.g<sha>) is offered.
# 3. Install it and watch the handoff end to end:
scripts/deck/logs.sh tail 200 | grep -iE 'decky:update|handoff|pending|reconcil'
```

A successful cycle logs: `revalidate_success` → `Pending install saved` →
`handoff_start (installer_api=callable)` → `handoff_resolved status=success` →
(Decky uninstalls the old dir) → **`Startup reconciliation: Pending update
promoted`** → a follow-up check reports "already up to date". That promotion line
is the proof the restart + reconcile worked. Do **not** commit to `dev`/`main`
mid-test — the post-commit hook reinstalls a local build over the release one.

**Why local builds use `+<hash>` and published dev builds use `-dev.g<sha>` (kept
distinct on purpose).** They are two deployment paths with different jobs, and the
version scheme is what keeps them honest:

- `+build` is semver **build metadata** — "built from this commit" — and is
  *ignored for precedence*. It correctly describes a working-copy build that may
  not correspond to anything published, and the `+` is the exact signal the panel
  uses to refuse auto-updating it. That protection matters: without it, an
  auto-update could silently overwrite the build you are actively debugging.
- `-dev.g<sha>` is a semver **pre-release identifier** — it *does* affect
  precedence and announces "this is a distributable pre-release." That is only
  true of builds published through CI (`dev-release.yml`).

Aligning the two (stamping local builds `-dev.g<sha>`) would drop the `+` marker,
making local builds auto-updatable, so CI's build of a newer sha could replace the
one on your bench mid-iteration, and two local shas would trigger spurious "update
available" offers. The cost of keeping them distinct is small — you can't test the
updater on a local build, so you install a release build first (`install_release.sh`,
one command). That trade (a rare deliberate step vs. a standing footgun) is why the
schemes stay separate. Only align them for a dedicated always-latest QA device — and
even then, do it by installing published dev prereleases through the updater, not by
changing the local build scheme.

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
