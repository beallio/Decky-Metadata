# Plan: P3: unify overlay accent and adopt Field in the metadata editor (decky-field-accent)

## Context

Decky Metadata (Decky plugin: TS/React `src/*` → `dist/index.js`, Python `main.py`) is being
standardized against `beallio/SDH-Ludusavi`. P1 added semantic color tokens + state-colored
status; P2 added the px spacing/type scale + Motiva Sans on the QAM. This is **Phase 3 (P3)**,
the audit's final styling pass, scoped to two decided items:

1. **Unify the overlay accent.** The in-game activity overlay (`src/steam.ts`) uses a stray
   lighter blue `rgba(90, 170, 255, 0.85)` (≈ `#5aaaff`) for its card border, instead of the
   design-system accent `#1a9fff` (= `rgb(26, 159, 255)`). Route it through the token module so
   the overlay's accent matches the rest of the plugin.
2. **Adopt `@decky/ui` `Field` in the metadata editor.** The `MetadataPage` edit form builds
   labeled inputs with manual `<label>{...}</label> <TextField style={fieldStyle}/>` pairs. The
   reference plugin uses `Field`/`ToggleField` for labeled rows; adopt `Field` for the editor's
   **simple single-input labeled rows** to converge on the idiomatic component.

**Decided exclusions (do NOT do):** do **not** convert the inline action buttons to `ButtonItem`
— there are ~31 `FocusableButton`/`DialogButton` sites in **inline (side-by-side) button rows**,
and `ButtonItem` is a full-width single-action control that would regress those rows. Keep
`FocusableButton` for buttons and record this decision in the session log. Do not touch the QAM
panel spacing/type (P2 is done), colors beyond the accent unification, or `main.py`.

### Relevant files

`src/tokens.ts` (add an accent-rgba helper), `src/steam.ts` (use it for the overlay accent),
`src/components.tsx` (`MetadataPage` → `Field` for simple labeled rows), `dist/index.js`
(rebuilt), `docs/agent_conversations/`.

**Test infra note:** no TS/JS test runner (frontend gate = `tsc` + rollup build). New token
helper is pure; verification is `tsc` + build + on-device. Do not add a JS test framework.

**Slug used throughout this plan:** `decky-field-accent`

---

## Orchestration Contract

**Slug:** `decky-field-accent`

**Plan file:**

```text
docs/plans/2026-07-02_decky-field-accent.md
```

**Implementation branch:**

```text
feat/decky-field-accent
```

**Round-complete marker:**

```text
/tmp/Decky-Metadata/decky-field-accent_finished
```

**Finalized marker:**

```text
/tmp/Decky-Metadata/decky-field-accent_finalized
```

**Review notes:**

```text
docs/review/decky-field-accent-review-*.md
```

Each review note ends with exactly one status trailer:

```text
STATUS: CHANGES_REQUESTED
```

or:

```text
STATUS: APPROVED
```

---

## Required Agent Protocol

1. Use the **implementer** skill.
2. Work from the repository root.
3. Branch from `dev`.
4. Commit this plan as the first commit on the implementation branch.
5. Follow TDD where behavior changes are testable.
6. Run quality gates before marking any round complete.
7. Do not write your own review.
8. Do not create files under `docs/review/`.
9. Do not delete files under `docs/review/`.
10. Review notes are durable audit records and must be committed.
11. Resolving a review note means:
    - implement the requested changes;
    - run quality gates;
    - commit the code/docs changes;
    - commit the review note itself if it is not already committed;
    - recreate the round-complete marker.
12. After finalization, stop polling and exit cleanly.

---

## Scope discipline

- Implement only the units the plan lists. Do not modify files outside the plan's scope.
- Do not change runtime behavior beyond what the plan specifies. A `refactor` or
  `cleanup` commit must preserve observable behavior.
- Never edit a test's expected value to make a behavior change pass. If a test
  legitimately must change, that change must be required by the plan or a review
  note, and you must record the rationale in the session log.
- If you spot an unrelated improvement, do not make it here — note it in the
  session log for a separate plan.

---

## Setup

Start from `dev`:

