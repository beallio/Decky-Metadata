# 2026-07-02 - decky-field-accent

## Objective

Implement P3 of the Decky Metadata styling alignment plan: unify the in-game
activity overlay accent with the shared token color and adopt Decky's `Field`
component for simple metadata editor rows.

## Files Modified

- `src/tokens.ts`
- `src/steam.ts`
- `src/components.tsx`
- `dist/index.js`
- `docs/plans/2026-07-02_decky-field-accent.md`
- `docs/agent_conversations/2026-07-02_decky-field-accent.md`

## Design Decisions

- Added `accentRgb` and `accentRgba(alpha)` to `src/tokens.ts`, deriving alpha
  variants from the shared accent `#1a9fff`.
- Changed the activity overlay debug card border from the stray light blue
  `#5aaaff` equivalent (`rgba(90, 170, 255, 0.85)`) to
  `accentRgba(0.85)`, preserving the existing alpha and border width.
- Converted the metadata editor's simple single-input `TextField` rows for
  `Title`, `Developers`, and `Publishers` to `Field` labels.
- Left `Description` unchanged because it is a textarea, not a simple
  single-input `TextField` row.
- Left the compound `Release date` + `Rating` row and the `Steam App ID` +
  `Apply Steam App ID` button row unchanged to preserve their side-by-side
  layout.
- Kept `FocusableButton` / `DialogButton` for inline action rows. `ButtonItem`
  is a full-width single-action control and is not appropriate for the existing
  inline button layouts.
- Did not add a TypeScript/JavaScript test runner; this frontend has no JS test
  harness, so verification is type-check, rollup build, and deferred on-device
  inspection.

## Validation

- `scripts/orchestration/run-quality-gates` passed before implementation.
- `./run.sh npx tsc --noEmit` passed.
- `./run.sh npm run build` passed and regenerated `dist/index.js`.

## Deferred Verification

On device, confirm the activity overlay border now matches the standard
Steam-blue accent and that the metadata editor's converted fields render with
Decky's standard `Field` layout while compound rows remain side-by-side.
