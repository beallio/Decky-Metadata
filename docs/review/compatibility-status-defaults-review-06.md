# Review — compatibility-status-defaults (round 06)

Branch: `feat/compatibility-status-defaults`
Reviewed against: `docs/plans/2026-09-07_compatibility-status-defaults.md`

## Verdict

The actual popup-return check still fails on installed
`0.3.14+0a4ac3c` (reviewed HEAD
`61421148903ff04d72d7498cc7ad1678cc22acbb`). Stop treating mock native
nodes/ref callbacks as proof. This round must investigate and verify the
real QAM transition on the Deck before returning.

## Gate status

- Capture `/tmp/Decky-Metadata/diagnostics/20260908T005129Z/doctor.json`
  confirms installed `0.3.14+0a4ac3c`.
- `popup-candidate-after-cancel.log` under
  `/tmp/Decky-Metadata/compat-defaults-live-4wys8ngy/` again reports the
  summary DIV rather than the global combobox.
- Main observed the real QAM transition: while the popup is open the QAM
  document is hidden, its old combobox is disconnected, and no combobox is
  present; after cancel the document is visible and a new combobox exists.
  See `native-popup-visible-state.log` and `native-popup-return-state.log`.
- Native runtime source was captured to
  `native-dropdown-class.txt`, `native-dropdown-wrapper.json`, and
  `native-dropdown-lifecycle.json` in that evidence directory.
- Main completed BOTH device suites with explicit
  `MATCHED_APPID=2312439508`: no-launch controller checks passed, and the
  full suite launched/terminated the game using its 64-bit game ID.
  Evidence directories:
  `/tmp/Decky-Metadata/verification/compat-defaults-final-nolaunch/` and
  `/tmp/Decky-Metadata/verification/compat-defaults-final-launch/`.
- Controlled Loader `unloadPlugin` (without restarting Steam) restored the
  four known no-record native baselines. Reimport reapplied the saved
  categories exactly. See `final-controlled-unload-restoration.json` and
  `final-policy-after-controlled-reload.json`.
- **All earlier temporary changes are restored.** `restoration-result.json`
  confirms original 18 shortcuts, 14 metadata records, all original packed
  status values, global Automatic, original overrides null/null/2 for the
  three edited games, and removal of disposable shortcut 3168609012.
  Do not recreate these fixtures or redo destructive cache work.
- Main removed its diagnostic reference and released all browser handles
  and its port-18087 tunnel.

## Required changes

### R1 — Fix the real native popup lifecycle, not the fake ref sequence

The real Steam Dropdown `ToggleMenu()` is:

```text
if (this.props.onMenuWillOpen &&
    0 == this.props.onMenuWillOpen(this.ShowMenu)) return;
this.ShowMenu();
```

The new handler in `MetadataSection.tsx:93-96` calls `showMenu()` and
returns undefined, so native ToggleMenu then calls ShowMenu again. The
local type declaration does not describe this return-value contract.
Arm intent and let native ToggleMenu open once, or explicitly suppress its
second call if using the supplied callback. Do not infer runtime behavior
from the SDK interface alone.

The native class also implements HideMenu with a setState callback that
focuses its old input. The QAM content actually unmounts while hidden and
returns with a new input, so that old-input focus is not sufficient.
The current root-frame path consumes return intent before checking whether
the new native control is enabled/registered or whether BTakeFocus
succeeded. Investigate the actual return timing and correct it using the
existing native focus mechanism and real readiness/visibility transitions.
In particular, QAM local loaded state starts false on remount even when the
shared setting is already confirmed; do not consume an intent on a
temporarily disabled control. A failed early focus attempt must not
silently fall through to the summary.

Preserve initial summary focus on a genuine fresh entry. Make both cancel
and selection return to the global combobox. Clear intent on consumption,
abandonment, and plugin teardown. No raw DOM focus timers, endless polling,
or unrelated navigation changes.

### R2 — Remove the reintroduced mock-echo focus tests

The new test at `ContentPanel.updateSettings.test.tsx:275-332` still uses
always-successful fake `BTakeFocus` functions and asserts call counts.
The new `MetadataSection.test.tsx` only asserts forwarded callback order
and forwarded option data; it neither selects nor cancels a real popup.
These are the same implementation-pinning tests rejected previously.
Remove them and their test-only scaffolding; do not replace them with
another wiring assertion. Keep meaningful existing settings, persistence,
error, lifecycle, and policy tests. Native select/cancel behavior is now
proved by the live check below.

### Exclusive live-device authorization for THIS focused round

Ownership now transfers to the external implementer for the Deck. Main
will make no device calls until the new marker. The user's Full validation
approval remains current. Use a dedicated `CDP_PORT=18088` and
`DECKY_DECK_HOST=steamdeck`.

You may build and run `scripts/deck/deploy.sh` for these frontend-only
focus iterations: all backend changes are already installed and match
the checkout, so the missing local-ZIP GUI skill is NOT a blocker here.
The committed deploy script performs the required CEF cache-busting
reload. Do not install or alter any unrelated plugin.

Use the committed `scripts/deck/cdp.py` and native probes:

1. Open QAM in the actual Gaming Mode window. `DFL.Navigation` targets the
   focused native window. If needed, navigate to `/library/home` first.
   The active targets currently include `Steam Big Picture Mode`,
   `SharedJSContext`, and `QuickAccess_uid51`; re-list after reload rather
   than assuming the suffix remains fixed.
2. QAM initially selects Notifications. Six Down keys and Enter on the
   QAM target reach Decky. Its last-opened plugin can be CSS Loader;
   use only the Back button to reach the plugin list, then open Decky
   Metadata. Do not change CSS/theme settings.
3. On a fresh Metadata entry, capture summary initial focus. Down/Enter
   on the QAM target opens the global popup in Big Picture. Escape on
   Big Picture cancels. Capture QAM `gpfocus_dump.js`: activeElement must
   be the combobox, not the summary.
4. Repeat and select Verified. Wait for the save result and capture focus
   on the combobox. Open it again and restore Automatic; verify focus and
   persisted/runtime Automatic. No per-game changes or fixture creation
   are needed for this focused round.
5. Verify a later genuinely fresh Metadata entry starts at the summary
   rather than leaking the old popup intent. Capture screenshots and
   `gpfocus_dump.js` output below `/tmp/Decky-Metadata`.

For runtime source inspection, use `window.DFL.Dropdown.toString()` and
`DropdownItemInternal.toString()` in SharedJSContext. The bound prototype
methods stringify as native code, but the class source contains their
real bodies. DOM React properties must be read in the page's MAIN realm
via CDP eval, not an isolated ElementHandle world; inspect only bounded
React/native-focus nodes and never enumerate MobX app stores in a render
walk.

If a candidate fails, capture the actual result, identify the cause, and
continue this same round. Do not mark another round complete merely on
local test green while the authorized live focus check still fails.

### Final handoff

After real select/cancel/fresh-entry focus passes, run the integrated local
gate, prepare the complete local ZIP, record its version and live evidence
in the session log, restore global Automatic, close the dedicated tunnel,
commit, and mark the round complete. Main will verify the result and handle
the final full-package installation/integration. Do not merge, release, or
promote main. The completed feature scenarios and existing evidence remain
in scope; this is a focused final correction, not a scope reduction.

STATUS: CHANGES_REQUESTED
