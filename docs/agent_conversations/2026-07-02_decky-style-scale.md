# 2026-07-02 Decky Style Scale

## Objective

Implement the Phase 2 QAM style-scale pass from
`docs/plans/2026-07-02_decky-style-scale.md`: add shared px spacing/type/font
tokens, convert `src/components.tsx` away from rem units, apply the Motiva Sans
font stack to the QAM panel, and rebuild the committed frontend bundle.

## Files Modified

- `src/tokens.ts`
- `src/components.tsx`
- `dist/index.js`
- `docs/agent_conversations/2026-07-02_decky-style-scale.md`

## Design Decisions

- Added `space`, `fontSize`, `fontWeight`, and `fontFamily` exports in
  `src/tokens.ts` without changing the existing color tokens or status-color
  mapping.
- Applied `fontFamily` once through the QAM page wrapper style so descendants
  inherit the Motiva Sans stack without repeated inline declarations.
- Converted QAM rhythm values to numeric px token values where the plan called
  for tokenized spacing/type.
- Converted fixed component dimensions and flex-basis values to exact px values
  instead of forcing them onto the spacing scale.
- Kept existing `10px` icon/label gaps unchanged because they were already px
  values from the previous color/status pass and the plan allowed them to stay
  as-is.

## Conversion Notes

- `0.1rem` became `space.xxs` (`2px`, from `1.6px`).
- `0.2rem` became `space.xs` (`4px`, from `3.2px`).
- `0.35rem` became `space.sm` (`8px`, from `5.6px`) for row spacing; this is
  the largest spacing snap and aligns the small vertical gaps with the 4-based
  token scale.
- `0.5rem` became `space.sm` (`8px`, exact).
- `0.65rem` became `space.md` (`12px`, from `10.4px`) for stack and diagnostic
  grid gaps.
- `0.75rem` became `space.md` (`12px`, exact).
- `1.25rem` became exact `20px` instead of `space.xl` (`24px`) to preserve the
  existing result-list rhythm.
- `0.82rem` became `fontSize.sm` (`13px`, from `13.12px`).
- `0.95rem` became `fontSize.lg` (`16px`, from `15.2px`) for section headings.
- Width and component-size conversions were exact px values: `8.5rem` -> `136px`,
  `13rem` -> `208px`, `14rem` -> `224px`, `7rem` -> `112px`, `8rem` -> `128px`,
  `9rem` -> `144px`, `10rem` -> `160px`, and `18rem` -> `288px`.

## Validation

- `./run.sh npx tsc --noEmit` passed.
- `./run.sh npm run build` passed and regenerated `dist/index.js`.
- No TypeScript/JavaScript test runner exists for this frontend surface; the
  automated frontend verification remains TypeScript type-check plus rollup
  build, with final visual confirmation deferred to on-device QAM testing.
