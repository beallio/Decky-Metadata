# Plan: Decky Metadata shared style tokens and state-colored status (P1) (decky-style-tokens)

## Context

Decky Metadata (Decky Loader plugin: TS/React `src/*` bundled by rollup to `dist/index.js`,
Python backend `main.py`) is being standardized against the reference plugin
`beallio/SDH-Ludusavi`. A style audit found Decky Metadata has no semantic color system — its
secondary text is expressed as `opacity`-faded white and it has a single accent
(`STATUS_BLUE = "#1a9fff"`), while SDH-Ludusavi uses a named semantic palette (accent, info,
success, warning, error, text tokens) and colors status feedback **by outcome**.

This plan implements **Phase 1 (P1)** of the standardization — the two low-risk, high-impact
wins. P2/P3 (px spacing/type-scale convergence, `ButtonItem`/`Field` component convergence,
overlay accent unification) are explicitly **out of scope** here and will be separate plans.

1. **Shared token module.** Add a small `src/tokens.ts` exporting SDH-Ludusavi's semantic
   palette as named constants, and adopt it in `src/components.tsx` — replacing the lone
   `STATUS_BLUE` hex and the `opacity`-driven secondary-text greys with named tokens.
2. **State-colored status lines.** The QAM currently paints every status line the same blue,
   so "Scan complete" and "No metadata match" look identical. Color the scan / activity /
   delisted status text **by outcome** (active→blue, success→green, partial→amber,
   error→red), mirroring the reference.

### Relevant files

`src/tokens.ts` (new), `src/components.tsx` (adopt tokens + state colors), `dist/index.js`
(rebuilt), and `docs/agent_conversations/` (session log). Do **not** touch `src/steam.ts`
(the in-game overlay) in this plan — that is P2/P3.

**Reference palette (from `beallio/SDH-Ludusavi`, measured):** accent `#1a9fff`, info
`#60a5fa`, success `#4ade80`, warning `#f59e0b`, error `#f87171`, error-icon `#ef4444`, text
`#f8fafc`, text-secondary `#cbd5e1`, surface-knockout `#0b151f`.

**Test infra note:** the repo has **no TS/JS test runner** — the frontend quality gate is
`tsc --noEmit` + rollup build only (Python has pytest). So the state→color mapping must be a
small, strictly-typed **pure function** verified by `tsc` and deferred on-device checks; do
not stand up a new JS test framework for this. Record this in the session log.

**Slug used throughout this plan:** `decky-style-tokens`

---

## Orchestration Contract

**Slug:** `decky-style-tokens`

**Plan file:**

```text
docs/plans/2026-07-02_decky-style-tokens.md
```

**Implementation branch:**

```text
feat/decky-style-tokens
```

**Round-complete marker:**

```text
/tmp/Decky-Metadata/decky-style-tokens_finished
```

**Finalized marker:**

```text
/tmp/Decky-Metadata/decky-style-tokens_finalized
```

**Review notes:**

```text
docs/review/decky-style-tokens-review-*.md
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
git checkout -b feat/decky-style-tokens
```

Commit this plan first:

```bash
git add docs/plans/2026-07-02_decky-style-tokens.md
git commit -m "docs(plan): add decky-style-tokens implementation plan"
```

---

## Implementation Tasks

Work in order. Run all tooling through `./run.sh`. Locate code by symbol, not line number.

### Task 1 — Add the shared token module `src/tokens.ts`

Create `src/tokens.ts` exporting the reference semantic palette as named string constants.
Use exactly these values (measured from `beallio/SDH-Ludusavi`):

```ts
// Shared semantic style tokens, aligned with beallio/SDH-Ludusavi.
export const colors = {
  accent: "#1a9fff",       // primary accent / active
  info: "#60a5fa",         // informational
  success: "#4ade80",      // success / complete
  warning: "#f59e0b",      // partial / caution
  error: "#f87171",        // failure text
  errorIcon: "#ef4444",    // failure icon
  text: "#f8fafc",         // primary text
  textSecondary: "#cbd5e1",// secondary text
  surfaceKnockout: "#0b151f",
} as const;
```

Keep it framework-free (plain constants, no React import) so it can be reused by other
surfaces later (P2/P3). Export a type if convenient (`export type StatusKind = ...`, see Task 3).

### Task 2 — Adopt tokens in `src/components.tsx` (replace the lone hex + opacity greys)

- Replace `const STATUS_BLUE = "#1a9fff";` with an import of `colors` from `./tokens`; use
  `colors.accent` wherever `STATUS_BLUE` was referenced (it is used as the active/blue status
  color — see Task 3 for the state-coloring that supersedes the uniform use).
- Replace the `opacity`-based secondary text with the named secondary token:
  - `compactTextStyle`: drop `opacity: 0.72` and set `color: colors.textSecondary`.
  - `diagnosticsValueStyle`: drop `opacity: 0.9` and set `color: colors.textSecondary` (or
    `colors.text` if you judge the value should read as primary — pick one and note it).
  This is an intentional, visible change (solid slate instead of faded white), matching the
  reference; final shade is confirmed on-device (deferred).
- Do not introduce any new hard-coded hex in `components.tsx` — every color must come from
  `colors`. Grep to confirm: after this task, `grep -nE "#[0-9a-fA-F]{3,6}" src/components.tsx`
  should return **no matches** (all colors go through the token module).

