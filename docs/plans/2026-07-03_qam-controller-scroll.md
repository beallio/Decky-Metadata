# Plan: Make QAM top/bottom blocks gamepad-navigable by matching SDH-Ludusavi's Field sections (qam-controller-scroll)

## Context

In Gaming Mode, a **controller cannot scroll the QAM panel to the top stats block or the bottom
Versions block** — the panel scrolls for the action buttons but never reaches those two
display-only blocks.

**On-device root cause (confirmed via CEF/CDP inspection on the Deck):**

- The scroll container and Field focusability are fine — programmatically focusing the Versions
  block auto-scrolls the panel to it (479/479 max). So *if focus reaches the block, scroll
  follows.*
- But Decky's **gamepad directional navigation only stops on *actionable* elements**: buttons
  (`role="button"`) and the Debug toggle (a `Field` that contains a focusable control,
  `childFocusables: 1`). Our top/bottom blocks are **pure-display** `Field`s
  (`childFocusables: 0`) and directional nav **skips** them, so focus — and thus scroll — never
  reaches them.
- We also diverged from the reference. `beallio/SDH-Ludusavi` renders its Versions block as its
  **own `<PanelSection title="Versions">`** containing
  `<Field focusable={true} highlightOnFocus={true} childrenLayout="below" padding="standard" bottomSeparator="none">`.
  Our current code uses `highlightOnFocus={false}`, no `padding`, and crams both blocks into one
  shared `<PanelSection>` as `PanelSectionRow`s.

**Intended fix:** make the top stats block and the bottom Versions block match SDH-Ludusavi's
navigable `Field` sections **exactly** — each in its **own `<PanelSection>`** with
`focusable={true} highlightOnFocus={true} childrenLayout="below" padding="standard"
bottomSeparator="none"` — so Decky's gamepad nav treats them as focus stops and the panel scrolls
to them.

### Relevant files

`src/components.tsx` (the QAM `Content` structure only), `dist/index.js` (rebuilt),
`docs/agent_conversations/`.

**Out of scope:** the metadata editor (`MetadataPage`), the backend, `src/steam.ts`, tokens,
colors, and the action buttons / Debug toggle (leave them working as-is). Do not change the
"Detected/Saved/Missing" numbers or the Versions content — only the wrapping structure/props.

**Verification note:** gamepad directional navigation **can only be confirmed on-device** (no CI
or unit test can exercise the controller). The gate here is `tsc` + build; the actual fix is
verified by the human on the Deck (the orchestrator will push a build for that check).

**Slug used throughout this plan:** `qam-controller-scroll`

---

## Orchestration Contract

**Slug:** `qam-controller-scroll`

**Plan file:**

```text
docs/plans/2026-07-03_qam-controller-scroll.md
```

**Implementation branch:**

```text
feat/qam-controller-scroll
```

**Round-complete marker:**

```text
/tmp/Decky-Metadata/qam-controller-scroll_finished
```

**Finalized marker:**

```text
/tmp/Decky-Metadata/qam-controller-scroll_finalized
```

**Review notes:**

```text
docs/review/qam-controller-scroll-review-*.md
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
git checkout -b feat/qam-controller-scroll
```

Commit this plan first:

```bash
git add docs/plans/2026-07-03_qam-controller-scroll.md
git commit -m "docs(plan): add qam-controller-scroll implementation plan"
```

---

## Implementation Tasks

Work via `./run.sh`. Locate code by symbol. The change is **structural only** in the QAM
`Content` return — do not alter any displayed values, styles' colors, or the buttons.

### Reference — the exact SDH-Ludusavi pattern to match

```tsx
<PanelSection title="Versions">
  <PanelSectionRow>
    <Field focusable={true} highlightOnFocus={true} childrenLayout="below" padding="standard" bottomSeparator="none">
      <div style={/* content */}>…</div>
    </Field>
  </PanelSectionRow>
</PanelSection>
```

### Task 1 — Top stats block → its own navigable PanelSection

In `Content`, the top block currently is a `Field` inside the single shared `<PanelSection>`
(the one showing "Detected non-Steam games / Metadata saved / Missing metadata"). Restructure so
this block is its **own** `<PanelSection>` containing one `<PanelSectionRow>` with:

```tsx
<Field focusable={true} highlightOnFocus={true} childrenLayout="below" padding="standard" bottomSeparator="none">
  <div style={rowStackStyle}>{/* the three stat lines, unchanged */}</div>
</Field>
```

