# Plan: Make activity tab detection locale-neutral (locale-neutral-tab-detection)

## Context

Steam details-tab detection in `src/steam.ts` is hardcoded to Italian:
`toLocaleLowerCase("it-IT")` (~1633/1637/1644), the string `"Attività"` used as the **canonical
internal key** for the Activity tab (~1648, 1693, 1822, 1905, 1910, 1913), and `it-IT` date
formatting. English happens to work via an explicit label mapping, but users in **other locales get
silent tab-detection failures**.

**Intended outcome:** use language-neutral sentinel keys (e.g. an `ActivityTab.ACTIVITY` constant)
internally and `navigator.language` for locale-sensitive operations; map all known display labels
(it/en/…) to the neutral sentinels. **Behavior-preserving for it/en**, fixes other locales.

### Relevant files
`src/steam.ts`, `dist/` rebuilt.

> Source: thermo-nuclear code-quality review (2026-07-03), findings corroborated by two independent reviewers (codex gpt-5.5 + agy) and verified against the code by the orchestrator.


**Slug used throughout this plan:** `locale-neutral-tab-detection`

---

## Orchestration Contract

**Slug:** `locale-neutral-tab-detection`

**Plan file:**

```text
docs/plans/2026-07-03_locale-neutral-tab-detection.md
```

**Implementation branch:**

```text
feat/locale-neutral-tab-detection
```

**Round-complete marker:**

```text
/tmp/Decky-Metadata/locale-neutral-tab-detection_finished
```

**Finalized marker:**

```text
/tmp/Decky-Metadata/locale-neutral-tab-detection_finalized
```

**Review notes:**

```text
docs/review/locale-neutral-tab-detection-review-*.md
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
git checkout -b feat/locale-neutral-tab-detection
```

Commit this plan first:

```bash
git add docs/plans/2026-07-03_locale-neutral-tab-detection.md
git commit -m "docs(plan): add locale-neutral-tab-detection implementation plan"
```

---

## Implementation Tasks

1. Replace the `"Attività"` canonical key with a neutral constant (e.g.
   `const TAB_ACTIVITY = "__activity__"`) throughout the detection/redirect logic.
2. Replace `toLocaleLowerCase("it-IT")` with locale-agnostic normalization
   (`toLocaleLowerCase()` with no fixed locale, or `navigator.language` where a locale is genuinely
   needed); same for `toLocaleDateString("it-IT")` → `navigator.language`.
3. Keep `knownDetailsTabLabels` as display strings but map **every** known label (Italian + English
   + any others) to the neutral sentinels; drive detection off the sentinel, never a language string.
4. `tsc` + `build` green; rebuild `dist/`; session log.

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

```bash
grep -nE '"it-IT"' src/steam.ts                 # expect NONE (or only inside the known-label map)
grep -nE '"Attività"' src/steam.ts              # only as a display label, never as a key
./run.sh npx tsc --noEmit && ./run.sh npm run build
git status --short
```
- Detection compares against neutral sentinels, not language-specific strings.

### Deferred — on-device
Activity tab detection/redirect still works in English and Italian; verify on a third locale if
available.


---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished locale-neutral-tab-detection
```

This writes:

```text
/tmp/Decky-Metadata/locale-neutral-tab-detection_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer locale-neutral-tab-detection`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/locale-neutral-tab-detection-review-*.md
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
   scripts/orchestration/clear-finished locale-neutral-tab-detection
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
   git add docs/review/locale-neutral-tab-detection-review-*.md
   git commit -m "docs(review): record locale-neutral-tab-detection review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished locale-neutral-tab-detection
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer locale-neutral-tab-detection` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed locale-neutral-tab-detection
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize locale-neutral-tab-detection
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Decky-Metadata/locale-neutral-tab-detection_finalized
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
scripts/orchestration/finalize locale-neutral-tab-detection
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Decky-Metadata/locale-neutral-tab-detection_finished
/tmp/Decky-Metadata/locale-neutral-tab-detection_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