### Task 3 — State-color the status lines by outcome

Currently `inlineStatusStyle` carries a fixed color and is reused by the scan status row
(`scanMessage`), the activity row (`activityMessage`), and the delisted status line
(`delistedStatusText`). Make the status **text color reflect the outcome**, matching the
reference (active=blue, success=green, partial/caution=amber, error=red).

- Add a pure, strictly-typed mapping in `src/tokens.ts` (or a small helper near the top of
  `components.tsx` that imports `colors`):

  ```ts
  export type StatusKind = "active" | "success" | "warning" | "error" | "idle";
  export const statusColor = (kind: StatusKind): string => ({
    active: colors.accent, success: colors.success,
    warning: colors.warning, error: colors.error, idle: colors.textSecondary,
  }[kind]);
  ```

- Track a status **kind** alongside each status message so the row can color itself. Minimal
  approach: add a small piece of state per status area (e.g. `scanStatusKind`,
  `activityStatusKind`) defaulting to `"active"` while busy, and set it when the operation
  finishes:
  - **Scan** (`scanMissing`): while running/among per-game ticks → `"active"`. On completion,
    derive from the final progress — all matched (no failures) → `"success"`; some titles
    unmatched (`failed > 0` / `assigned < total`) → `"warning"`; the operation itself errored
    → `"error"`. Keep the existing `scanCompleteMessage` text; only add the kind.
  - **Activity refresh** (`refreshActivities`): `"active"` while running, `"success"` on
    normal completion, `"error"` on failure.
  - **Delisted status line**: color `"active"` while `delistedBusy`, otherwise `"idle"`
    (secondary) — or `"success"`/`"error"` if the delisted status already distinguishes a
    loaded index vs a failure; keep it simple and note the choice in the session log.
- Apply the color at render: the status row should use `statusColor(kind)` for its `color`
  rather than the fixed token. Do not change the row's layout (keep the flex/gap/spinner).
- Keep the mapping and the completion-derivation as pure logic where possible so `tsc` covers
  the types. Since there is **no TS test runner**, do not add a JS test framework; note in the
  session log that verification is `tsc` + on-device.

### Task 4 — Rebuild the bundle and record the session log

- `./run.sh npm run build` to regenerate `dist/index.js`; stage `dist/`.
- Record `docs/agent_conversations/2026-07-02_decky-style-tokens.md` per `AGENTS.md` §9: the
  P1 scope, the token values adopted, the opacity→token text change (intentional visible
  change), the status state→color mapping and completion-derivation rules, and the test-infra
  note (no TS runner; tsc + on-device).

### Scope discipline

P1 only. Do NOT: touch `src/steam.ts` / the overlay, change spacing/units or type scale, swap
`DialogButton`→`ButtonItem`, alter the community-feed passthrough, or change any backend/
matching logic. Colors only come from `src/tokens.ts`. Preserve all layout and behavior except
the two intended changes (token-colored secondary text, state-colored status).

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

Grep gates:

```bash
# All colors in components.tsx flow through the token module (no raw hex):
grep -nE "#[0-9a-fA-F]{3,6}" src/components.tsx                 # expect none
# The token module exists and carries the reference palette:
grep -nE "accent|success|warning|error|textSecondary" src/tokens.ts   # expect present
# Scope guard — the overlay/steam.ts was NOT touched:
git diff --name-only dev..HEAD -- src/steam.ts                  # expect empty
```

Static review of the built `Content` (Gaming Mode not available here — read the diff):

- Task 1/2: `src/tokens.ts` exists with the nine named colors; `components.tsx` imports
  `colors`, `STATUS_BLUE` is gone, and `compactTextStyle`/`diagnosticsValueStyle` use
  `colors.textSecondary` instead of `opacity`.
- Task 3: a pure `statusColor(kind)` maps active→accent, success→green, warning→amber,
  error→red; `scanMissing`/`refreshActivities` set the kind (active while running; success/
  warning/error on completion) and the status row colors itself from it.

### Deferred verification — on-device (cannot run here)

Rebuild from `dev`, sideload, confirm in Gaming Mode:

1. Secondary text (stats sub-labels, diagnostics values) reads as solid slate, not faded, and
   remains legible on the QAM background.
2. A fully successful scan shows a **green** "Scan complete…" line; a scan with unmatched
   titles shows an **amber** line; an active scan/refresh shows **blue**; a failure shows
   **red** — no longer all one blue.
3. Layout/spacing unchanged from before (only colors differ).

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished decky-style-tokens
```

This writes:

```text
/tmp/Decky-Metadata/decky-style-tokens_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer decky-style-tokens`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/decky-style-tokens-review-*.md
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
   scripts/orchestration/clear-finished decky-style-tokens
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
   git add docs/review/decky-style-tokens-review-*.md
   git commit -m "docs(review): record decky-style-tokens review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished decky-style-tokens
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer decky-style-tokens` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed decky-style-tokens
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize decky-style-tokens
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Decky-Metadata/decky-style-tokens_finalized
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
scripts/orchestration/finalize decky-style-tokens
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Decky-Metadata/decky-style-tokens_finished
/tmp/Decky-Metadata/decky-style-tokens_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
