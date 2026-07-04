# Plan: Decompose src/steam.ts monolith into focused modules (steam-ts-decomposition)

## Context

`src/steam.ts` is a **4,745-line monolith** mixing at least seven orthogonal concerns: the
Steam client/store bridge, non-Steam metadata patching, native Activity event modelling, the
native Activity/partner store patches, navigation/history redirects, diagnostic tracing, and
non-Steam game discovery/tab detection. Its size and coupling make it hard to scan or change
safely.

**Intended outcome:** split by ownership into focused modules under `src/steam/`, leaving
`installSteamPatches` as a thin installer that wires them together. **Behavior-preserving** — move
code verbatim, do not rewrite logic.

**Ordering:** run **after** `dead-code-removal` (fewer lines to move) and ideally after
`tracing-behind-debug-flag`. Coordinate with `type-boundary-hardening`.

### Relevant files
`src/steam.ts` → new `src/steam/*.ts`, `src/index.tsx` (import surface), `dist/` (rebuilt).

> Source: thermo-nuclear code-quality review (2026-07-03), findings corroborated by two independent reviewers (codex gpt-5.5 + agy) and verified against the code by the orchestrator.


**Slug used throughout this plan:** `steam-ts-decomposition`

---

## Orchestration Contract

**Slug:** `steam-ts-decomposition`

**Plan file:**

```text
docs/plans/2026-07-03_steam-ts-decomposition.md
```

**Implementation branch:**

```text
feat/steam-ts-decomposition
```

**Round-complete marker:**

```text
/tmp/Decky-Metadata/steam-ts-decomposition_finished
```

**Finalized marker:**

```text
/tmp/Decky-Metadata/steam-ts-decomposition_finalized
```

**Review notes:**

```text
docs/review/steam-ts-decomposition-review-*.md
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
git checkout -b feat/steam-ts-decomposition
```

Commit this plan first:

```bash
git add docs/plans/2026-07-03_steam-ts-decomposition.md
git commit -m "docs(plan): add steam-ts-decomposition implementation plan"
```

---

## Implementation Tasks

Behavior-preserving extraction. Move symbols verbatim; only adjust imports/exports.

1. Create modules by ownership, e.g.: `src/steam/internals.ts` (SteamClient/store access + `any`
   discovery), `src/steam/metadataPatch.ts`, `src/steam/activityModel.ts` (native event builders),
   `src/steam/activityStorePatch.ts` (native activity + partner-event store patches),
   `src/steam/navigationRedirect.ts`, `src/steam/diagnostics.ts` (traces), `src/steam/tabDetection.ts`,
   `src/steam/nonSteamGames.ts`.
2. Keep `installSteamPatches` (in `steam.ts` or a new `steam/index.ts`) as a small installer that
   imports each module's installer and calls `safeInstallStep(...)` in the **same order** as today.
3. Preserve the exact public surface imported by `src/index.tsx` / `src/contextMenuPatch.tsx`
   (re-export from an index if you move it). Do not rename exported symbols.
4. No logic changes. Aim for each new module under ~800 lines.
5. `tsc --noEmit` and `npm run build` green; rebuild `dist/`; session log.

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
git status --short                      # clean after rebuild
```
- The set of symbols imported by `src/index.tsx` is unchanged (diff the import lines).
- The `safeInstallStep` install order is identical to before.
- No single new module is oversized (>~800 lines); grep `wc -l src/steam/*.ts`.
- Backend pytest unaffected.

### Deferred — on-device
Activity news, navigation redirects, context-menu entry, and non-Steam discovery all behave
exactly as before.


---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished steam-ts-decomposition
```

This writes:

```text
/tmp/Decky-Metadata/steam-ts-decomposition_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer steam-ts-decomposition`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/steam-ts-decomposition-review-*.md
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
   scripts/orchestration/clear-finished steam-ts-decomposition
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
   git add docs/review/steam-ts-decomposition-review-*.md
   git commit -m "docs(review): record steam-ts-decomposition review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished steam-ts-decomposition
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer steam-ts-decomposition` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed steam-ts-decomposition
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize steam-ts-decomposition
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Decky-Metadata/steam-ts-decomposition_finalized
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
scripts/orchestration/finalize steam-ts-decomposition
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Decky-Metadata/steam-ts-decomposition_finished
/tmp/Decky-Metadata/steam-ts-decomposition_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