```bash
git checkout dev
# ORCH_LOCAL_ONLY: local trial branch, skipping origin pull
git checkout -b feat/decky-field-accent
```

Commit this plan first:

```bash
git add docs/plans/2026-07-02_decky-field-accent.md
git commit -m "docs(plan): add decky-field-accent implementation plan"
```

---

## Implementation Tasks

Work in order via `./run.sh`. Locate code by symbol. Keep additions pure/typed; verify with
`tsc` + build + on-device.

### Task 1 — Unify the overlay accent through the token module

- In `src/tokens.ts`, add a helper that produces the accent as rgba (the overlay CSS needs an
  alpha), derived from the existing accent `#1a9fff` = `rgb(26, 159, 255)`:

  ```ts
  // #1a9fff as rgb components, for CSS that needs alpha (e.g. the overlay).
  export const accentRgb = "26, 159, 255";
  export const accentRgba = (alpha: number): string => `rgba(${accentRgb}, ${alpha})`;
  ```

- In `src/steam.ts`, the activity-overlay style string (`ensureDeckyActivityStyle` /
  `.decky-activity-news-root.is-fixed` block, ~line 2383) contains
  `border: 2px solid rgba(90, 170, 255, 0.85);`. Import `accentRgba` from `./tokens` and
  replace the literal with `${accentRgba(0.85)}` (preserving the `2px solid` and the `0.85`
  alpha). The rendered color changes from `#5aaaff` to the token `#1a9fff` at 0.85 alpha.
- Grep `src/steam.ts` for any other stray accent-blue literals of the same intent
  (`90, 170, 255`, `5aaaff`) and route them through `accentRgba` too. Do NOT touch the neutral
  white/dark `rgba(...)` values — only the blue **accent**.

### Task 2 — Adopt `@decky/ui` `Field` for the editor's simple labeled rows

In `src/components.tsx`, the `MetadataPage` edit form renders labeled inputs as manual
`<label>{"…"}</label>` + `<TextField … style={fieldStyle} />` pairs inside `rowStackStyle` /
`flexFieldStyle` wrappers (Title, Developers, Publishers, Genres, SteamGridDB id, etc.).

