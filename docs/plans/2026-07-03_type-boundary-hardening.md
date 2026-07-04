# Plan: Harden Steam and metadata type boundaries (type-boundary-hardening)

## Context

Type boundaries are too loose for the amount of Steam-shape fakery. Frontend: Steam
internals are global `any`; native event builders return giant `any` objects; `MetadataNews` omits
fields the code reads via casts (`news as any` appears ~8× in `src/steam.ts`) — e.g. `image_sources`,
`image_url`, `preview_image_url`, `raw_body`, `event_type`, gid/Steam IDs. Backend: the metadata
record is `dict[str, Any]` despite a stable ~18-key shape, forcing `isinstance`/`_safe_int` guards
at every call site.

**Intended outcome:** explicit minimal contracts — `SteamInternals`, `SteamOverview`,
`MetadataNewsActivityFields`, `NativePartnerEvent` (TS) and a `MetadataRecord` `TypedDict` (Python)
— with unsafe discovery pushed behind type guards. **Behavior-preserving** (runtime shape identical).

**Ordering:** coordinate with the `steam-ts` / `main-py` decompositions (do after, or as part of).

### Relevant files
`src/types.ts`, `src/steam.ts`, `main.py`, `dist/` rebuilt, `tests/`.

> Source: thermo-nuclear code-quality review (2026-07-03), findings corroborated by two independent reviewers (codex gpt-5.5 + agy) and verified against the code by the orchestrator.


**Slug used throughout this plan:** `type-boundary-hardening`

---

## Orchestration Contract

**Slug:** `type-boundary-hardening`

**Plan file:**

```text
docs/plans/2026-07-03_type-boundary-hardening.md
```

**Implementation branch:**

```text
feat/type-boundary-hardening
```

**Round-complete marker:**

```text
/tmp/Decky-Metadata/type-boundary-hardening_finished
```

**Finalized marker:**

```text
/tmp/Decky-Metadata/type-boundary-hardening_finalized
```

**Review notes:**

```text
docs/review/type-boundary-hardening-review-*.md
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
git checkout -b feat/type-boundary-hardening
```

Commit this plan first:

```bash
git add docs/plans/2026-07-03_type-boundary-hardening.md
git commit -m "docs(plan): add type-boundary-hardening implementation plan"
```

---

## Implementation Tasks

1. Frontend: declare the missing fields on `MetadataNews` (or a dedicated
   `MetadataNewsActivityFields`) and add `SteamInternals`/`SteamOverview`/`NativePartnerEvent`
   types in `types.ts`. Replace `news as any` / global `any` access with a typed guard at the
   discovery boundary, then use the typed value.
2. Backend: add `MetadataRecord(TypedDict)` for the metadata store shape and type the
   load/save/accessor paths with it, removing redundant `isinstance`/`_safe_int` guards where the
   type now guarantees the shape. Keep the on-disk JSON shape identical.
3. `tsc --noEmit` (strict) clean; pytest green; rebuild `dist/`; session log.

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
./run.sh uv run --with pytest -- pytest -q
git status --short
```
- `grep -c 'news as any' src/steam.ts` drops substantially (ideally 0).
- No change to persisted JSON shape (a load→save round-trip test is byte-stable).

### Deferred — on-device
Activity news + metadata editor behave identically.


---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished type-boundary-hardening
```

This writes:

```text
/tmp/Decky-Metadata/type-boundary-hardening_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer type-boundary-hardening`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/type-boundary-hardening-review-*.md
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
   scripts/orchestration/clear-finished type-boundary-hardening
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
   git add docs/review/type-boundary-hardening-review-*.md
   git commit -m "docs(review): record type-boundary-hardening review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished type-boundary-hardening
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer type-boundary-hardening` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed type-boundary-hardening
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize type-boundary-hardening
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Decky-Metadata/type-boundary-hardening_finalized
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
scripts/orchestration/finalize type-boundary-hardening
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Decky-Metadata/type-boundary-hardening_finished
/tmp/Decky-Metadata/type-boundary-hardening_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
