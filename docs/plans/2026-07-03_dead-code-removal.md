# Plan: Remove confirmed dead code from backend and steam patches (dead-code-removal)

## Context

Two independent thermo-nuclear reviews and orchestrator verification confirmed a body of
**dead code** (defined, zero live callers / never installed) inflating the two largest files.
Deleting it removes hundreds of lines with **zero behavior change**.

**`main.py` — dead symbols (verified zero live callers):**
- `_http_text_urllib` (~2245), `_http_text_curl` (~2257) — alternate HTTP strategies never
  called; the live fetch is `_http_text`.
- `_youtube_videos_for_title` (~2087), `_rawg_images_for_title` (~2123) — provider helpers, no
  callers.
- `_sanitize_videos` (~2000) — its **only** caller is `_youtube_videos_for_title` (itself dead),
  so it is **transitively dead**.
- `_title_match_score` (~2368) — unused static method (a live matcher exists elsewhere).
- `ROM_EXTENSIONS` (~253) — unused module constant.

**`src/steam.ts` — dead legacy Activity-overlay subsystem (never installed):**
The active Activity path is the **native store patch** (`installNativeActivityStorePatch` /
`installNativePartnerEventStorePatch`, both in the `safeInstallStep` list). The legacy overlay/
DOM/React-intercept path is **defined but never `safeInstallStep`-installed** — a source comment
even says these are "kept in source only as old fallbacks." Confirmed-uninstalled entrypoints:
`installActivityNewsDomPatch` (~2708), `installActivityEmptyStateReactPatch` (~3074), the route
patch that mounts `DeckyActivityNewsOverlay` (~4098-4110), and `DeckyActivityNewsOverlay` (~2767)
itself — plus their private helpers, CSS injection, and DOM/React card renderers reachable **only**
from those uninstalled functions.

**Intended outcome:** delete both dead clusters; the running plugin is byte-for-byte identical.

### Relevant files
`main.py`, `src/steam.ts`, `dist/index.js` (rebuilt), `tests/` (ensure none reference deleted
symbols), `docs/agent_conversations/`.

**Out of scope:** any **installed** patch or the native activity store patch; decomposition of the
files (separate plans); behavior changes; the browser User-Agent strings; `_http_text`. Do not
touch `main.py` Windows-runtime (already removed) or unrelated logic.

> Source: thermo-nuclear code-quality review (2026-07-03), findings corroborated by two independent reviewers (codex gpt-5.5 + agy) and verified against the code by the orchestrator.


**Slug used throughout this plan:** `dead-code-removal`

---

## Orchestration Contract

**Slug:** `dead-code-removal`

**Plan file:**

```text
docs/plans/2026-07-03_dead-code-removal.md
```

**Implementation branch:**

```text
feat/dead-code-removal
```

**Round-complete marker:**

```text
/tmp/Decky-Metadata/dead-code-removal_finished
```

**Finalized marker:**

```text
/tmp/Decky-Metadata/dead-code-removal_finalized
```

**Review notes:**

```text
docs/review/dead-code-removal-review-*.md
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
git checkout -b feat/dead-code-removal
```

Commit this plan first:

```bash
git add docs/plans/2026-07-03_dead-code-removal.md
git commit -m "docs(plan): add dead-code-removal implementation plan"
```

---

## Implementation Tasks

Work in order. This is deletion-only; no behavior may change.

### Task 1 — main.py: delete the dead symbols
For **each** symbol, first re-confirm zero live callers with grep, then delete the definition and
any now-orphaned imports/state:
`_http_text_urllib`, `_http_text_curl`, `_youtube_videos_for_title`, `_rawg_images_for_title`,
`_sanitize_videos` (delete only after confirming its sole caller `_youtube_videos_for_title` is
gone), `_title_match_score`, `ROM_EXTENSIONS`.
- After deletion, grep the repo to confirm each symbol appears **nowhere** in `main.py`, `src/`,
  or `tests/`.
- Remove any import that becomes unused as a result (verify with a lint/grep; do not remove an
  import still used elsewhere).
- `./run.sh python3 -m py_compile main.py` and the full pytest suite must stay green.

### Task 2 — src/steam.ts: delete the uninstalled legacy overlay closure
- Enumerate the functions actually installed via `safeInstallStep(...)` in `installSteamPatches`
  (the canonical install list). Treat every symbol **not reachable** from an installed step as a
  deletion candidate.
- Delete the legacy overlay subsystem: `installActivityNewsDomPatch`,
  `installActivityEmptyStateReactPatch`, the uninstalled Activity-news **route patch** that mounts
  the overlay, `DeckyActivityNewsOverlay`, and their private helpers, injected CSS, and DOM/React
  card-rendering code that is referenced **only** by those symbols.
- Do the deletion as a **reachability closure**: remove a helper only once its last remaining
  reference is itself being deleted. Do NOT delete anything referenced by an installed step.
- Update/remove the stale "kept in source only as old fallbacks" comment so it no longer describes
  code that is gone.
- `./run.sh npx tsc --noEmit` must stay green (no dangling references) and `npm run build` must
  succeed.

### Task 3 — Rebuild + session log
- `./run.sh npm run build`; stage `dist/`.
- Record `docs/agent_conversations/2026-07-03_dead-code-removal.md`: the verified dead clusters,
  the reachability-closure method used for steam.ts, and confirmation that the installed
  (native) activity path and all other behavior are untouched.

### Scope discipline
Deletion only. Preserve every installed patch, the native activity store path, `_http_text`, the
UA strings, and all Linux/SteamOS behavior. No decomposition, no logic edits.

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

Automated (via `./run.sh`):

```bash
./run.sh python3 -m py_compile main.py
./run.sh npx tsc --noEmit
./run.sh npm run build
./run.sh uv run --with pytest -- pytest -q
scripts/orchestration/run-quality-gates
git status --short                       # clean (dist restaged)
```

Grep gates (all expect NONE in main.py/src/tests):
```bash
grep -rnE '_http_text_urllib|_http_text_curl|_youtube_videos_for_title|_rawg_images_for_title|_sanitize_videos|_title_match_score|ROM_EXTENSIONS' main.py src tests
grep -nE 'installActivityNewsDomPatch|installActivityEmptyStateReactPatch|DeckyActivityNewsOverlay' src/steam.ts
```
Still present (the installed native path — must be untouched):
```bash
grep -nE 'installNativeActivityStorePatch|installNativePartnerEventStorePatch' src/steam.ts
grep -c 'safeInstallStep' src/steam.ts     # install list intact
```
Scope: `git diff --name-only dev..HEAD` shows only `main.py`, `src/steam.ts`, `dist/*`,
`docs/*`.

### Deferred verification — on-device
Sideload and open a non-Steam game's Activity: native Steam news still renders (native store
patch path), navigation redirects still work, and metadata scan/save is unchanged. No overlay
regressions (the overlay was already never mounted).


---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished dead-code-removal
```

This writes:

```text
/tmp/Decky-Metadata/dead-code-removal_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer dead-code-removal`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/dead-code-removal-review-*.md
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
   scripts/orchestration/clear-finished dead-code-removal
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
   git add docs/review/dead-code-removal-review-*.md
   git commit -m "docs(review): record dead-code-removal review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished dead-code-removal
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer dead-code-removal` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed dead-code-removal
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize dead-code-removal
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Decky-Metadata/dead-code-removal_finalized
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
scripts/orchestration/finalize dead-code-removal
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Decky-Metadata/dead-code-removal_finished
/tmp/Decky-Metadata/dead-code-removal_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
