# Plan: Decompose main.py Plugin god object into services (main-py-decomposition)

## Context

`main.py`'s `Plugin` class is a **2,817-line god object** owning Decky RPC methods, JSON
storage, Steam-root discovery, VDF parsing, IGN GraphQL, Steam store/news, delisted-index caching,
HTTP, title matching, and metadata sanitization.

**Intended outcome:** decompose into boring, testable services, leaving `Plugin` as a thin RPC
facade that delegates. **Behavior-preserving.** RPC method names must stay identical — the frontend
`callable(...)` bindings depend on them.

**⚠ Packaging risk:** Decky packages the plugin directory. `scripts/package.mjs` currently stages
`main.py` explicitly — **it must be updated to stage the new `.py` modules**, or the sideload
build will be missing files. Verify this before finalizing.

**Ordering:** run **after** `dead-code-removal` and after (or merged with) `scan-pipeline-refactor`.

### Relevant files
`main.py` → new backend modules (e.g. `backend/*.py`), `scripts/package.mjs` (stage new files),
`tests/` (import paths), `dist/` unaffected.

> Source: thermo-nuclear code-quality review (2026-07-03), findings corroborated by two independent reviewers (codex gpt-5.5 + agy) and verified against the code by the orchestrator.


**Slug used throughout this plan:** `main-py-decomposition`

---

## Orchestration Contract

**Slug:** `main-py-decomposition`

**Plan file:**

```text
docs/plans/2026-07-03_main-py-decomposition.md
```

**Implementation branch:**

```text
feat/main-py-decomposition
```

**Round-complete marker:**

```text
/tmp/Decky-Metadata/main-py-decomposition_finished
```

**Finalized marker:**

```text
/tmp/Decky-Metadata/main-py-decomposition_finalized
```

**Review notes:**

```text
docs/review/main-py-decomposition-review-*.md
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
git checkout -b feat/main-py-decomposition
```

Commit this plan first:

```bash
git add docs/plans/2026-07-03_main-py-decomposition.md
git commit -m "docs(plan): add main-py-decomposition implementation plan"
```

---

## Implementation Tasks

Behavior-preserving extraction; keep RPC surface identical.

1. Extract pure helpers first (lowest risk): `matching` (title scoring), `shortcuts_vdf`,
   `storage` (load/save/default data). Then providers: `providers/ign`, `providers/steam`,
   `providers/delisted`, and `steam_paths` (root/userdata discovery), and `scan_runner`.
2. Keep `Plugin` methods as thin delegators to the services; **do not rename any RPC method**
   (grep the frontend `callable("...")` names and keep them all).
3. Update `scripts/package.mjs` to stage every new backend `.py` module (confirm the produced
   `Decky-Metadata.zip` contains them).
4. Update test imports; keep coverage. Prefer moving logic without changing signatures.
5. `py_compile` all modules; full pytest green; session log.

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
./run.sh python3 -m py_compile main.py backend/*.py   # adjust to actual module paths
./run.sh uv run --with pytest -- pytest -q
scripts/orchestration/run-quality-gates
```
- Frontend callable names unchanged: `grep -oE 'callable[^(]*\("([^"]+)"' src/*.ts | sort -u`
  before/after are identical.
- `npm run package` produces `Decky-Metadata.zip` containing every new `.py` module (unzip -l).
- `git status --short` clean.

### Deferred — on-device
Scan, activity refresh, delisted refresh, metadata save/remove all behave as before.


---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished main-py-decomposition
```

This writes:

```text
/tmp/Decky-Metadata/main-py-decomposition_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer main-py-decomposition`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/main-py-decomposition-review-*.md
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
   scripts/orchestration/clear-finished main-py-decomposition
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
   git add docs/review/main-py-decomposition-review-*.md
   git commit -m "docs(review): record main-py-decomposition review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished main-py-decomposition
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer main-py-decomposition` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed main-py-decomposition
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize main-py-decomposition
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Decky-Metadata/main-py-decomposition_finalized
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
scripts/orchestration/finalize main-py-decomposition
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Decky-Metadata/main-py-decomposition_finished
/tmp/Decky-Metadata/main-py-decomposition_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