- Import `Field` from `@decky/ui` (alongside the existing `TextField`/`ToggleField`).
- Convert the **simple single-input labeled rows** (one label + one `TextField` filling the
  row) to the idiomatic form: `<Field label={"Publishers"}><TextField … /></Field>` (or
  `<Field>`'s standard label placement), removing the now-redundant manual `<label>` and the
  per-row `rowStackStyle` wrapper where `Field` supplies the row. Keep each `TextField`'s
  `value`/`onChange` intact.
- **Compound rows** — leave the multi-input side-by-side rows (e.g. the `buttonRowStyle` row
  holding **Release date** + **Rating**, and the **Steam App ID** row that pairs a field with a
  `FocusableButton`) **as they are** (do not force them into `Field`, which is full-width and
  would restack/derange them). Note in the session log which rows were converted and which were
  intentionally left compound.
- Keep `ToggleField` usages as-is (already idiomatic). Do **not** convert any button to
  `ButtonItem`. Do not change the QAM `Content` panel (P2 owns it) — Task 2 is the editor route
  only.
- The editor's simple rows will adopt `Field`'s standard label/spacing look; this is the intended
  convergence (deferred on-device verification).

### Task 3 — Rebuild bundle + session log

- `./run.sh npm run build`; stage `dist/`.
- Record `docs/agent_conversations/2026-07-02_decky-field-accent.md`: the accent unification (old
  `#5aaaff` → token `#1a9fff`), the `Field` adoption (which rows converted vs left compound), the
  explicit decision to keep `FocusableButton` (ButtonItem unfit for inline rows), and the
  no-TS-test-runner note.

### Scope discipline

P3 = overlay accent unification + editor `Field` adoption only. Do NOT: convert buttons to
`ButtonItem`, touch the QAM panel spacing/type/colors (P1/P2 done), change `main.py`, or alter
matching/overlay behavior beyond the one accent color. Preserve behavior; the intended visual
changes are the overlay accent color and the editor's simple-row labels.

---

## Quality Gates

Run before marking any round complete:

```bash
scripts/orchestration/run-quality-gates
scripts/orchestration/check-review-notes-not-deleted
git status --short
```

The round is not complete unless:

1. all requested implementation work is done;
2. all relevant tests pass;
3. build/typecheck gates pass;
4. review notes have not been deleted;
5. the working tree is clean;
6. all code/docs changes are committed.

---

## Verification

Automated (run via `./run.sh`):

```bash
./run.sh npx tsc --noEmit                       # no type errors
./run.sh npm run build                          # dist/index.js regenerated
./run.sh uv run --with pytest -- pytest -q       # backend suite still green (unchanged)
scripts/orchestration/run-quality-gates
git status --short                               # clean
```

Grep/scope gates:

```bash
# Overlay accent unified — no stray light blue remains:
grep -nE "90, ?170, ?255|5aaaff" src/steam.ts                  # expect none
grep -nE "accentRgba|accentRgb" src/tokens.ts src/steam.ts     # helper defined + used
# Field adopted in the editor; buttons NOT converted:
grep -nE "\bField\b" src/components.tsx | head                 # Field import + usage
grep -nE "ButtonItem" src/components.tsx                        # expect none
# Scope guards:
git diff --name-only dev..HEAD -- main.py                       # expect empty
```

Static review of the diff:

- Task 1: `tokens.ts` has `accentRgba`; `steam.ts` overlay border uses `accentRgba(0.85)`
  (renders `#1a9fff` @ .85), no `90,170,255`/`5aaaff` left; neutral rgba values untouched.
- Task 2: `MetadataPage` simple labeled rows use `<Field>`; compound rows (Release date+Rating,
  Steam App ID + button) intentionally unchanged; no `ButtonItem`; QAM `Content` untouched.

### Deferred verification — on-device (cannot run here)

Rebuild from `dev`, `npm run package`, reinstall via Decky Developer Mode, then confirm:

1. The in-game activity overlay card border is the standard Steam-blue accent (matches the QAM),
   not the lighter blue.
2. The metadata editor's labeled fields render cleanly with the standard `Field` look; the
   compound Release-date/Rating and Steam-App-ID rows still lay out as before; all inputs still
   edit and save correctly.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished decky-field-accent
```

This writes:

```text
/tmp/Decky-Metadata/decky-field-accent_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer decky-field-accent`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/decky-field-accent-review-*.md
```

When a review note exists or a new review note appears:

1. Read the full review note.
2. If the note ends with:

   ```text
   STATUS: CHANGES_REQUESTED
   ```

   then resume work.

3. Clear the round-complete marker:

   ```bash
   scripts/orchestration/clear-finished decky-field-accent
   ```

4. Address every requested change.
5. Run quality gates:

   ```bash
   scripts/orchestration/run-quality-gates
   scripts/orchestration/check-review-notes-not-deleted
   ```

6. Commit code/docs fixes.
7. Commit the review-note file itself if it is not already committed:

   ```bash
   git add docs/review/decky-field-accent-review-*.md
   git commit -m "docs(review): record decky-field-accent review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished decky-field-accent
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer decky-field-accent` after the next review note is created.

---

## Approval Handling

If the latest review note ends with:

```text
STATUS: APPROVED
```

then:

1. Confirm every previous review item has been addressed.
2. Confirm all review notes are committed:

   ```bash
   scripts/orchestration/check-review-notes-committed decky-field-accent
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize decky-field-accent
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Decky-Metadata/decky-field-accent_finalized
   ```

6. Stop polling and exit cleanly.

---

## Review Rules

Do not write your own review.

Do not create files under:

```text
docs/review/
```

Do not delete files under:

```text
docs/review/
```

Only the orchestrator writes review notes. Your job is to read them, resolve them, commit them as audit records, and continue the loop.

---

## Finalization Rules

Only finalize after a review note with:

```text
STATUS: APPROVED
```

Finalization is performed with:

```bash
scripts/orchestration/finalize decky-field-accent
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Decky-Metadata/decky-field-accent_finished
/tmp/Decky-Metadata/decky-field-accent_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
