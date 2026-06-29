# Plan: SteamOS: defensive Steam UI guards (steamos-ui-guards)

## Context

The frontend patches internal Steam objects whose shapes change across SteamOS
Stable/Beta/Preview. Today a missing internal can throw and break unrelated features or the
Steam UI. This plan makes each patch independently optional and defensively guarded so the
plugin degrades feature-by-feature instead of crashing. It is also the capstone plan: it
updates the README for SteamOS support and bumps the version to the 1.5.0 release target.

Key facts (verify before relying on them):

- `src/steam.ts` (~4700 lines) accesses internals: `appStore` (8), `appDetailsStore` (10),
  `appDetailsCache` (6), `appAchievementProgressCache` (7), `SteamClient` (4),
  `m_mapAppOverview` (1), `allApps` (3). The spec mentions `SteamClient.Apps.GetAppDetails`,
  but that symbol is **not** used in this repo (0 references) — guard the internals that are
  actually accessed; do not introduce code for symbols the plugin doesn't use.
- There is no TypeScript unit-test harness; correctness here is enforced by `npx tsc
  --noEmit` + `npm run build` (the quality gate) and on-device testing. Do not add a JS test
  runner.
- `capabilities` and the settings diagnostics panel exist from
  `steamos-platform-capabilities`; reuse the panel to surface patch-install status.
- Current version is `1.4.0` in `package.json` and `plugin.json`.
- This plan file is already committed on base branch `dev`; a no-op "commit this plan
  first" is expected.

**Slug used throughout this plan:** `steamos-ui-guards`

---

## Orchestration Contract

**Slug:** `steamos-ui-guards`

**Plan file:**

```text
docs/plans/2026-06-28_steamos-ui-guards.md
```

**Implementation branch:**

```text
feat/steamos-ui-guards
```

**Round-complete marker:**

```text
/tmp/Playhub-Metadata-local/steamos-ui-guards_finished
```

**Finalized marker:**

```text
/tmp/Playhub-Metadata-local/steamos-ui-guards_finalized
```

**Review notes:**

```text
docs/review/steamos-ui-guards-review-*.md
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
git checkout -b feat/steamos-ui-guards
```

Commit this plan first:

```bash
git add docs/plans/2026-06-28_steamos-ui-guards.md
git commit -m "docs(plan): add steamos-ui-guards implementation plan"
```

---

## Implementation Tasks

### Defensive Steam UI guards (`src/steam.ts`, `src/contextMenuPatch.tsx`)

1. Add small predicate helpers for required internals, e.g. `hasSteamInternals()` returning
   `!!globalThis.SteamClient && !!appStore && !!appDetailsStore`, plus per-feature checks
   (achievement progress cache present, activity/app-details store present).
2. Before each patch registration, check the specific internals it needs; if absent, log a
   warning, skip that patch, and return no unpatch handle (e.g. `return []` / `undefined`)
   — without throwing.
3. Wrap every route/store patch registration in `try/catch`; only return an unpatch handle
   when installation succeeds. A failure in one patch must not prevent the others.
4. Do not assume `m_mapAppOverview` or `allApps` exist; guard before reading them and fall
   back safely.
5. Make each patch independently optional so failures isolate:
   - missing achievement progress cache → disables only the achievement UI patch;
   - missing activity store → disables only the activity patch;
   - the metadata panel remains available even if the achievement patch fails.
6. After a hard failure for a given patch, do not retry it in a loop within the same load
   (retry only on plugin reload).
7. Surface per-patch install status (installed / skipped-missing-internal / failed) in the
   settings diagnostics panel from `steamos-platform-capabilities`.

### Documentation & release finalization

8. Update `README.md`:
   - "Supported platforms": Windows Steam Big Picture **and** SteamOS / Steam Deck via Decky
     Loader.
   - a short SteamOS feature/limitations note (RetroAchievements first-class; Xbox/OpenXBL
     manual-only on SteamOS; UWPHook/Xbox-App auto scanning is Windows-only);
   - Decky sideload install from the generated ZIP and a pointer to `npm run package`;
   - a brief troubleshooting/diagnostics note referencing the settings diagnostics panel.
   Per `AGENTS.md` §7, if you add/refresh README images, bump their `cacheBuster`.
9. Bump the version to `1.5.0` in both `package.json` and `plugin.json`. (Tagging/publishing
   the release is a separate manual step gated by the human; do not tag or publish here.)
10. Record a session summary under `docs/agent_conversations/` per `AGENTS.md` §9.

Scope note: do not change backend Python behavior in this plan beyond what diagnostics
surfacing strictly requires.

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

Run and confirm:

```bash
scripts/orchestration/run-quality-gates    # tsc --noEmit + build + py_compile + pytest
git status --short                          # clean
grep -n '"version"' package.json plugin.json   # both show 1.5.0
```

Expected:

- `npx tsc --noEmit` passes with the new guards and predicate helpers.
- `npm run build` regenerates `dist/index.js` without error.
- `package.json` and `plugin.json` both report `1.5.0`.
- README documents SteamOS support, install, and diagnostics.

Deferred verification (record in the session log; requires hardware): on real SteamOS
Stable/Beta and a non-SteamOS Linux Decky device, confirm that navigating Steam does not
crash when a patch target is missing, that a missing achievement cache disables only the
achievement patch (metadata panel still works), and that Windows behavior is unregressed.
Tagging/publishing `1.5.0` is a separate human-gated release step.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished steamos-ui-guards
```

This writes:

```text
/tmp/Playhub-Metadata-local/steamos-ui-guards_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer steamos-ui-guards`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/steamos-ui-guards-review-*.md
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
   scripts/orchestration/clear-finished steamos-ui-guards
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
   git add docs/review/steamos-ui-guards-review-*.md
   git commit -m "docs(review): record steamos-ui-guards review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished steamos-ui-guards
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer steamos-ui-guards` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed steamos-ui-guards
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize steamos-ui-guards
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Playhub-Metadata-local/steamos-ui-guards_finalized
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
scripts/orchestration/finalize steamos-ui-guards
```

Do not manually merge into `main` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Playhub-Metadata-local/steamos-ui-guards_finished
/tmp/Playhub-Metadata-local/steamos-ui-guards_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
