# Plan: Normalize steam_store_state at Metadata Load (delisted-state-load-migration)

## Context

**User-visible problem.** The Market quick link still appears under Game Info
for delisted matched games, despite the `delisted-market-button-visibility`
work (merged as `f9c755d`). That plan's frontend logic is correct and targets
the right flag (Steam's `BHasMarketPresence(e)` reads
`e.bCommunityMarketPresence`; verified in the on-device Steam bundle), but it
only works when the metadata record the frontend receives actually carries
`steam_store_state`.

**Root cause (verified on-device).** The merged implementation deviated from
its plan: the plan required updating backend "sanitization/**loading**" so the
field is normalized, but only the save path got it (`_sanitize_metadata`,
`main.py:763-768`). `_load_data` (`main.py:487-494`) returns raw disk records
and `get_all_metadata` (`main.py:342-344`) passes them through unmigrated, so a
record only gains `steam_store_state` when something incidentally re-saves it.
On the Deck today, 9 of 15 records still have no `steam_store_state` and 4 are
`unknown`; when the frontend receives a delisted record without the field,
`applyMetadata` (`src/steam/metadataPatch.ts:251-257`) falls into the
`else if (screenshots.length)` branch and forces
`bCommunityMarketPresence = true` — Market shows. The two Transformers records
have since been incidentally migrated (`delisted`), but any other delisted
title, and any future re-scan that writes a record without the field,
reproduces the bug.

**Prerequisite for observing the fix.** On-device verification requires
`cold-boot-patch-install` (plan
`docs/plans/2026-07-10_cold-boot-patch-install.md`) to be merged first — in the
current Deck session the frontend patches are not installed at all.
Implementation of this plan is independent (backend-only).

**Intended outcome.** Every metadata record served to the frontend has a
normalized `steam_store_state` (`available` | `delisted` | `unknown`),
including legacy records, immediately after backend load — classified from the
cached delisted index only, with no network calls on the load path. Delisted
matches therefore never force the Market flag on.

**Relevant files:** `main.py`, `backend/storage.py` (read-only reference),
`tests/` (new focused test file). No frontend changes.

**Slug used throughout this plan:** `delisted-state-load-migration`

---

## Orchestration Contract

**Slug:** `delisted-state-load-migration`

**Plan file:**

```text
docs/plans/2026-07-10_delisted-state-load-migration.md
```

**Implementation branch:**

```text
feat/delisted-state-load-migration
```

**Round-complete marker:**

```text
/tmp/Decky-Metadata/delisted-state-load-migration_finished
```

**Finalized marker:**

```text
/tmp/Decky-Metadata/delisted-state-load-migration_finalized
```

**Review notes:**

```text
docs/review/delisted-state-load-migration-review-*.md
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
git checkout -b feat/delisted-state-load-migration
```

Commit this plan first:

```bash
git add docs/plans/2026-07-10_delisted-state-load-migration.md
git commit -m "docs(plan): add delisted-state-load-migration implementation plan"
```

---

## Implementation Tasks

Backend-only (Python). TDD applies (`.protocol: TDD_REQUIRED=true`): write the
failing tests first, then implement. Run Python commands through `./run.sh`.

### Task 1 — tests first (`tests/test_store_state_load_migration.py`)

Create a new focused test file, following the fixture/monkeypatch patterns in
`tests/test_delisted_market.py` and `tests/test_load_data_caching.py`. Cover at
least:

1. A legacy record on disk with a `steam_appid` and **no** `steam_store_state`,
   whose appid is in the cached delisted index, is served by `get_all_metadata`
   with `steam_store_state == "delisted"`.
2. The same shape with an appid **not** in the cached delisted index is served
   with `steam_store_state == "unknown"`.
3. A record with an invalid value (e.g. `"DELISTED "` mixed case/whitespace or
   `"bogus"`) normalizes (`"delisted"` for the trimmed/lowercased valid value;
   `"unknown"` for garbage).
4. Records already carrying a valid value (`available`, `delisted`, `unknown`)
   are served unchanged, and `delisted` is never downgraded at load.
5. The migration persists: after the first load that changed anything, the data
   file on disk contains the normalized values, and a second load performs no
   further save (assert via save-count or file mtime, mirroring how
   `tests/test_load_data_caching.py` observes save/load behavior).
6. No network access happens on the load path: monkeypatch the HTTP layer used
   by the delisted provider to raise if called, and rely only on a pre-seeded
   cached index (the same way `tests/test_delisted_index.py` fabricates one).
