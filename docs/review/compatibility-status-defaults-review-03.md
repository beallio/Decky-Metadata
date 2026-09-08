# Review — compatibility-status-defaults (round 03)

Branch: `feat/compatibility-status-defaults`
Reviewed against: `docs/plans/2026-09-07_compatibility-status-defaults.md`

## Verdict

One live controller-navigation correction remains before final validation.
Reviewed HEAD: `75fd2705c86f316baaf3d2e8787c3a44da92aff9`.
The preceding backend fixes passed the orchestrator's actual-method
reproductions: match removal now clears the old category; malformed
same-match responses preserve cached categories 0 and 2. The runtime diff
now guards route/per-app/Activity consumers and retains restoration IDs in
the linear refresh batch.

## Gate status

- The latest recorded local gate passed 27 Vitest files / 457 tests,
  TypeScript, Rollup, Python compilation/pytest, and version checking.
- The Deck currently runs reviewed production version `0.3.14+4581c88`.
  The newest `0.3.14+8d5ab42` package is prepared locally but not installed.
  The QAM focus code is unchanged between these builds, so the live
  finding below applies to the newest candidate too.
- The orchestrator has already observed these live behaviors:
  global Verified on every native shortcut including four without records;
  unchanged regular Steam category fields; matched Follow Valve -> Playable;
  unmatched Follow Valve -> native Unknown; available Valve Unknown -> 0;
  fixed Unsupported and Unknown; metadata removal -> inheritance; and a
  newly created native shortcut inheriting Verified after bootstrap.
- The current non-Steam grid displays the native green Verified indicator
  on a focused inheriting card. Native Steam CSS hides these indicators on
  unfocused cards; this is not a missing-badge defect.
- Evidence root: `/tmp/Decky-Metadata/compat-defaults-live-4wys8ngy/`.
  See `focus-before-menu.log`, `focus-menu-open.log`,
  `focus-menu-cancel.log`, `focus-after-cancel.log`, global/per-game option
  screenshots, and `nonsteam-grid-focused.png`.
- Main continues to own all device actions and final restoration. Do not
  navigate, install, reload, change settings, or launch games during this
  code correction.

## Required changes

### R1 — Restore focus to the global dropdown after its popup closes

The new global dropdown is reachable with D-pad Down from the summary, and
its popup opens in the `Steam Big Picture Mode` window. After either
selecting Verified or pressing B/Escape to cancel, focus returns to
**Detected non-Steam games / Metadata saved / Missing metadata**, not the
launching **Default compatibility status** combobox. This was observed
with committed `cdp.py input` and `gpfocus_dump.js`, not DOM-order inference.

Exact live sequence:

1. Open Decky Metadata in QAM; summary has the intended initial focus.
2. Run `cdp.py input QuickAccess_uid51 down enter` to open the dropdown.
3. Run `cdp.py input "Steam Big Picture Mode" escape` to cancel (or select
   an option with Down/Enter).
4. Run `cdp.py eval QuickAccess_uid51 @scripts/deck/js/gpfocus_dump.js`.
   Actual active element is the summary DIV. Expected active element is
   the Default compatibility status combobox.

Fix the native focus lifecycle so returning from this popup preserves
the launching control. Inspect `ContentPanel.tsx:171-192`: its root ref
callback unconditionally schedules `takePreferredPanelFocus()` and scrolls
to the top whenever the native wrapper attaches the ref. Preserve the
summary's initial focus on a genuinely fresh QAM entry, but do not steal
focus during a dropdown-return/ref refresh or a confirmed-setting update.
Use the existing native focus mechanism, not arbitrary delays, raw DOM
focus timers, or a second navigation system.

Keep cancel non-mutating and retain successful save/failure behavior.
Do not change per-game editor focus, which already returned correctly to
its Compatibility status combobox after selecting Follow Valve.

### Handoff

Fix only this in-scope controller issue, retain all previous corrections,
run the integrated local gate, and prepare the new local ZIP. Record its
version and the code/gate evidence in the session log. Do not claim final
device acceptance; Main will install the final candidate, verify select
and cancel focus return on the live Deck, finish the remaining matrix and
full smoke suite, restore settings/fixtures, and record integration evidence.

Commit, mark the correction round complete, and exit for review. No merge,
release, main promotion, or device mutation by the implementer is authorized.

STATUS: CHANGES_REQUESTED
