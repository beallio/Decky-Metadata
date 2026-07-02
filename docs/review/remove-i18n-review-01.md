# Review: remove-i18n

## Scope reviewed
Diff `dev..feat/remove-i18n` — `src/i18n.ts` (deleted), `src/index.tsx`,
`src/contextMenuPatch.tsx`, `src/components.tsx`, `src/steam.ts`.

## Findings
- **`src/i18n.ts` deleted**; the `import { t } from "./i18n"` removed from all 4 files.
- **Literal call sites inlined**: all ~192 `t("KEY")` replaced with the exact `STRINGS.en`
  English text. Residue check clean: `grep -rnE "\bt\(\"|from \"./i18n\""` → no matches; no
  remaining `i18n` reference anywhere in `src/`.
- **3 dynamic sites converted** in `components.tsx`:
  - `ACHIEVEMENT_CACHE_LABELS` map → `ACHIEVEMENT_CACHE_LABELS[policy] ?? policy`;
  - `ACHIEVEMENT_SOURCE_LABELS` map → `ACHIEVEMENT_SOURCE_LABELS[source] ?? source`;
  - `retroResolutionMessageKey` now returns the English strings directly (verified), and the
    call site uses it without `t(...)`.
- Minor cosmetic artifact: some inlined strings sit inside pre-existing template literals as
  `${"text"}` — functionally identical output, no behavior change.

## Behavior
No user-visible change (English was the effective language). The `tsc --noEmit` + rollup build
is the completeness guarantee — a missed `t(` would fail to compile.

## Scope discipline
String inlining + 3 dynamic conversions + import removal + file deletion only. No wording
changes, no logic/matching/patch changes, no `main.py`. No stray codemod script committed.

## Gates
`run-quality-gates` green: `tsc --noEmit`, rollup build, `py_compile`, full pytest all pass;
tree clean.

Auto-approved for `dev` per project workflow (dev merges auto-approve; only dev → main is a
human gate).

STATUS: APPROVED
