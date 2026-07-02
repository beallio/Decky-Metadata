# Review — decky-metadata-debrand (round 01)

Branch: `feat/decky-metadata-debrand`
Reviewed against: `docs/plans/2026-07-02_decky-metadata-debrand.md`

## Verdict

The **de-brand rename (Tasks 1, 2, 4) is complete and correct — keep it as-is.** Only the
**spinner styling (Task 3)** must be redone, and a **new requirement** (blue status-message
text) is added. Both are described precisely below. Do NOT touch the rename work except where
it overlaps the spinner site in `src/components.tsx`.

## Gate status (verified by the reviewer)

- `grep -rniI "playhub" src/ main.py` → **zero** matches. ✅
- Renamed producer/consumer pairs are internally consistent (spot-checked
  `decky-activity-news-root`, `data-decky-*`, `DECKY_NATIVE_ACTIVITY_WINDOW_KEY` ↔
  `__deckyNativeActivityCache`, and the `"decky_metadata"` activity tag). ✅
- `main.py`: `decky_metadata.json`, `decky-metadata.log`, `DeckyMetadata/0.1` — clean break,
  no migration code. ✅
- `grep -c "playhub" dist/index.js` → **0**. ✅
- Quality gates (tsc + build + pytest) green. ✅

## Required changes

### R1 — Wrong spinner reference. Match `beallio/SDH-Ludusavi`, not GedasFX.

The plan pointed at the wrong repo. The authoritative reference is
**https://github.com/beallio/SDH-Ludusavi** (`src/components/qam/SpinnerButton.tsx`). Its
busy indicator is **Decky's `<Spinner>` tinted Steam-blue**, NOT a rotating `react-icons`
icon. Replace the current `FaCircleNotch` + `.decky-spin` keyframe approach with the fork's:

- Re-add `Spinner` to the `@decky/ui` import in `src/components.tsx`.
- Render the busy indicator as:

  ```tsx
  <Spinner style={{ width: "18px", height: "18px", color: "#1a9fff" }} />
  ```

  (the fork's exact values: 18px, color `#1a9fff`).
- Lay out spinner + label in a flex row matching the fork:
  `display: "flex"; alignItems: "center"; justifyContent: "center"; gap: "10px"`.
- Show the spinner **only while the busy flag is set** (idle = label only, as now). Keep each
  button `disabled` while busy, and keep the button width stable on busy↔idle toggle (retain a
  min-width or equivalent so the label swap doesn't jump).
- Apply to all three sites: the **Scan** button, the **Refresh delisted index** button, and
  the inline `delistedBusy` status-line indicator.
- **Remove the now-dead rotating-icon machinery** once nothing references it (grep first):
  the `FaCircleNotch` import, `spinStyleId` / `ensureSpinStyle` / the `useEffect` that calls
  it / the `.decky-spin` `@keyframes`, `RotatingIcon`, and `actionIconStyle`/`iconStyle` if
  unused. Do not leave orphaned `decky-spin` CSS in the bundle.

### R2 — New: color status-message TEXT Steam-blue (`#1a9fff`) to match the fork.

The fork uses `#1a9fff` as its status accent throughout. Apply that blue to Decky Metadata's
QAM **status-message text** so status lines read as blue like the fork:

- The **Scan status** line (the `{busy || scanMessage ? … : null}` row that shows
  `scanMessage`, including the terminal "Scan complete…" summary).
- The **Activity refresh** status line (`activityMessage`), if it renders a status row.
- The **delisted status** line (`delistedStatusText`, the inline `inlineStatusStyle` row next
  to the refresh-delisted spinner).

Implement with a shared constant (e.g. add `color: "#1a9fff"` to a `statusTextStyle` reused by
these rows, or extend `inlineStatusStyle`/the scan-status span). Keep font size/weight
consistent with the surrounding panel; only the color changes. Exact shade tuning is deferred
on-device, but use `#1a9fff` as the default so it matches the fork.

### R3 — Rebuild + session log.

- `./run.sh npm run build` and stage `dist/` after the changes; confirm `dist/index.js` no
  longer contains the `decky-spin` keyframe (grep) and still has **0** `playhub`.
- Update `docs/agent_conversations/2026-07-02_decky-metadata-debrand.md`: correct the spinner
  reference to `beallio/SDH-Ludusavi`, note the switch from rotating-icon back to Decky
  `<Spinner>` at `#1a9fff`, and record the new blue status-text styling (R2).

## Not required / explicitly accepted

- The rename (Tasks 1/2/4) is accepted — do not redo or "improve" it.
- The clean-break filename decision (no migration) stands.

STATUS: CHANGES_REQUESTED
