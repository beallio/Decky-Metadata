# Plan: Refine Metadata Editor Layout (refine-metadata-editor-layout)

## Context

The metadata editor is functionally correct, but several Decky components expand
or wrap differently in Gaming Mode than they do in a desktop browser. The live UI
currently stacks the three actions and IGN search controls more than intended,
uses panel-backed `Field` wrappers around otherwise plain source fields, gives the
Steam App ID action too much width, and leaves the category rows and source-field
spacing visually uneven.

Implement the approved editor layout represented by
`/tmp/Decky-Metadata/decky-metadata-ui-sample.html` and its rendered editor
reference images under `/tmp/Decky-Metadata/`. The transient prototype is a visual
reference only; the requirements below are the durable implementation contract and
must be implemented with the existing Decky/React controls rather than by copying
the prototype's raw HTML controls.

The intended result is:

- a sticky, single-row action bar whose Save, Remove metadata, and Done buttons
  have equal widths; Save uses the approved Steam green treatment, Remove metadata
  uses the approved Steam red treatment, and Done remains the native neutral style;
- a single-row IGN search layout with the input taking the remaining width and the
  Search button on the right;
- no panel background around Title, Developers, or Publishers;
- Title and Description labels and controls aligned to the same horizontal insets
  and width, with more vertical space between them;
- more vertical separation between Developers, Publishers, and the Release
  date/Rating row, while the paired row remains within the same field width;
- denser native Steam category toggles with less vertical padding;
- a Steam App ID input that receives nearly all available row width and an Apply
  button sized close to its text.

Preserve all current save, remove, navigation, IGN search/result, metadata parsing,
category toggle, and Steam App ID behavior. Preserve Decky controller focus and
activation semantics by retaining `TextField`, `ToggleField`, `Focusable`, and
`DialogButton`/`FocusableButton` controls. This is an editor-only visual change:
do not alter `ContentPanel`/QAM layouts, backend calls, metadata shapes, `main.py`,
or anything under `src/steam/`.

Primary implementation files are `src/MetadataPage.tsx` plus editor-specific
style/test files. `buttonRowStyle`, `flexFieldStyle`, and `toggleGridStyle` are
currently used only by `MetadataPage`, but the new layout contract should still
remain explicitly editor-scoped; `ContentPanel`/QAM must not change. Rebuild the
committed `dist/index.js` artifact and record the implementation in
`docs/agent_conversations/`.

**Slug used throughout this plan:** `refine-metadata-editor-layout`

---

## Orchestration Contract

**Slug:** `refine-metadata-editor-layout`

**Plan file:**

```text
docs/plans/2026-07-16_refine-metadata-editor-layout.md
```

**Implementation branch:**

```text
feat/refine-metadata-editor-layout
```

**Round-complete marker:**

```text
/tmp/Decky-Metadata/refine-metadata-editor-layout_finished
```

**Finalized marker:**

```text
/tmp/Decky-Metadata/refine-metadata-editor-layout_finalized
```

**Review notes:**

```text
docs/review/refine-metadata-editor-layout-review-*.md
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
git checkout -b feat/refine-metadata-editor-layout
```

Commit this plan first:

```bash
git add docs/plans/2026-07-16_refine-metadata-editor-layout.md
git commit -m "docs(plan): add refine-metadata-editor-layout implementation plan"
```

---

## Implementation Tasks

1. **Establish the implementation baseline and preserve behavior.**
   - From the repository root, run `./run.sh scripts/decky doctor` and
     `./run.sh scripts/decky verify-change dev --explain` before editing runtime
     files. Capture any pre-existing failure instead of retrying blindly.
   - Re-read `src/MetadataPage.tsx`, `src/styles.tsx`, `src/tokens.ts`, the
     installed `@decky/ui` component types, and the approved prototype before
     changing the component. Do not change any event handler, state transition,
     normalization/parsing call, disabled condition, result rendering, toast, or
     navigation target as part of the layout work.
   - Before committing to a sticky implementation, open the editor on the live
     Deck and capture its rendered structure with the committed SteamUI tooling
     (`./run.sh scripts/decky steamui snapshot` and focused searches as needed).
     Confirm whether `ScrollPanel` uses native overflow scrolling or transformed
     content, identify the actual scroll viewport and system-header boundary, and
     record how Decky represents controller focus on `DialogButton` and
     `ToggleField`. Do not infer these details from the minimal TypeScript types or
     from the standalone HTML prototype.
   - Treat this capture as a required architecture checkpoint. If the Deck is
     unreachable, do not guess at the scroll/focus DOM: complete only work that is
     independent of that evidence and record the blocked items for the review
     round.

