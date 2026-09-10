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

### Compatibility defaults and Follow Valve

This check changes real plugin settings and may change real shortcut status.
Get explicit approval for the current Deck and disposable fixtures before any
deploy, package push, QAM selection, metadata removal, or shortcut creation.
Capture the native baseline first and restore every fixture and the original
global setting at the end. Use a full package because this feature changes both
the frontend and `main.py`:

```bash
./run.sh scripts/decky doctor --deck
./run.sh scripts/deck/logs.sh audit --json
./run.sh scripts/decky capture
./run.sh scripts/decky package-push --build --push
# Install /home/deck/Downloads/Decky-Metadata.zip with Decky Settings -> Developer -> Install Plugin from ZIP File.
```

Prepare five disposable fixtures: a Steam-ID record with a known Valve
category, an IGN-sourced record with a Steam ID if available, a saved manual or
provider record without a Steam ID, a native shortcut with no metadata record,
and one ordinary Steam game. Record their original packed category and visible
Home/grid/Game Info state. Then, using the real QAM and editor controls:

1. Set global **Verified**. Confirm matched, unmatched, and no-record shortcuts
   show Verified; confirm the ordinary Steam game and its compatibility filter
   membership do not change.
2. Set a matched fixture to **Follow Valve** and confirm it shows its Valve
   category while another shortcut stays Verified. Test unavailable data and
   Valve Unknown; both must use native no-badge/original behavior as applicable.
3. Set one fixed per-game status and confirm changing the global setting only
   changes inheriting shortcuts. Return to Automatic and confirm an unmatched
   inheriting shortcut returns to its captured native baseline.
4. Keep a matched shortcut on **Game Info** with Automatic/Playable, set global
   **Verified**, and close QAM. The active view must remain Playable with rich
   content and links while other eligible shortcuts and their native filter
   membership update. Change tabs and return to confirm Verified. Repeat back
   to Automatic. Closing QAM or a context-menu overlay must not release the
   held value; opening **Decky metadata...** must release it, and a later editor
   Save must take priority. Repeat changes before exit and verify only the
   latest result applies. Navigate from game A to game B, replace/delete only a
   disposable pending fixture, and confirm no state leaks or recreation occur.
5. Verify a shortcut that appears after bootstrap inherits the current default
   once its real native overview exists. Clear only disposable metadata and
   confirm its Activity cleanup and inherited status.
6. With already-mounted Home and grid cards visible, capture Home, grid, and
   Game Info before and after each transition. Check Steam's actual
   compatibility filter or collection membership, not only packed fields.
7. Reload through committed tooling while Game Info has a held update. Confirm
   it remains responsive, keeps links, and applies the current policy only
   after exit. Capture a controlled real unload that clears held work and
   restores baselines. Drive QAM and editor order with `scripts/deck/cdp.py input`,
   `scripts/deck/js/gpfocus_dump.js`, and `scripts/deck/js/focus_order.js`.
8. With a numeric global default active, use **Apply default to**. Verify all
   four choices in order and the complete selected label in narrow QAM. Check
   Steam-matched, saved-no-ID, saved-metadata, and all-shortcuts membership in
   both directions through Steam's compatibility filter or collection, not
   only packed fields. An IGN record with a valid ID belongs to the Steam
   scope. A manual record without an ID belongs to the no-ID scope. A no-record
   shortcut belongs only to all shortcuts. Change a disposable record's ID,
   remove its record, and confirm it moves to the correct fallback. Change the
   scope while Game Info is active and confirm that view holds its value until
   exit. Use controller input to select and cancel both dropdowns; focus must
   return to the dropdown that opened the popup. Set the default to Automatic
   and confirm the selector is unavailable but keeps its value through reload.
   Restore the captured scope and fixtures.

Store screenshots and diagnostics below `/tmp/Decky-Metadata`. Run
`scripts/deck/verify/run_all.sh --no-launch`; run its launch fixture only with
separate current approval. Restore the original setting, records, shortcuts,
and debugger tunnel before recording results.

### Per-game shortcut-name rename and restore

`smoke_shortcut_name.sh` is an explicit, persistent-but-reverted editor smoke.
It uses the visible **Use Steam name** and **Restore original name** controls;
it does not use `SetShortcutName` as the normal test path. It captures the
native name and `sort_as`, confirms the renamed value after a SteamUI reload,
then confirms the exact original value and `sort_as` again after a second
reload. A trap restores the captured native name through Steam's API if an
assertion after arming cleanup fails, verifies the exact original name and
`sort_as`, and reports an explicit cleanup failure if it cannot restore them.
The command stores only app IDs,
booleans, timestamps, and SHA-256 name hashes below `/tmp/Decky-Metadata`.

