# Plan: Decky Metadata QAM px scale, type scale and Motiva Sans font (P2) (decky-style-scale)

## Context

Decky Metadata (Decky plugin: TS/React `src/*` → `dist/index.js`, Python `main.py`) is being
standardized against `beallio/SDH-Ludusavi`. **Phase 1 (already merged)** added a semantic
color token module (`src/tokens.ts`) and state-colored status. A style audit's **Phase 2 (P2)**
remains: the QAM panel mixes spacing/type **units** (rem) while the reference uses **px**, and
the panel sets **no font-family** (the fork uses "Motiva Sans"). This plan finishes P2 for the
QAM surface.

Measured scope: `src/components.tsx` has **19 `rem` values and 0 `em`**; the large `em`/`rem`
counts elsewhere live in `src/steam.ts` (the in-game activity overlay), which is a **different
surface with tuned absolute positioning** and is **explicitly out of scope** here.

### Intended outcome (low-risk unit + token + font pass)

1. Extend `src/tokens.ts` with a **px spacing scale**, **px type scale**, **font-weight tokens**,
   and a **font-family stack** (`"Motiva Sans", Arial, sans-serif`), aligned with the reference.
2. Convert every `rem` in `src/components.tsx` to **px** and route spacing/type through the new
   tokens; set the Motiva Sans stack on the panel's text.

This is a **unit conversion + tokenization**, *not* a spacing redesign. Convert each rem to its
px equivalent (1rem = 16px). Where the result is within ~2px of a scale step, snap to the token;
otherwise use the exact rounded px. Only such small snaps may change pixels — record any snap
that visibly shifts spacing in the session log. No layout/structure changes.

### Relevant files

`src/tokens.ts` (new scale/type/weight/font tokens), `src/components.tsx` (adopt them; rem→px),
`dist/index.js` (rebuilt), `docs/agent_conversations/`.

**Out of scope:** `src/steam.ts` / the overlay, any color changes (P1 owns colors), component
swaps (`ButtonItem`/`Field` are P3), the overlay accent unification (P3), base-version bump, and
any restructure of the panel. Colors keep coming from `colors` (P1); do not alter them.

**Test infra note:** no TS/JS test runner exists (frontend gate = `tsc` + rollup build). The new
tokens are pure constants; verification is `tsc` + build + on-device. Do not add a JS test
framework. Record this in the session log.

**Slug used throughout this plan:** `decky-style-scale`

---

## Orchestration Contract

**Slug:** `decky-style-scale`

**Plan file:**

```text
docs/plans/2026-07-02_decky-style-scale.md
```

**Implementation branch:**

```text
feat/decky-style-scale
```

**Round-complete marker:**

```text
/tmp/Decky-Metadata/decky-style-scale_finished
```

**Finalized marker:**

```text
/tmp/Decky-Metadata/decky-style-scale_finalized
```

**Review notes:**

```text
docs/review/decky-style-scale-review-*.md
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
git checkout -b feat/decky-style-scale
```

Commit this plan first:

```bash
git add docs/plans/2026-07-02_decky-style-scale.md
git commit -m "docs(plan): add decky-style-scale implementation plan"
```

---

## Implementation Tasks

Work in order via `./run.sh`. Locate code by symbol. No TS test runner exists, so keep additions
pure/typed; verify with `tsc` + build + on-device.

### Task 1 — Extend `src/tokens.ts` with spacing/type/weight/font tokens

Add these exports alongside the existing `colors`/`statusColor` (keep everything in this one
module; do not touch `colors`):

```ts
// Spacing scale — px (4-based), aligned with SDH-Ludusavi's px spacing.
export const space = {
  xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32,
} as const;

// Type scale — px, matching the reference (12 / 13 / 14 / 16 / 20).
export const fontSize = {
  xs: 12, sm: 13, md: 14, lg: 16, xl: 20,
} as const;

export const fontWeight = {
  regular: 400, medium: 500, semibold: 600, bold: 700, heavy: 800,
} as const;

// Steam's UI face; Gaming Mode already uses it, set explicitly for parity/Desktop.
export const fontFamily = '"Motiva Sans", Arial, sans-serif';
```

### Task 2 — Convert `src/components.tsx` from rem to px + adopt the tokens

Replace **every** `rem` literal in `components.tsx` with px (1rem = 16px). Prefer a token when
the px value is within ~2px of a scale step; otherwise use the exact rounded px number. Apply the
Motiva Sans stack and weight tokens. Concretely:

