# 2026-07-02 decky-style-tokens

## Task Objective

Implement P1 of Decky Metadata style standardization: add shared semantic color
tokens, replace opacity-faded secondary text with tokenized secondary text, and
color QAM status rows by outcome.

## Files Modified

- `src/tokens.ts`
- `src/components.tsx`
- `dist/index.js`
- `docs/agent_conversations/2026-07-02_decky-style-tokens.md`

## Design Decisions

- Added a framework-free `src/tokens.ts` module exporting the SDH-Ludusavi-aligned
  palette: accent `#1a9fff`, info `#60a5fa`, success `#4ade80`, warning
  `#f59e0b`, error `#f87171`, error icon `#ef4444`, primary text `#f8fafc`,
  secondary text `#cbd5e1`, and surface knockout `#0b151f`.
- Replaced the former `STATUS_BLUE` constant with `colors.accent`.
- Replaced `compactTextStyle` and `diagnosticsValueStyle` opacity styling with
  `colors.textSecondary`. This is an intentional visible change from faded white
  to solid slate, matching the reference palette.
- Added a strictly typed `StatusKind` and pure `statusColor(kind)` mapping:
  active -> accent, success -> success, warning -> warning, error -> error,
  idle -> textSecondary.
- Scan status is active while running, success when all titles are matched, warning
  when any title is unmatched or assigned is less than total, and error when the
  operation fails.
- Activity refresh status is active while running, success on normal completion,
  and error on failure.
- Delisted index status uses active while refreshing and idle/secondary otherwise.
  The underlying delisted status data only distinguishes loaded versus absent in
  this UI, so no success/error distinction was added for P1.

## Validation Results

- Baseline `scripts/orchestration/run-quality-gates` passed before code changes.
- `./run.sh npx tsc --noEmit` passed after the token/status changes.
- `./run.sh npm run build` passed and regenerated `dist/index.js`.
- The repo has no TS/JS test runner; frontend verification for this change is
  `tsc --noEmit`, rollup build, static diff review, and deferred on-device
  Gaming Mode verification.

## Deferred On-Device Checks

- Confirm secondary text reads as solid slate and remains legible in the QAM.
- Confirm active status is blue, successful scan/activity completion is green,
  partial scan completion is amber, and failures are red.
- Confirm layout and spacing are unchanged.