2. **Write an editor-layout regression test before the production styles.**
   - Add a pure, React-runtime-independent editor style module such as
     `src/metadataEditorStyles.ts`, and add
     `src/metadataEditorStyles.test.ts` before implementing the final style
     values. Keep it separate from `src/styles.tsx` so Vitest does not need to
     initialize Decky's runtime-discovered components.
   - Make the first targeted test fail for the absent layout contract, then export
     narrowly scoped style constants (and, only if required for native toggle
     internals, a uniquely scoped CSS string) until it passes.
   - Assert meaningful invariants rather than source text: the live-selected
     action-container strategy is sticky or pinned and uses three equal grid
     columns; action buttons fill those columns; the search and App ID rows use
     `minmax(0, 1fr)` plus a right-side action; source fields share one inset/width
     contract; Release date/Rating use two equal columns inside that contract;
     category rows target the approved dense height/padding; and Save/Remove use
     the approved green/red treatments. Do not snapshot unrelated CSS or
     implementation details.
   - This test is a documentation lock for the authored layout contract, not proof
     that Steam's runtime DOM honors sticky positioning, focus states, or toggle
     density. The live-Deck checks remain the authoritative layout and controller
     verification; do not report the visual work verified solely because Vitest
     passes.

3. **Implement the sticky editor action bar without changing action behavior.**
   - Replace the editor's use of the wrapping shared `buttonRowStyle` with an
     editor-only three-column grid (`repeat(3, minmax(0, 1fr))`, 8 px gap). Give
     all three existing `FocusableButton` controls `width: 100%` so Steam's
     `DialogButton` sizing cannot force them onto separate rows.
   - Keep the approved compact inset/background treatment (8 px vertical and
     16 px horizontal padding, opaque Steam-dark translucent surface, blur where
     supported, and a z-index above editor fields), but derive the toolbar's top
     offset from the live scroll viewport instead of copying the prototype's
     `top: -8px` blindly. It must remain fully below the Steam system header and
     above the footer at 1280x800.
   - If the live `ScrollPanel` uses native overflow and proves compatible, use a
     sticky action container inside it. If sticky positioning is inert because of
     Decky's scroll structure, render the action bar as a pinned sibling above the
     scrolling editor content and constrain the remaining content to the existing
     scroll region. In either architecture, Save must remain visible throughout
     scrolling and the actions must remain first in logical controller focus
     order. A non-sticky first row is not an acceptable fallback.
   - Apply the prototype's Steam green gradient (`#75b022` to `#588a1b`) to Save
     and Steam red gradient (`#d94b43` to `#a92f2a`) to Remove metadata, with white
     text. Leave Done on the native neutral Decky button style. Do not remove the
     native `DialogButton` class, disabled behavior, or controller focusability.
   - Explicitly authorize one uniquely editor-scoped `<style>` block, rooted under
     a project-owned class such as `decky-metadata-editor`, for interaction states
     that inline styles cannot represent. Use project-owned selectors plus the
     live-confirmed focus-bearing element/state; do not couple to generated Steam
     class names. Preserve a strong, visible gamepad-focus treatment on Save and
     Remove even when their resting backgrounds are green/red, and preserve normal
     pointer hover and disabled feedback. If no stable controller-focus state can
     be targeted without generated classes, treat the semantic button treatment as
     a review blocker instead of shipping buttons with an invisible focus state.
   - Define one measured toolbar-clearance value after the live capture. Apply at
     least that amount as scroll margin to focus targets or their row wrappers so
     controller-driven auto-scroll does not leave an action result, input, toggle,
     or button hidden behind the pinned bar.

4. **Refine the IGN and Source layouts using the existing controls.**
   - Render the IGN query `TextField` and existing Search button in one editor-only
     grid row: `minmax(0, 1fr)` for the input and a compact fixed/auto button on the
     right (112 px is the minimum/reference rather than a hard maximum). Prevent
     row wrapping, allow the current `Searching...` label to fit without clipping,
     and preserve the current busy label, disabled state, result list, and focus
     order.
   - Remove the `Field` wrappers around Title, Developers, and Publishers. Replace
     only their presentation with background-free labelled containers while
     retaining their existing `TextField` values and handlers. Do not use raw HTML
     inputs.
   - Give Title, Description, Developers, Publishers, and the paired Release
     date/Rating row the same 12 px horizontal inset and full available width.
     Keep the existing focusable textarea and its value/update behavior; align its
     label and box exactly with the Title label/input.
   - Use 16 px between Title and Description, then 14 px between the subsequent
     source groups. Keep a 7 px label-to-control gap where applicable. Implement
     Release date/Rating as two equal `minmax(0, 1fr)` columns with an 8 px gap so
     the outside edges never exceed the Developer/Publisher fields.