- **Spacing / padding / gap** (snap to `space` where close):
  - `0.1rem`→`space.xxs` (2) · `0.2rem`→`space.xs` (4, from 3.2) · `0.35rem`→`space.sm` (8, from
    5.6 — nudge up; note it) · `0.5rem`→`space.sm` (8) · `0.65rem`→`space.md` (12, from 10.4 —
    nudge; note) · `0.75rem`→`space.md` (12) · `1.25rem`→`space.xl` (24, from 20 — or use exact
    `20`; prefer exact `20` if the extra 4px changes rhythm, record choice) · existing `10px`
    gaps (from P1) stay as-is or map to nearest token.
  - Any judgment call that visibly shifts spacing (e.g. 0.65rem→12) must be listed in the session
    log; if a snap looks wrong, keep the exact px instead.
- **Type sizes** (route through `fontSize`):
  - `0.82rem`→`fontSize.sm` (13, from 13.1) · `0.95rem`→`fontSize.lg` (16, from 15.2 — heading
    nudged up 1px) or exact `15` if you prefer no change (record it).
- **Font weight** (route through `fontWeight`): existing `700` → `fontWeight.bold`. Do not
  over-bolden; keep 700 unless a value already matches another token.
- **Layout widths** (flex-basis / minWidth / fixed widths — convert to exact px, these are
  component sizes, not rhythm; do NOT force onto `space`): `8.5rem`→`136` · `13rem`→`208` ·
  `14rem`→`224` · `7rem`→`112` · `8rem`→`128` · `9rem`→`144` · `10rem`→`160` · `18rem`→`288`.
- **Font family**: declare `fontFamily` on the panel's shared text so all QAM text uses it
  (DRY) — add `fontFamily` to the base text style constant(s) such as `compactTextStyle` and the
  heading style, or a single top-level wrapper style applied in `Content`. Do not set it 19 times
  inline.
- After the pass, **no `rem` or `em` remains** in `components.tsx`, and spacing/type values come
  from `space`/`fontSize`/`fontWeight` (with a few exact-px exceptions for widths/odd values).

Do not change colors (P1), structure, `Focusable` wrappers, or the status logic.

### Task 3 — Rebuild bundle + session log

- `./run.sh npm run build`; stage `dist/`.
- Record `docs/agent_conversations/2026-07-02_decky-style-scale.md`: the tokens added, the
  rem→px conversion approach, every spacing snap that shifted pixels (and why), the Motiva Sans
  application point, and the no-TS-test-runner note (tsc + on-device).

### Scope discipline

Unit + token + font only, QAM panel only. Do NOT touch `src/steam.ts`, change any color, swap
components, restructure the panel, or bump the version. Preserve layout/behavior; the only
intended pixel movement is small token snaps, each recorded.

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
# No rem/em remain in the QAM file:
grep -nE "[0-9.]+rem|[0-9.]+em\b" src/components.tsx            # expect none
# New tokens exist and are used:
grep -nE "space|fontSize|fontWeight|fontFamily" src/tokens.ts   # present
grep -nE "space\.|fontSize\.|fontFamily" src/components.tsx      # adopted
# Font family declared:
grep -n "Motiva Sans" src/components.tsx src/tokens.ts          # present
# Scope guards — overlay + colors untouched this round:
git diff --name-only dev..HEAD -- src/steam.ts                  # expect empty
git diff dev..HEAD -- src/tokens.ts | grep -nE "^-.*colors|accent|#1a9fff"  # expect none removed
```

Static review of the diff:

- Task 1: `tokens.ts` gains `space` (px 4-scale), `fontSize` (12/13/14/16/20), `fontWeight`,
  `fontFamily` = Motiva Sans stack; `colors`/`statusColor` unchanged.
- Task 2: every `rem` in `components.tsx` became px; spacing/type route through the tokens
  (with a few exact-px widths/odd values); Motiva Sans is applied once via shared text style/
  wrapper, not repeated inline; colors and structure unchanged.

### Deferred verification — on-device (cannot run here)

Rebuild from `dev`, `npm run package`, uninstall/reinstall via Decky Developer Mode, then in the
QAM confirm the panel spacing/typography reads the same as before (only intended small snaps),
text renders in Motiva Sans, and nothing shifted or clipped versus the pre-P2 build.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished decky-style-scale
```

This writes:

```text
/tmp/Decky-Metadata/decky-style-scale_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer decky-style-scale`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/decky-style-scale-review-*.md
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
   scripts/orchestration/clear-finished decky-style-scale
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
   git add docs/review/decky-style-scale-review-*.md
   git commit -m "docs(review): record decky-style-scale review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished decky-style-scale
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer decky-style-scale` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed decky-style-scale
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize decky-style-scale
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Decky-Metadata/decky-style-scale_finalized
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
scripts/orchestration/finalize decky-style-scale
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Decky-Metadata/decky-style-scale_finished
/tmp/Decky-Metadata/decky-style-scale_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