7. `get_metadata` (single-record path, `main.py:338-340`) serves the normalized
   value too.

### Task 2 — load-time normalization (`main.py`)

1. Add a private helper, e.g. `_normalize_loaded_store_states(self) -> bool`,
   that iterates `self._data["metadata"]` records (dict values only) and for
   each record:
   - reads `steam_store_state`, trims/lowercases it;
   - if the result is one of `available` / `delisted` / `unknown`, writes the
     normalized form back only if it differs;
   - otherwise (missing/invalid): sets `"delisted"` when the record has a
     `steam_appid` and `self._appid_is_delisted_cached(steam_appid)` is true
     (`main.py:920` — cache/disk-index only, never network), else `"unknown"`;
   - never overwrites an existing valid `"delisted"` with anything else;
   - never sets `"available"` at load time (no load-time evidence for it);
   returns True when any record changed.
2. Call the helper from `_load_data` (`main.py:487-494`) after `self._data` is
   assigned from a load result, and call `self._save_data()` once when the
   helper reports changes. Because all records are valid after the first
   migration, subsequent loads must be change-free (no repeated saves — this is
   what test 5 in Task 1 asserts). Guard the whole normalize+save step so an
   exception cannot break `_load_data` (log via `_plog` and continue).
3. Do not change `_sanitize_metadata` (`main.py:705-800`) — the save-path
   normalization stays as is. Do not touch `backend/storage.py`.

### Task 3 — session log

Record a session summary at
`docs/agent_conversations/2026-07-10_delisted-state-load-migration.md` per
`AGENTS.md`, covering: the spec deviation this closes (sanitize-on-save only),
the load-path classification rules (cache-only, never `available`), and the
deferred on-device verification below.

### Scope discipline (exact allowed change list)

May change:

- `main.py` — Tasks 2 only.
- `tests/test_store_state_load_migration.py` — new file (Task 1).
- `docs/plans/2026-07-10_delisted-state-load-migration.md` (first commit),
  `docs/agent_conversations/` session log, committed review notes.

Must NOT change: `src/` (no frontend changes, no dist rebuild needed),
`backend/`, existing test files' expected values, `package.json`,
`plugin.json`. Do not add title- or appid-specific hacks; behavior must derive
from the cached delisted index.

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

Automated (must pass before any round is marked complete):

```bash
./run.sh uv run --with pytest -m pytest tests/test_store_state_load_migration.py -q
scripts/orchestration/run-quality-gates
```

The new tests are the primary proof for this plan's behavior (backend-only, no
frontend surface to drive locally).

**Deferred on-device verification (required before dev→main; performed by the
human/orchestrator on the Steam Deck, not by the implementer). Prerequisites:
`cold-boot-patch-install` merged and verified (frontend patches alive), ideally
`gameinfo-shield-exhaustion` merged too so the quick-links row is stable enough
to observe.**

1. Back up `~/homebrew/settings/Decky-Metadata/decky_metadata.json`, then strip
   `steam_store_state` from one delisted record (e.g. Transformers Fall of
   Cybertron, shortcut `3276984150` → Steam appid `213120`) to simulate a
   legacy record. Restart the plugin backend (reload the plugin or restart
   Decky).
2. Confirm the JSON file regains `steam_store_state: "delisted"` for that
   record after the backend loads, without any scan being run.
3. Open the game's Game Info tab: no Market quick link on first render, and
   still none after a Discussions round-trip.
4. Spot-check an available matched Steam title: Market still shows there if
   Steam normally exposes it.
5. Confirm the remaining legacy records on the device (those with a
   `steam_appid` and previously no `steam_store_state`) now all carry
   `delisted`/`unknown` values consistent with the cached delisted index.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished delisted-state-load-migration
```

This writes:

```text
/tmp/Decky-Metadata/delisted-state-load-migration_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer delisted-state-load-migration`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/delisted-state-load-migration-review-*.md
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
   scripts/orchestration/clear-finished delisted-state-load-migration
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
   git add docs/review/delisted-state-load-migration-review-*.md
   git commit -m "docs(review): record delisted-state-load-migration review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished delisted-state-load-migration
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer delisted-state-load-migration` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed delisted-state-load-migration
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize delisted-state-load-migration
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Decky-Metadata/delisted-state-load-migration_finalized
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
scripts/orchestration/finalize delisted-state-load-migration
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Decky-Metadata/delisted-state-load-migration_finished
/tmp/Decky-Metadata/delisted-state-load-migration_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