5. **Densify categories and rebalance the Steam App ID row.**
   - Continue rendering every category with Decky's native `ToggleField`, retaining
     its label, checked value, `onChange`, `bottomSeparator="none"`, and current
     controller behavior. Do not replace the controls with custom checkboxes or
     switches.
   - Use an editor-scoped two-column category grid with 12 px column gap and 6 px
     row gap. Reduce only these toggle roots to the prototype's approximately
     36 px row height and 4 px vertical padding. Since `ToggleFieldProps` has no
     density/style prop in the installed `@decky/ui`, use the same uniquely scoped
     editor style block and a stable, live-confirmed descendant structure; do not
     target global or generated Steam class names. Dense rows are a required
     acceptance criterion. If a stable scoped root cannot be confirmed, do not
     replace `ToggleField` or silently ship native density: document the technical
     blocker and return it for review/design resolution.
   - Render the Steam App ID `TextField` and Apply button in a non-wrapping
     `minmax(0, 1fr) auto` grid. Keep the input fluid and full width; make the button
     `width: auto`, `whiteSpace: nowrap`, with about 24 px horizontal padding so it
     is only modestly wider than `Apply Steam App ID`. Preserve the help copy,
     disabled state, parsing, save/enrichment flow, and toast behavior.

6. **Build, document, and keep the change editor-only.**
   - Run the targeted Vitest test during the red/green cycle, then run the full
     orchestration quality gate. The build must regenerate and commit
     `dist/index.js` and `dist/index.js.map` if produced by the existing build.
   - Add `docs/agent_conversations/2026-07-16_refine-metadata-editor-layout.md`
     with the objective, files changed, design decisions (especially native
     control/focus preservation and scoped toggle density), test/build results,
     and live Deck verification results.
   - Remove the now-unused local `Field` import from `MetadataPage.tsx`. Preserve
     the current textarea typography and all existing busy-handler behavior; the
     prototype's monospace textarea is not part of this change, and unguarded
     `search`, `applyResult`, or `applySteamAppId` handlers must not be
     opportunistically changed.
   - Do not update README because no behavior or usage changes. Do not edit the
     approved `/tmp` prototype during implementation, commit transient images, or
     broaden this plan into QAM/backend/Steam-patch cleanup.

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

1. During TDD, run the focused style-contract test and record the initial expected
   failure followed by the passing result:

   ```bash
   ./run.sh npx vitest run src/metadataEditorStyles.test.ts
   ```

2. Run the repository quality gate and orchestration safety checks exactly as
   listed above. This covers TypeScript, the full Vitest suite, Rollup/
   `dist/index.js`, Python byte-compilation, pytest, review-note preservation, and
   a clean committed worktree:

   ```bash
   scripts/orchestration/run-quality-gates
   scripts/orchestration/check-review-notes-not-deleted
   git status --short
   ```

3. Live Deck verification is required for this Gaming Mode layout even though the
   change does not touch `src/steam/`. With the Deck reachable and deployment
   authorized, deploy through the committed workflow and inspect the metadata
   editor at 1280x800. Compare it with
   `/tmp/Decky-Metadata/decky-metadata-ui-sample.html` and verify:
   - Save, Remove metadata, and Done remain a single equal-width row; Save is
     green, Remove is red, Done is neutral; labels do not wrap or clip; the row
     stays visible during scroll;
   - controller focus on Save and Remove remains unmistakably visible over their
     semantic backgrounds, including after pointer/controller input-mode changes;
   - controller traversal reaches all actions, search controls, source fields,
     category toggles, and App ID controls in logical order, with no focused item
     obscured by the sticky bar and no focus traps;
   - IGN search stays on one row with the input taking most space, and both
     `Search` and `Searching...` fit without clipping;
   - Source has no background behind Title, Developers, or Publishers; Title and
     Description align exactly; vertical spacing is visibly increased; the paired
     Release date/Rating row shares the surrounding field edges;
   - categories are denser without clipped labels, switches, focus rings, or
     adjacent focus highlights;
   - the App ID input is substantially wider than before and the Apply button is
     close to text width, with no overflow or wrapping.

4. Exercise one successful path for each unchanged action: search IGN and apply a
   result, edit and Save, toggle a category, apply/clear a Steam App ID, Remove
   metadata, and use Done to navigate back. Confirm the existing busy/disabled
   feedback and toasts still appear.

No verification is intentionally deferred. If the Deck is unavailable or a live
deployment is not authorized, do not claim the visual work fully verified: record
the exact deferred checks, owner, and timing in the session log and leave them as
an explicit review blocker. The plan may not be approved while sticky/pinned
behavior, visible controller focus on the colored actions, or native-toggle density
remains unverified.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished refine-metadata-editor-layout
```

This writes:

```text
/tmp/Decky-Metadata/refine-metadata-editor-layout_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer refine-metadata-editor-layout`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/refine-metadata-editor-layout-review-*.md
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
   scripts/orchestration/clear-finished refine-metadata-editor-layout
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
   git add docs/review/refine-metadata-editor-layout-review-*.md
   git commit -m "docs(review): record refine-metadata-editor-layout review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished refine-metadata-editor-layout
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer refine-metadata-editor-layout` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed refine-metadata-editor-layout
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize refine-metadata-editor-layout
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Decky-Metadata/refine-metadata-editor-layout_finalized
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
scripts/orchestration/finalize refine-metadata-editor-layout
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Decky-Metadata/refine-metadata-editor-layout_finished
/tmp/Decky-Metadata/refine-metadata-editor-layout_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
