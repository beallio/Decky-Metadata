# Review — compatibility-status-defaults (round 05)

Branch: `feat/compatibility-status-defaults`
Reviewed against: `docs/plans/2026-09-07_compatibility-status-defaults.md`

## Verdict

The final candidate still fails the actual global-dropdown focus-return
check. Reviewed HEAD: `0df9c21417aa25e0a86a8821530ab37ab4784792`;
installed production version: `0.3.14+cae8568`.
Do not accept the per-mounted-root focus guard as sufficient: the actual
native popup/QAM return still selects the summary instead of the dropdown.

## Gate status

- The user restored Deck access. Capture
  `/tmp/Decky-Metadata/diagnostics/20260908T002825Z/doctor.json` confirms
  installed `0.3.14+cae8568`; the runtime has 19 shortcuts and no running game.
- With this exact installed candidate, Main drove D-pad Down/Enter from
  the QAM summary to open the global dropdown, then Escape in the Big
  Picture popup. `final-focus-after-cancel.log` still reports the summary
  DIV as activeElement, not a combobox.
- Evidence is under
  `/tmp/Decky-Metadata/compat-defaults-live-4wys8ngy/`:
  `final-focus-initial.log`, `final-focus-open.log`,
  `final-focus-cancel.log`, `final-focus-after-cancel.log`.
- The no-launch device suite passed on this candidate:
  quick-links, zero re-render cache writes, correct empty community
  fallback, and controller-layout identity/search isolation. Evidence:
  `/tmp/Decky-Metadata/verification/compat-defaults-final-nolaunch/`.
  The explicit launch check is still pending.

## Required changes

### R1 — Restore the global control across the real native popup return

The `initialPanelFocusComplete` useRef avoids repeated imperative focus
within one mounted panel, but it does not solve the native popup return.
The observed return still uses the preferred summary entry. A component
remount or native preferred-entry selection can occur across the QAM and
Big Picture windows; do not infer that a same-ref unit fixture models it.

Use the supported dropdown lifecycle and a bounded, one-shot return-focus
intent that survives the popup/QAM transition, then resolve the intended
global combobox through the existing native gamepad-focus mechanism when
the QAM content is available. A genuine fresh QAM entry must still begin
at the summary. Clear return intent on consumption and plugin teardown so
it cannot leak into a later unrelated entry. Selection and cancellation
must both return to the launching control, without changing cancel/save
semantics or per-game editor focus.

Verified API evidence:
`node_modules/@decky/ui/src/components/Dropdown.tsx:24-35` exposes
`onMenuWillOpen(showMenu: () => void)` and `onMenuOpened()`.
Use established APIs and inspect their native behavior before choosing the
implementation. Do not add a raw DOM focus timer, endless polling, or
another implementation-call-count test.

Main continues to own the device. Implement the bounded correction,
run the local gate, produce a new ZIP, and report its version. Do not
navigate, install, reload, or modify the Deck yourself. Mark the code
round complete and exit; Main will install it and repeat the actual
select/cancel focus test before acceptance.

STATUS: CHANGES_REQUESTED
