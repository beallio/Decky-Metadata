# Plan: Make the QAM Missing-metadata stat match the scan's needs-scan count (missing-count-consistency)

## Context

Decky Metadata (Decky plugin: TS/React `src/*` → `dist/index.js`, Python `main.py`) shows a
QAM stat **"Missing metadata"** that disagrees with what the **Scan metadata** action reports.
Example: the panel says 4 missing, but starting a scan says it is scanning **5**.

Root cause (confirmed in code): the two numbers are computed differently.

- **Frontend "Missing metadata"** = `games.length - metadataCount` where
  `metadataCount = Object.keys(metadataCache).length` — i.e. games that have **no metadata
  entry at all** (`src/components.tsx`, `const missing = Math.max(games.length - metadataCount, 0)`).
- **Backend scan total** = the number of games where `_metadata_needs_scan(app_id)` is true
  (`main.py` `_scan_missing`). `_metadata_needs_scan` returns true not only when there is no
  entry, but also when the entry is an **empty/manual shell** (no title, or `source in {"",
  "manual"}` with no description). So a game with a placeholder entry is *not* counted as
  "missing" by the frontend but *is* counted by the scan → the counts diverge.

**Intended outcome:** make the "Missing metadata" stat equal the number of games the scan will
actually process, so the two always agree. The backend's `_metadata_needs_scan` is the single
source of truth; expose that count and have the QAM stat use it.

### Relevant files

`main.py` (new count method + callable), `src/backend.ts` (callable binding),
`src/components.tsx` (use the backend count for the "Missing metadata" stat), `tests/` (backend
pytest), `dist/index.js` (rebuilt), `docs/agent_conversations/`.

**Out of scope:** the QAM scroll/layout work (lives on a separate branch), changing the scan
algorithm or `_metadata_needs_scan` semantics, the "Detected non-Steam games" and "Metadata
saved" stats (leave as-is), and any styling. Do not modify `src/steam.ts`.

**Test infra note:** the frontend has no TS test runner (gate = `tsc` + rollup build); the
backend count is covered by **pytest** (in the gate). Keep the frontend change minimal and
typed; do not add a JS test framework.

**Slug used throughout this plan:** `missing-count-consistency`

---

## Orchestration Contract

**Slug:** `missing-count-consistency`

**Plan file:**

```text
docs/plans/2026-07-03_missing-count-consistency.md
```

**Implementation branch:**

```text
feat/missing-count-consistency
```

**Round-complete marker:**

```text
/tmp/Decky-Metadata/missing-count-consistency_finished
```

**Finalized marker:**

```text
/tmp/Decky-Metadata/missing-count-consistency_finalized
```

**Review notes:**

```text
docs/review/missing-count-consistency-review-*.md
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
git checkout -b feat/missing-count-consistency
```

Commit this plan first:

```bash
git add docs/plans/2026-07-03_missing-count-consistency.md
git commit -m "docs(plan): add missing-count-consistency implementation plan"
```

---

## Implementation Tasks

Work in order via `./run.sh`. Follow TDD (the backend count is pytest-covered). Locate code by
symbol.

### Task 1 — Backend: expose the needs-scan count (`main.py`) + pytest

- Add `async def get_missing_metadata_count(self, games: list[dict[str, Any]]) -> int` on the
  `Plugin` class (place it near `get_scan_progress` / `start_scan_missing`). It must count games
  the scan would process, using the **same filter** `_scan_missing` uses:

  ```python
  self._load_data()
  return sum(
      1
      for game in (games or [])
      if isinstance(game, dict)
      and str(game.get("appid", "")).strip()
      and self._metadata_needs_scan(int(game.get("appid")))
  )
  ```

  Reuse `_metadata_needs_scan` — do **not** duplicate or change its logic. Never raise on a bad
  entry (wrap the `int(...)` in the comprehension guard as `_scan_missing` effectively does; if
  an appid is non-numeric, skip it).
