# Plan: Fix in-repo build staging and hardcoded plugin version (build-and-version-nits)

## Context

Two small, low-risk tooling nits from the review:
- **`scripts/package.mjs`** stages temp build state at `repoRoot/build-package` (~line 28) despite
  the project policy that temp/cache lives under `/tmp/Decky-Metadata` (it is gitignored, so impact
  is low, but it violates the convention `run.sh` establishes).
- **`src/components.tsx`** hardcodes `PLUGIN_VERSION = "0.1.0"` (~line 64) which
  `scripts/set_release_version.py` does **not** update; it is only a fallback, since the real
  version is fetched from the backend on mount.

**Intended outcome:** stage the build under `/tmp/Decky-Metadata/build-package`, and drop the
hardcoded version fallback (use `""` initial state). The produced `Decky-Metadata.zip` is unchanged.

### Relevant files
`scripts/package.mjs`, `src/components.tsx`, `dist/` rebuilt.

> Source: thermo-nuclear code-quality review (2026-07-03), findings corroborated by two independent reviewers (codex gpt-5.5 + agy) and verified against the code by the orchestrator.


**Slug used throughout this plan:** `build-and-version-nits`

---

## Orchestration Contract

**Slug:** `build-and-version-nits`

**Plan file:**

```text
docs/plans/2026-07-03_build-and-version-nits.md
```

**Implementation branch:**

```text
feat/build-and-version-nits
```

**Round-complete marker:**

```text
/tmp/Decky-Metadata/build-and-version-nits_finished
```

**Finalized marker:**

```text
/tmp/Decky-Metadata/build-and-version-nits_finalized
```

**Review notes:**

```text
docs/review/build-and-version-nits-review-*.md
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
git checkout -b feat/build-and-version-nits
```

Commit this plan first:

```bash
git add docs/plans/2026-07-03_build-and-version-nits.md
git commit -m "docs(plan): add build-and-version-nits implementation plan"
```

---

## Implementation Tasks

1. `scripts/package.mjs`: set `stagingRoot` to `/tmp/Decky-Metadata/build-package`
   (create it if missing; keep the final `Decky-Metadata.zip` in the repo root). Update the
   `assertPathInside(...)` guard so it validates against the new staging base, not `repoRoot`.
   Ensure cleanup (`fs.rmSync`) still targets the new location.
2. `src/components.tsx`: remove the hardcoded `PLUGIN_VERSION = "0.1.0"`; initialize the version
   state to `""` (the backend version is always fetched on mount) and update the fallback usage
   accordingly so the UI shows nothing/`local` until the backend responds.
3. `npm run package` still produces `Decky-Metadata.zip`; `tsc` + `build` green; rebuild `dist/`.

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
./run.sh npx tsc --noEmit && ./run.sh npm run build
node ./scripts/package.mjs --release && ls -la Decky-Metadata.zip   # zip still produced
ls /tmp/Decky-Metadata/build-package 2>/dev/null || echo "staging cleaned (ok)"
grep -n 'PLUGIN_VERSION *= *"0.1.0"' src/components.tsx || echo "hardcoded version gone"
git status --short
```
- Staging no longer created inside the repo; zip output unchanged in name/contents.
- No hardcoded version string remains.


---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished build-and-version-nits
```

This writes:

```text
/tmp/Decky-Metadata/build-and-version-nits_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer build-and-version-nits`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/build-and-version-nits-review-*.md
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
   scripts/orchestration/clear-finished build-and-version-nits
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
   git add docs/review/build-and-version-nits-review-*.md
   git commit -m "docs(review): record build-and-version-nits review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished build-and-version-nits
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer build-and-version-nits` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed build-and-version-nits
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize build-and-version-nits
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Decky-Metadata/build-and-version-nits_finalized
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
scripts/orchestration/finalize build-and-version-nits
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Decky-Metadata/build-and-version-nits_finished
/tmp/Decky-Metadata/build-and-version-nits_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
