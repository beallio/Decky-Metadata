# 2026-07-03 qam-controller-scroll

## Objective

Make the QAM top stats block and bottom Versions block reachable by controller directional
navigation in Gaming Mode.

## Files Modified

- `src/components.tsx`
- `dist/index.js`
- `tests/test_qam_controller_scroll.py`

## Design Notes

- CDP inspection on-device confirmed that the QAM scroll container and focus auto-scroll behavior
  are working. Directional controller navigation skips pure-display `Field`s with no actionable
  child focusables, so focus never reaches the top stats block or bottom Versions block.
- The top stats block is now its own `PanelSection` containing one `PanelSectionRow` and one
  navigable `Field`.
- The bottom Versions block is now its own `PanelSection title="Versions"` containing one
  `PanelSectionRow` and one navigable `Field`.
- Both display blocks match the SDH-Ludusavi fork props exactly:
  `focusable={true} highlightOnFocus={true} childrenLayout="below" padding="standard" bottomSeparator="none"`.
- The Debug Logging toggle keeps `highlightOnFocus={false}` because that styling is unrelated to
  the pure-display field focus issue.
- Displayed values, button behavior, backend code, `MetadataPage`, and `src/steam.ts` are unchanged.

## Validation

- Added `tests/test_qam_controller_scroll.py` to guard the QAM display blocks' section structure
  and exact navigable `Field` props.
- The controller navigation behavior itself requires human on-device verification: sideload/reload
  the plugin, open QAM, then use the controller to move up to the stats block and down to the
  Versions block. Focus should land on both blocks and scroll the panel to the top/bottom.