- Add `tests/test_missing_count.py` (pytest, reuse the existing conftest `make_plugin` pattern):
  seed `_data["metadata"]` and assert the count for a mix of: a game with **no** entry (counts),
  a game with a **complete** entry — real title + a source + description (does **not** count), a
  game with an **empty/manual shell** — `source: "Manual"`, empty description (counts), and a
  non-numeric/blank appid (skipped). Assert the returned count equals the number the scan filter
  would select for the same inputs.

### Task 2 — Frontend: drive "Missing metadata" from the backend count

- In `src/backend.ts`, add the binding next to the other callables:
  `export const getMissingMetadataCount = callable<[games: GameOption[]], number>("get_missing_metadata_count");`
  (match the argument type used by `startScanMissing` for `games`.)
- In `src/components.tsx`:
  - Add state `const [missing, setMissing] = useState(0);` and **remove** the derived
    `const missing = Math.max(games.length - metadataCount, 0);`.
  - Load it wherever `games`/metadata are (re)loaded so it stays fresh: in `refresh()` (after
    `loadGames()`), and after a scan completes / cache clear / metadata save — i.e. anywhere
    `setMetadataCount(...)` is currently called, also call
    `getMissingMetadataCount(games).then(setMissing)` (guard with `.catch` → keep prior value).
    Use the current `games` list.
  - The **"Missing metadata"** stat now renders this `missing` state. Leave "Detected non-Steam
    games" (`games.length`) and "Metadata saved" (`metadataCount`) unchanged.
  - Keep it typed; no other UI change. Note that `missing` may now exceed `games.length -
    metadataCount` when shells exist — that is the intended fix (it matches the scan).

### Task 3 — Rebuild bundle + session log

- `./run.sh npm run build`; stage `dist/`.
- Record `docs/agent_conversations/2026-07-03_missing-count-consistency.md`: the root cause (two
  divergent formulas), the backend-authoritative fix (`get_missing_metadata_count` reusing
  `_metadata_needs_scan`), the frontend wiring points, and the no-TS-runner note.

### Scope discipline

Only the "Missing metadata" count. Do NOT change `_metadata_needs_scan`, the scan algorithm,
`src/steam.ts`, the other two stats, styling, or the QAM layout. Preserve all other behavior.

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

Automated (run via `./run.sh`):

```bash
./run.sh npx tsc --noEmit                       # no type errors
./run.sh npm run build                          # dist/index.js regenerated
./run.sh python3 -m py_compile main.py          # backend byte-compiles
./run.sh uv run --with pytest -- pytest -q       # full suite incl. tests/test_missing_count.py
scripts/orchestration/run-quality-gates
git status --short                               # clean
```

Grep/scope gates:

```bash
grep -nE "get_missing_metadata_count" main.py src/backend.ts        # backend method + binding
grep -nE "getMissingMetadataCount|setMissing" src/components.tsx     # wired into the stat
grep -nE "games.length - metadataCount" src/components.tsx           # expect GONE
git diff --name-only dev..HEAD -- src/steam.ts                       # expect empty
```

Static review:

- Task 1: `get_missing_metadata_count` reuses `_metadata_needs_scan` and matches the
  `_scan_missing` filter; pytest covers no-entry/complete/shell/bad-appid cases.
- Task 2: the "Missing metadata" stat reads backend-provided state; the old derived formula is
  removed; the other two stats unchanged.

### Deferred verification — on-device (cannot run here)

Sideload, open the QAM: the **Missing metadata** stat now equals the number reported when you
press **Scan metadata** (e.g. both show 5), including when some games have manual/placeholder
metadata shells.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished missing-count-consistency
```

This writes:

```text
/tmp/Decky-Metadata/missing-count-consistency_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer missing-count-consistency`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/missing-count-consistency-review-*.md
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
   scripts/orchestration/clear-finished missing-count-consistency
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
   git add docs/review/missing-count-consistency-review-*.md
   git commit -m "docs(review): record missing-count-consistency review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished missing-count-consistency
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer missing-count-consistency` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed missing-count-consistency
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize missing-count-consistency
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Decky-Metadata/missing-count-consistency_finalized
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
scripts/orchestration/finalize missing-count-consistency
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Decky-Metadata/missing-count-consistency_finished
/tmp/Decky-Metadata/missing-count-consistency_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
