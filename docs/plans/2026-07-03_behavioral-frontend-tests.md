# Plan: Replace source-pinned tests with behavioral tests (behavioral-frontend-tests)

## Context

Some tests assert on **source text** rather than behavior. `tests/test_qam_controller_scroll.py`
reads `src/components.tsx` as a string and regex-matches JSX layout — brittle (breaks on any
refactor) and it validates source shape, not rendered focus behavior.

**Intended outcome:** replace source-text/regex assertions with structural or behavioral checks (or
remove them with a documented on-device check), so refactors like the component/steam decompositions
don't create false failures.

**Ordering:** run **before** `components-tsx-decomposition` (unblocks it).

### Relevant files
`tests/test_qam_controller_scroll.py` and any other test that reads `src/*.tsx/.ts` as text.

> Source: thermo-nuclear code-quality review (2026-07-03), findings corroborated by two independent reviewers (codex gpt-5.5 + agy) and verified against the code by the orchestrator.


**Slug used throughout this plan:** `behavioral-frontend-tests`

---

## Orchestration Contract

**Slug:** `behavioral-frontend-tests`

**Plan file:**

```text
docs/plans/2026-07-03_behavioral-frontend-tests.md
```

**Implementation branch:**

```text
feat/behavioral-frontend-tests
```

**Round-complete marker:**

```text
/tmp/Decky-Metadata/behavioral-frontend-tests_finished
```

**Finalized marker:**

```text
/tmp/Decky-Metadata/behavioral-frontend-tests_finalized
```

**Review notes:**

```text
docs/review/behavioral-frontend-tests-review-*.md
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
git checkout -b feat/behavioral-frontend-tests
```

Commit this plan first:

```bash
git add docs/plans/2026-07-03_behavioral-frontend-tests.md
git commit -m "docs(plan): add behavioral-frontend-tests implementation plan"
```

---

## Implementation Tasks

1. Find all source-pinned tests: `grep -rn "read_text" tests | grep -E "src/.*\.(ts|tsx)"`.
2. For each, replace the source-regex assertion with either a small structural test around an
   extracted unit (after/with decomposition) or, given there is **no TS test runner** in this repo,
   remove the source-regex test and document the corresponding **on-device** verification step in
   the plan/session log instead — do not leave brittle text-matching in the suite.
3. Preserve any assertion that still carries real value in a non-brittle form.
4. Full pytest green.

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
grep -rn "read_text" tests | grep -E "src/.*\.(ts|tsx)"   # expect NONE afterwards
./run.sh uv run --with pytest -- pytest -q
git status --short
```
- No test greps a frontend source file's text.
- Remaining tests still provide meaningful coverage; removed ones have a documented on-device check.

### On-device verification replacing the removed source-regex test

The removed `tests/test_qam_controller_scroll.py` test asserted on JSX source text for the QAM
stats and Versions panels. There is no TS/React test runner in this repository, so the behavioral
check remains on-device:

1. Sideload or reload the plugin on Steam Deck Gaming Mode.
2. Open the Decky Metadata QAM page.
3. Use controller directional navigation to move to the top stats block and bottom Versions block.
4. Confirm focus lands on both display blocks and the panel scrolls to keep the focused block
   visible.


---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished behavioral-frontend-tests
```

This writes:

```text
/tmp/Decky-Metadata/behavioral-frontend-tests_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer behavioral-frontend-tests`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/behavioral-frontend-tests-review-*.md
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
   scripts/orchestration/clear-finished behavioral-frontend-tests
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
   git add docs/review/behavioral-frontend-tests-review-*.md
   git commit -m "docs(review): record behavioral-frontend-tests review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished behavioral-frontend-tests
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer behavioral-frontend-tests` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed behavioral-frontend-tests
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize behavioral-frontend-tests
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Decky-Metadata/behavioral-frontend-tests_finalized
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
scripts/orchestration/finalize behavioral-frontend-tests
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Decky-Metadata/behavioral-frontend-tests_finished
/tmp/Decky-Metadata/behavioral-frontend-tests_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