Key changes vs current: `highlightOnFocus={true}` (was `false`), add `padding="standard"`, and
give it its own `<PanelSection>` (not a row in the shared section). Keep the three stat `<div>`s
and their values exactly as-is.

### Task 2 — Bottom Versions block → its own navigable PanelSection

Currently the Debug toggle and the Versions `Field` are separate `PanelSectionRow`s in the shared
`<PanelSection>`. Restructure the **Versions** block into its **own** `<PanelSection title="Versions">`
with one `<PanelSectionRow>` and the same Field props as Task 1 wrapping the existing
`diagnosticsGridStyle` grid (Plugin / Commit / Delisted index / Metadata rows — unchanged):

```tsx
<PanelSection title="Versions">
  <PanelSectionRow>
    <Field focusable={true} highlightOnFocus={true} childrenLayout="below" padding="standard" bottomSeparator="none">
      <div style={diagnosticsGridStyle}>{/* Plugin/Commit/Delisted/Metadata rows, unchanged */}</div>
    </Field>
  </PanelSectionRow>
</PanelSection>
```

Keep the **Debug Logging** toggle and the "Diagnostics" heading where they are (their own
row/section is fine — the toggle is already gamepad-navigable). The action buttons
(Scan/Refresh/etc.) stay in their own section unchanged.

### Task 3 — Field props must match the fork exactly

For **both** blocks the `Field` must be exactly:
`focusable={true} highlightOnFocus={true} childrenLayout="below" padding="standard" bottomSeparator="none"`.
Do not use `highlightOnFocus={false}` on these two blocks (that is what made them non-navigable).
Leave the **toggles'** `highlightOnFocus={false}` as-is (that is for the toggle background and is
unrelated). Remove any now-unused wrapper (e.g. the extra `qamPanelStyle` div is fine to keep for
`fontFamily`, but each block must be inside its own `<PanelSection>`, not the old shared one).

### Task 4 — Rebuild + session log

- `./run.sh npm run build`; stage `dist/`.
- Record `docs/agent_conversations/2026-07-03_qam-controller-scroll.md`: the CDP root-cause
  (directional nav skips pure-display Fields; navigable = actionable/own-PanelSection Field with
  `highlightOnFocus={true}`), the exact fork props matched, and that gamepad nav is human-verified
  on-device.

### Scope discipline

QAM `Content` structure/props only. Do NOT touch `MetadataPage`, the backend, `src/steam.ts`,
tokens/colors, or the displayed values. Preserve everything except the two blocks' wrapping.

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
./run.sh uv run --with pytest -- pytest -q       # backend suite unaffected (unchanged)
scripts/orchestration/run-quality-gates
git status --short                               # clean
```

Static review of the diff:

- Both the top stats block and the bottom Versions block are each inside their **own**
  `<PanelSection>`, wrapped in
  `<Field focusable={true} highlightOnFocus={true} childrenLayout="below" padding="standard" bottomSeparator="none">`.
- No `highlightOnFocus={false}` remains on those two blocks; the toggles are unchanged; displayed
  values and the buttons are unchanged.
- `MetadataPage`, backend, and `src/steam.ts` untouched
  (`git diff --name-only dev..HEAD -- src/steam.ts main.py` → empty).

### Deferred verification — on-device (the real test; cannot run here)

Sideload/reload, open the QAM, and with the **controller**: D-pad **up** past the buttons lands
on the top stats block and the panel scrolls to the top; D-pad **down** past the Debug toggle
lands on the **Versions** block and the panel scrolls to the bottom. (The orchestrator pushes a
build to the Deck for this check.)

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished qam-controller-scroll
```

This writes:

```text
/tmp/Decky-Metadata/qam-controller-scroll_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer qam-controller-scroll`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/qam-controller-scroll-review-*.md
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
   scripts/orchestration/clear-finished qam-controller-scroll
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
   git add docs/review/qam-controller-scroll-review-*.md
   git commit -m "docs(review): record qam-controller-scroll review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished qam-controller-scroll
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer qam-controller-scroll` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed qam-controller-scroll
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize qam-controller-scroll
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Decky-Metadata/qam-controller-scroll_finalized
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
scripts/orchestration/finalize qam-controller-scroll
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Decky-Metadata/qam-controller-scroll_finished
/tmp/Decky-Metadata/qam-controller-scroll_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
