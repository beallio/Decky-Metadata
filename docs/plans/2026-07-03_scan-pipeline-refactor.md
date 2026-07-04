# Plan: Refactor scan orchestration into a typed match pipeline (scan-pipeline-refactor)

## Context

**Plausible, not yet fully verified** (reviewer leads corroborated across codex #5 and agy
M-3/M-4/M-6/N-3). The scan/enrichment backend appears to tangle policy with persistence:
`_scan_missing` nests Steam-match → delisted fallback → IGN fallback → enrichment → save →
progress → error handling in one loop; `_refresh_steam_activities` repeats the progress/save
pattern; `_metadata_with_steam_news_sync` may trigger extra `deck_compat`/`appdetails` network
calls when only `steam_news` is needed; `_sanitize_steam_news` mixes dedup + image extraction with
sanitization; image scoring runs inside the sanitize loop.

**Intended outcome:** introduce a typed **match pipeline** (`{status, metadata, source}`) with each
resolver as a small strategy, and a shared scan runner that owns progress/save — so branches
collapse. **Behavior-preserving.**

**⚠ First task is verification:** confirm each claim against the code before refactoring; refactor
only what is confirmed, and record what was/ wasn't real.

**Ordering:** before or merged with `main-py-decomposition`.

> Source: thermo-nuclear code-quality review (2026-07-03), findings corroborated by two independent reviewers (codex gpt-5.5 + agy) and verified against the code by the orchestrator.


**Slug used throughout this plan:** `scan-pipeline-refactor`

---

## Orchestration Contract

**Slug:** `scan-pipeline-refactor`

**Plan file:**

```text
docs/plans/2026-07-03_scan-pipeline-refactor.md
```

**Implementation branch:**

```text
feat/scan-pipeline-refactor
```

**Round-complete marker:**

```text
/tmp/Decky-Metadata/scan-pipeline-refactor_finished
```

**Finalized marker:**

```text
/tmp/Decky-Metadata/scan-pipeline-refactor_finalized
```

**Review notes:**

```text
docs/review/scan-pipeline-refactor-review-*.md
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
git checkout -b feat/scan-pipeline-refactor
```

Commit this plan first:

```bash
git add docs/plans/2026-07-03_scan-pipeline-refactor.md
git commit -m "docs(plan): add scan-pipeline-refactor implementation plan"
```

---

## Implementation Tasks

1. **Verify** each reviewer claim against `main.py` (network-call fan-out, duplicated
   branches, sanitize-time image work). Record findings in the session log; drop anything not real.
2. Add **golden tests** capturing current scan/refresh outcomes (inputs → saved metadata + source)
   so the refactor is provably behavior-preserving (TDD safety net).
3. Introduce a typed result (dataclass/TypedDict `{status, metadata, source}`) and extract the
   Steam / delisted / IGN resolvers as small strategy functions.
4. Add a shared scan runner that owns progress + save; have `_scan_missing` and
   `_refresh_steam_activities` use it instead of duplicating the pattern.
5. Move image extraction / dedup out of `_sanitize_steam_news` to fetch/collection time; verify no
   redundant network calls (assert via mocked call counts where feasible).
6. Full pytest green.

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
./run.sh uv run --with pytest -- pytest -q      # incl new golden + call-count tests
./run.sh python3 -m py_compile main.py
scripts/orchestration/run-quality-gates
git status --short
```
- Golden tests prove identical scan/refresh outputs before/after.
- Where claimed, network-call counts drop (mocked assertions).
- Session log states which reviewer claims were confirmed vs. dropped.

### Deferred — on-device
Scan and activity refresh produce the same metadata as before, faster / with fewer requests.


---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished scan-pipeline-refactor
```

This writes:

```text
/tmp/Decky-Metadata/scan-pipeline-refactor_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer scan-pipeline-refactor`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/scan-pipeline-refactor-review-*.md
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
   scripts/orchestration/clear-finished scan-pipeline-refactor
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
   git add docs/review/scan-pipeline-refactor-review-*.md
   git commit -m "docs(review): record scan-pipeline-refactor review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished scan-pipeline-refactor
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer scan-pipeline-refactor` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed scan-pipeline-refactor
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize scan-pipeline-refactor
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Decky-Metadata/scan-pipeline-refactor_finalized
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
scripts/orchestration/finalize scan-pipeline-refactor
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Decky-Metadata/scan-pipeline-refactor_finished
/tmp/Decky-Metadata/scan-pipeline-refactor_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
