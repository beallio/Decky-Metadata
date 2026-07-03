# Review — decky-style-scale (round 01)

Branch: `feat/decky-style-scale`
Reviewed against: `docs/plans/2026-07-02_decky-style-scale.md`

## Verdict

The rem→px conversion and tokenization (Task 1 + most of Task 2) are **correct — keep them**.
One required fix: the **Motiva Sans font is not actually applied to the QAM panel**, which is
the plan's central named surface. Fix that, then this is done.

## Gate status (verified by the reviewer)

- `grep -nE "[0-9.]+rem|[0-9.]+em\b" src/components.tsx` → **none**. ✅
- `src/tokens.ts` gains `space` / `fontSize` / `fontWeight` / `fontFamily`; `colors` /
  `statusColor` unchanged. ✅
- Widths converted to exact px (208/224/136/160/144/128/112/288); weights via `fontWeight`. ✅
- `src/steam.ts` untouched. ✅
- Spacing snaps recorded in the session log (incl. the `0.35rem`→`8` / `0.65rem`→`12` nudges). ✅
- Quality gates (tsc + build + pytest) green. ✅

## Required changes

### R1 — Apply `fontFamily` (Motiva Sans) to the QAM `Content`, not only the edit page

`fontFamily` was added to `pageStyle`, but `pageStyle` is used **only** by `MetadataPage`
(`<div style={pageStyle}>`, ~line 784) — the full-screen metadata **edit route**. The QAM
**`Content`** component (~line 330) returns `<PanelSection>…</PanelSection>` and **never
applies `pageStyle` or `fontFamily`**, so the QAM panel's text (stats, buttons, status,
Versions rows) only inherits Motiva Sans by luck in Gaming Mode and has no explicit family in
Desktop mode. The plan titled this "Motiva Sans font" for the QAM and asked that "all QAM text
uses it" — so the primary surface must declare it.

- Apply `fontFamily` to the QAM `Content` surface so all its text declares Motiva Sans. Use
  whichever keeps the layout unchanged:
  - wrap the content that `Content` returns in a single `fontFamily`-carrying element (e.g. a
    `<Focusable style={{ fontFamily, ...focusableBlockStyle }}>` or a layout-neutral
    `<div style={{ fontFamily, width: "100%" }}>` around the `PanelSection` children), **or**
  - add `fontFamily` to the QAM's shared base text styles so every text row inherits it
    (e.g. `compactTextStyle`, `rowStackStyle`, `buttonLabelStyle`, `sectionHeadingStyle`).
- Keep it **DRY** — do not set `fontFamily` inline on many elements. Keep the existing
  `pageStyle` application for `MetadataPage` as-is (that's correct for the edit route).
- **Correct the session log**: it currently states `fontFamily` was applied "through the QAM
  page wrapper," which is inaccurate (that wrapper is the edit page). Update it to describe
  where the QAM actually gets the font.

### R2 — Rebuild + verify

- `./run.sh npm run build`; stage `dist/`.
- Confirm the QAM path now carries `fontFamily` (grep that the font reaches `Content`, not just
  `pageStyle`).

## Not required / accepted

- The px scale, type scale, weight tokens, width conversions, and documented spacing snaps are
  accepted — do not redo them.
- `steam.ts` / the overlay and all colors correctly remain untouched.

STATUS: CHANGES_REQUESTED