This smoke changes one real shortcut briefly. Get explicit approval for the
current device and fixture before running it. Do not add it to `run_all.sh`.
First install the complete local ZIP through Decky Loader's **Install Plugin
from ZIP File** UI, then run the known listed fixture with a separate tunnel:

```bash
DECKY_DECK_HOST=steamdeck CDP_PORT=18083 \
  scripts/deck/verify/smoke_shortcut_name.sh \
  2312439508 "Assassin's Creed: Director's Cut Edition"

DECKY_DECK_HOST=steamdeck-legos CDP_PORT=18082 \
  scripts/deck/verify/smoke_shortcut_name.sh \
  2312439508 "Assassin's Creed: Director's Cut Edition"
```

The script fails before mutation unless the app ID is a native shortcut, no
game reports as running, the plugin RPC reports explicit-ID eligibility, the
saved state is initially unmanaged, and the expected Steam name is non-empty
and different. Before each editor and confirmation-modal click, it polls for
up to five seconds. A known unavailable condition reports its specific reason;
an unfinished metadata or modal render reports that it is still loading. The
repository fixture tests run the same smoke command with
bounded fake-CDP transport responses. They cover argument parsing, an equal current/target
preflight, unavailable and delayed editor/modal controls, delayed native observation, and a failed
cleanup request. The emergency cleanup helper calls Steam through its Apps
receiver and preserves the exact captured name, including edge whitespace; no
fixed-error mode is accepted as smoke evidence. After a successful
live run, capture the editor under `/tmp/Decky-Metadata/` and use
`gpfocus_dump.js`, `focus_order.js`, and D-pad input to check initial focus,
visual order, modal cancellation, and focus return to the launching control.

### Library Home artwork identity

For a matched non-Steam shortcut with SteamGridDB artwork, first open Library
Home yourself and confirm the artwork is already present. Do not use this
smoke to navigate, select an item, or reapply artwork. With explicit approval
for the current device, capture a redacted pre-deploy file baseline, deploy the
corrected bundle, then run the identity smoke:

```bash
DECKY_DECK_HOST=steamdeck CDP_PORT=18085 \
  scripts/deck/verify/smoke_artwork_identity.sh --capture-artwork-files \
  2155012430 \
  /tmp/Decky-Metadata/steamgriddb-artwork-compatibility/before-artwork-files.json

DECKY_DECK_HOST=steamdeck CDP_PORT=18085 scripts/deck/deploy.sh

DECKY_DECK_HOST=steamdeck CDP_PORT=18085 \
  scripts/deck/verify/smoke_artwork_identity.sh \
  2155012430 55150 library-home true \
  /tmp/Decky-Metadata/steamgriddb-artwork-compatibility/before-artwork-files.json \
  /tmp/Decky-Metadata/steamgriddb-artwork-compatibility/after-library-home \
  "$SIDEBAR_LABEL_HASH"

DECKY_DECK_HOST=steamdeck CDP_PORT=18085 \
  scripts/deck/screenshot.sh \
  /tmp/Decky-Metadata/steamgriddb-artwork-compatibility/after-library-home/sidebar-icon.png

DECKY_DECK_HOST=steamdeck CDP_PORT=18085 scripts/deck/tunnel.sh down
DECKY_DECK_HOST=steamdeck CDP_PORT=18085 scripts/deck/tunnel.sh status
```

Set `SIDEBAR_LABEL_HASH` to the eight-character lowercase FNV-1a hash of the
affected sidebar row label before running the smoke. Calculate it locally and
do not put the label itself in a command log or evidence directory. The
automated smoke is an identity-and-file evidence check. It requires the
requested shortcut overview and matched-app alias, native shortcut identity on
Library Home, the exact pre/post count and SHA-256 multiset of the shortcut's
existing custom-art files, and valid redacted candidate count/hash shapes.
Candidate URL counts can be zero on a valid fixture. The two redacted manifest
files contain only the shortcut app ID, count, and sorted SHA-256 values, never
paths. The smoke rejects equal shortcut and matched app IDs before it opens a
tunnel or calls CDP.

The bounded direct icon API poll is diagnostic evidence, not the visual
oracle. `iconRequestError` fails the smoke. An error-free unresolved result
(`iconResolved=false`, no value hash) is recorded but does not fail it, because
the API can remain null while Steam renders the real Library Home sidebar icon.
For `library-home`, the smoke also reads the separate Desktop `Steam` page. It
requires the exact current Home entry, exactly one shortcut row matching the
caller-supplied label hash, and a complete positive-size image classified as
data or custom. This Desktop result is the route authority only when
SharedJSContext has no route (`other`); a conflicting SharedJS detail route
fails. Both saved payloads contain only booleans, counts, dimensions, app IDs,
and short hashes. The required user-visible check remains a human confirmation
in Steam Deck Desktop Mode Library Home that the affected shortcut icon is
visible with Decky Metadata enabled.

