# Review — compatibility-status-defaults (round 07)

Branch: `feat/compatibility-status-defaults`
Reviewed against: `docs/plans/2026-09-07_compatibility-status-defaults.md`

## Verdict

One material live regression prevents integration. Reviewed HEAD:
`869a8df86ec0f3b851006736236cd3e287cf1e8a`; the FULL ZIP
`0.3.14+869a8df` is now installed and its bundle hash matches the checkout.
The final controller-focus fix passed Main's independent checks. However,
changing global compatibility while the matched game's Game Info tab is
already mounted removes its rich details and compatibility panel.

## Gate status

- Full installation proof:
  `/tmp/Decky-Metadata/diagnostics/20260908T022000Z/doctor.json` and
  `/tmp/Decky-Metadata/compat-defaults-live-4wys8ngy/final-full-install.json`.
- Main verified a VISIBLE native popup before cancel/selection, then
  observed the global combobox regain focus. Moving Down afterward selected
  Refresh metadata normally. Logs:
  `accepted-final-confirmed-popup-cancel.json`,
  `accepted-final-after-select.json`, and
  `accepted-final-next-control.json` in the evidence root.
- Main also injected an invalid option value only into the live runtime
  option object for one request, restored that object in finally, and
  observed the real setter reject it while the new QAM widget retained
  Automatic. No persisted setting was changed by this rejection check.
- The earlier full and no-launch Deck suites passed, including actual
  64-bit launch and controller-layout isolation. They did not cover the
  live mounted-Game-Info transition below.
- Before this handoff Main restored global Automatic, verified every
  original packed value and all 18 shortcuts, and confirmed debug_logging
  remains False. No fixture remains. Evidence:
  `pre-details-review-restored-status.json` and
  `restricted/settings-before-details-correction.json`.

## Required changes

### R1 — Preserve rich Game Info during a global compatibility update

Reproduced on the actual full installed build:

1. Global Automatic; shortcut 2312439508 (Assassin's Creed) has no explicit
   override and a matched Valve category of Playable.
2. Navigate to `/library/app/2312439508`, activate **Game Info**, and wait
   for the description/developer/publisher and Steam Deck Compatibility
   panel. Main observed `PLAYABLE`.
3. Leave Game Info mounted. Open QAM, change the global default to Verified,
   wait for the confirmed selection, and close QAM.
4. Game Info remains the selected tab, but the rich section is replaced by:
   `Some detailed information on Assassin's Creed: Director's Cut is unavailable because it is a non-Steam game or mod.`
   The description, developer/publisher fields, and compatibility panel
   disappear. This persists after settling; it is not a loading frame.

Screenshot:
`/tmp/Decky-Metadata/compat-defaults-live-4wys8ngy/mounted-game-info-regression.png`.
The earlier `accepted-game-info-verified.png` proves the same page can
render the injected Verified status when entered normally.

Trace `applyCompatibilityDefault()` / native overview publication in
`src/steam/metadataPatch.ts` and its interaction with the existing rich
render classification / route shield. A global change must preserve the
already-mounted rich page while updating its category. The compatibility-
only batch must not lose metadata-backed rendering, and a no-record
shortcut must still get its default without fabricated metadata.

Fix the source lifecycle/context issue. Do NOT hide the placeholder,
force navigation away/back, reset the selected tab, make shortcuts
permanently claim to be Steam games, or bypass 64-bit launch identity.
Preserve linear global application and baseline restoration. Reuse the
existing scoped render/launch safeguards instead of a parallel spoof.

### Required verification for this focused correction

- Reproduce the failure before changing code, using the actual device.
- With Game Info continuously selected, perform Automatic -> Verified ->
  Automatic. The description, developer/publisher, quick links, and tab
  selection must remain intact; category must change Playable -> Verified
  -> Playable without a manual navigation/reload.
- Also change a default while a no-record shortcut is in the library, and
  confirm the existing default behavior remains without metadata creation.
- Add a meaningful regression where the actual changed render/publication
  boundary can be modeled; do not substitute source text or wiring checks.
- Run the project quality gate and the applicable device suite. Because
  render/classification/overview publication may change, rerun the real
  launch smoke with explicit `MATCHED_APPID=2312439508` and preserve the
  launch truth even during the shield window. Record output.

### Exclusive device ownership and reliable navigation

The external implementer owns the Deck during this round. Main will release
its handles/tunnel before launch. The user's Full validation approval
remains current. Use `CDP_PORT=18088`, `DECKY_DECK_HOST=steamdeck`.
Frontend-only deploy iterations are allowed because all backend code is
already installed; prepare a full ZIP when the corrected code passes.

Avoid blind repeated Down sequences to open Decky. They can select a
notification or an unrelated control when the menu remembers its prior
position. Verified reliable operations:

- In SharedJSContext:
  `SteamUIStore.WindowStore.GamepadUIMainWindowInstance.MenuStore.OpenQuickAccessMenu()`.
  This targets the real main window even when DFL's focused-window wrapper
  would select an overlay/web window.
- In the visible QAM target, activate the actual Decky tab:
  `document.getElementById("quickaccess_tab_999").click()`.
  Inspect the visible panel, use Back if a different plugin is remembered,
  then activate **Decky Metadata** by its visible label.
- The committed `js/click_by_label.js` correctly activates **Game Info**
  (CSS renders its text uppercase). Use it rather than guessing tab state.
- Do not send popup cancel/selection keys until the native popup/listbox is
  visibly present. A premature Escape can close QAM rather than the popup
  and is not valid focus evidence.
- Close QAM with the main window MenuStore's `CloseSideMenus()`; do not
  navigate away from Game Info during the mounted-page test.

Only compatibility settings needed for this test may change. Do not touch
other plugins, clear the user's metadata cache, or recreate removed
fixtures. Restore global Automatic and unchanged per-game choices before
handoff. Capture final screenshots and settings/status proof, close the
dedicated tunnel, record actual results and package version in the session
log, commit, mark the round complete, and exit. Do not merge or release.

STATUS: CHANGES_REQUESTED
