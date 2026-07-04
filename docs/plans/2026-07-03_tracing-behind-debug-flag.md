# Plan: Gate diagnostic tracing behind debug logging (tracing-behind-debug-flag)

## Context

`installSteamPatches` unconditionally installs three diagnostic tracers —
`installNavigationTrace`, `installHistoryInstanceTrace`, `installClickTrace` (~4244-4246) — that
wrap broad Steam-internal objects, walk object graphs, and log method calls **on every user's
default install**. Instrumentation should not ship on by default.

**Intended outcome:** install the three traces **only when backend debug logging is enabled**
(`getDebugLogging`). Default installs behavior, not instrumentation. This is an intentional,
desirable behavior change (less overhead + log noise by default).

**Ordering:** ideally before `steam-ts-decomposition` (the traces move to `diagnostics.ts` there).

### Relevant files
`src/steam.ts`, `src/backend.ts` (already has `getDebugLogging`), `dist/` rebuilt.

> Source: thermo-nuclear code-quality review (2026-07-03), findings corroborated by two independent reviewers (codex gpt-5.5 + agy) and verified against the code by the orchestrator.


**Slug used throughout this plan:** `tracing-behind-debug-flag`

---

## Orchestration Contract

**Slug:** `tracing-behind-debug-flag`

**Plan file:**

```text
docs/plans/2026-07-03_tracing-behind-debug-flag.md
```

**Implementation branch:**

```text
feat/tracing-behind-debug-flag
```

**Round-complete marker:**

```text
/tmp/Decky-Metadata/tracing-behind-debug-flag_finished
```

**Finalized marker:**

```text
/tmp/Decky-Metadata/tracing-behind-debug-flag_finalized
```

**Review notes:**

```text
docs/review/tracing-behind-debug-flag-review-*.md
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
git checkout -b feat/tracing-behind-debug-flag
```

Commit this plan first:

```bash
git add docs/plans/2026-07-03_tracing-behind-debug-flag.md
git commit -m "docs(plan): add tracing-behind-debug-flag implementation plan"
```

---

## Implementation Tasks

1. In the patch installer, read the debug-logging setting (via the existing
   `getDebugLogging` callable) during `installSteamPatches`.
2. Only `safeInstallStep(...)` the `navigationTrace` / `historyInstanceTrace` / `clickTrace` steps
   when debug logging is enabled. All other steps stay unconditional.
3. Handle the async fetch cleanly (the installer already awaits/loads other state) without blocking
   the non-trace patches; if the flag can't be read, default to **not** installing traces.
4. Document that toggling debug logging takes effect on next reload (unless trivially re-appliable).
5. `tsc` + `build` green; rebuild `dist/`; session log.

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
./run.sh npx tsc --noEmit
./run.sh npm run build
git status --short
```
- With debug logging **off**, the three trace `safeInstallStep` calls are not reached (assert via
  code path / a small guard test if feasible); with it **on**, they are.
- Non-trace patches remain unconditional.

### Deferred — on-device
Default install: activity/nav work with no trace log spam; enabling Debug Logging restores traces
after reload.


---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished tracing-behind-debug-flag
```

This writes:

```text
/tmp/Decky-Metadata/tracing-behind-debug-flag_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer tracing-behind-debug-flag`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/tracing-behind-debug-flag-review-*.md
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
   scripts/orchestration/clear-finished tracing-behind-debug-flag
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
   git add docs/review/tracing-behind-debug-flag-review-*.md
   git commit -m "docs(review): record tracing-behind-debug-flag review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished tracing-behind-debug-flag
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer tracing-behind-debug-flag` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed tracing-behind-debug-flag
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize tracing-behind-debug-flag
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Decky-Metadata/tracing-behind-debug-flag_finalized
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
scripts/orchestration/finalize tracing-behind-debug-flag
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Decky-Metadata/tracing-behind-debug-flag_finished
/tmp/Decky-Metadata/tracing-behind-debug-flag_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