It never writes or reapplies artwork, changes a plugin setting, navigates,
selects an item, dispatches input, or launches a game. Steam can populate its
in-memory icon-data cache during fixed 250 ms polls for up to 15 seconds; this
is the only expected Steam state change. Inspect the Library Home sidebar and the
Capsule, Wide Capsule, Hero, Logo, logo position, and square-capsule
presentation visually after the smoke. Close and verify the dedicated tunnel
after capturing the screenshot.

## Controller chooser tab persistence

The standalone controller chooser smoke proves the Show All requery without
selecting, previewing, applying, exporting, or saving a layout. It first proves
that the chooser's active store app ID is the requested matched shortcut, then
sets only the in-memory controller-type filter while it issues the same bounded
direct input query as the chooser. The filter remains false through the
post-query DOM snapshot; cleanup restores it and the tab that was active before
the smoke, even after a failure. It does populate Steam's temporary controller
configuration cache, so obtain explicit approval for the **current** device and
start on the current matched shortcut's controller chooser route.

For the verified Space Marine fixtures, deploy first and use separate CDP ports:

```bash
DECKY_DECK_HOST=steamdeck-legos CDP_PORT=18082 scripts/deck/deploy.sh
DECKY_DECK_HOST=steamdeck-legos CDP_PORT=18082 \
  scripts/deck/verify/smoke_controller_tab_persistence.sh \
  3213262460 55150 102 /tmp/Decky-Metadata/controller-layout-tab-preservation/legos.json

DECKY_DECK_HOST=steamdeck CDP_PORT=18083 scripts/deck/deploy.sh
DECKY_DECK_HOST=steamdeck CDP_PORT=18083 \
  scripts/deck/verify/smoke_controller_tab_persistence.sh \
  2155012430 55150 4 /tmp/Decky-Metadata/controller-layout-tab-preservation/steamdeck.json
```

It fails when Community is not selected before and after the direct query, the
chooser signature changes, Community rows are empty, the getter and rendered
counts disagree, the observed controller type does not equal the required
positional argument (`102` for Legion Go S, `4` for Steam Deck), or the original
tab cannot be restored. The query phase accepts either replacement of Steam's
displayed cache entry or a detected in-place observable mutation; Steam currently
uses the latter on both verified hosts. For type `102`, it also requires every
pre-query hash to remain present after the query. Type `4` reports its native
hashes but does not assume that its differently filtered result set is monotonic.
The Big Picture phases require the chooser tab/list state to settle before each
snapshot. The JSON evidence contains only app IDs, controller index/type, filter
booleans, selected tab labels/IDs, counts, elapsed time, and hashed identities.
It is intentionally not part of `run_all.sh`: semantic fixtures do not establish
the required live route and tab. Close the dedicated tunnels after capture.

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

The self-update panel treats `X.Y.Z+<hash>` as a **local** build. A local build
may hand off to a canonical stable release with the same or a newer base version,
but it cannot install a development prerelease. This protects an active
development build from automatic prerelease replacement while giving the device
a direct path back to a published stable release.

To verify the same-base stable handoff:

```bash
# 1. Install a local package whose base matches a published stable release.
./run.sh scripts/decky package-push --build --push

# 2. Install /home/deck/Downloads/Decky-Metadata.zip through:
#    Decky Settings -> Developer -> Install Plugin from ZIP File -> Browse
# 3. Open Decky Metadata and select Check now.
# 4. Confirm "Move to Stable vX.Y.Z", approve Decky's update prompt, then capture.
./run.sh scripts/decky capture
```

The capture must report the installed canonical `X.Y.Z` version without
`+<hash>`. A lower stable release is not offered. A development candidate remains
manual-only while the local build is installed.

To verify a published development-prerelease update, first put the Deck on a real
release build:

```bash
# 1. Move onto a release (Decky's own installer; confirm the on-device prompt).
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
  not correspond to anything published. The `+` marker blocks development-channel
  installation but permits an explicit handoff to a canonical stable release.
- `-dev.g<sha>` is a semver **pre-release identifier** — it *does* affect
  precedence and announces "this is a distributable pre-release." That is only
  true of builds published through CI (`dev-release.yml`).

Do not stamp local builds as `-dev.g<sha>`. That would remove the local-build
marker and let CI's build of another commit replace the build under test. Use a
published release for development-prerelease testing, and use the stable handoff
to leave a local build.

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
