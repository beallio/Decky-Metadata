# Plan: Clear cache button in QAM (clear-metadata-cache-button)

## Context

Matched metadata (including `steam_appid`) is cached/persisted in `playhub_metadata.json`
(`self._data["metadata"]`, keyed by shortcut appid). The frontend only re-enriches games that
are **not** already enriched (steam.ts:3163), so after a matcher fix, **already-matched games
never re-resolve** — wrong matches (e.g. Space Marine → Demo, Valhalla → Director's Cut) stick
indefinitely. The user wants a **"Clear cache" button in the QAM plugin panel** so they can
force every game to re-fetch and re-match with the current logic.

What exists (reuse it):

- Backend `main.py`: `self._data["metadata"]` holds the cache; `get_metadata` (main.py:866),
  `remove_metadata` (main.py:902), `clear_xbox_associations` (main.py:1072), `_load_data` /
  `_save_data` show the persisted-store pattern. Public async `Plugin` methods are
  auto-registered as Decky callables (matched by method name).
- `src/backend.ts`: `callable<...>("...")` declarations, e.g. `clearXboxAssociations`
  (backend.ts:88) and `getAllMetadata` (backend.ts:19).
- `src/steam.ts`: `refreshMetadataCache` (steam.ts:233) reloads `metadataCache` from
  `get_all_metadata`.
- `src/components.tsx`: the QAM panel is `Content` (components.tsx:330). It renders
  `PanelSectionRow`s with `sectionHeadingStyle` headers and `FocusableButton`s (e.g. the
  achievement-cache and diagnostics sections, ~components.tsx:810-840), and uses
  `toaster.toast({ title: t("pluginName"), body: ... })` for feedback.
- `src/i18n.ts`: localized strings via `t(...)`, parallel locale blocks.

**Intended outcome:** a "Clear cache" control in the QAM panel that clears the persisted
metadata cache, reloads the (now-empty) in-memory cache, and toasts confirmation. After
clearing, games re-fetch/re-match on next view (with the corrected matcher), so wrong matches
self-correct. No change to matching logic itself (separate, already done).

**Slug used throughout this plan:** `clear-metadata-cache-button`

---

## Orchestration Contract

**Slug:** `clear-metadata-cache-button`

**Plan file:**

```text
docs/plans/2026-06-29_clear-metadata-cache-button.md
```

**Implementation branch:**

```text
feat/clear-metadata-cache-button
```

**Round-complete marker:**

```text
/tmp/Playhub-Metadata-local/clear-metadata-cache-button_finished
```

**Finalized marker:**

```text
/tmp/Playhub-Metadata-local/clear-metadata-cache-button_finalized
```

**Review notes:**

```text
docs/review/clear-metadata-cache-button-review-*.md
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
git checkout -b feat/clear-metadata-cache-button
```

Commit this plan first:

```bash
git add docs/plans/2026-06-29_clear-metadata-cache-button.md
git commit -m "docs(plan): add clear-metadata-cache-button implementation plan"
```

---

## Implementation Tasks

1. **Backend method** in `main.py` (near `remove_metadata`, main.py:902):
   ```python
   async def clear_metadata_cache(self) -> dict[str, Any]:
       self._load_data()
       cleared = len(self._data.get("metadata") or {})
       self._data["metadata"] = {}
       self._save_data()
       _plog("cache", "metadata cache cleared", count=cleared)
       return {"ok": True, "cleared": cleared}
   ```
   It must clear the whole metadata map and persist. Do not touch other settings
   (achievement cache, xbox, retroachievements). Never raise on an empty cache.

2. **Frontend callable** in `src/backend.ts`:
   ```ts
   export const clearMetadataCache = callable<[], { ok: boolean; cleared?: number }>(
     "clear_metadata_cache"
   );
   ```

3. **QAM button** in `src/components.tsx` `Content`: add a small maintenance section (a
   `PanelSectionRow` with a `sectionHeadingStyle` heading `t("cacheTitle")` plus a short
   `t("cacheHint")`) containing a `FocusableButton` (`className="DialogButton"`,
   label `t("clearCache")`) wired to an async handler that:
   - calls `clearMetadataCache()`;
   - then calls `refreshMetadataCache()` (import from `./steam`) so the in-memory
     `metadataCache` reflects the cleared state;
   - toasts the result via the existing `toaster.toast({ title: t("pluginName"), body: ... })`
     pattern (e.g. `t("clearCacheDone")`), and on failure toasts a failure message;
   - guards with a `busy` flag if convenient (mirror existing button handlers) so it can't be
     double-fired. Place the section near the other maintenance controls (achievement cache /
     diagnostics), not inside the per-game form.

4. **i18n** in `src/i18n.ts`: add `cacheTitle` ("Metadata cache"), `cacheHint` ("Clear cached
   Steam matches and metadata so games re-fetch and re-match."), `clearCache` ("Clear cache"),
   `clearCacheDone` ("Metadata cache cleared") to **every** locale block (fall back to English
   text where no translation exists; do not leave any locale missing a key).

5. **Tests** `tests/test_clear_cache.py` (harness): construct a `Plugin`, populate
   `self._data["metadata"]` with a couple of entries (and a non-metadata settings key),
   `await clear_metadata_cache()`, and assert: returns `{"ok": True, "cleared": N}`,
   `self._data["metadata"] == {}`, the unrelated settings key is untouched, and a re-load
   (`_load_data`) still shows it empty (persisted). Also assert clearing an already-empty
   cache returns `cleared: 0` and does not raise.

6. **Scope discipline:** only the clear-cache path. Do not change matching, enrichment
   gating, the app page, or the context menu. No npm deps. No `from __future__ import
   annotations` changes.

7. Record a session log under `docs/agent_conversations/` per `AGENTS.md` §9.

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
export UV_CACHE_DIR=/tmp/Playhub-Metadata-local/.uv
uv run --with pytest -- pytest -q tests/test_clear_cache.py
scripts/orchestration/run-quality-gates    # tsc + build + py_compile + full pytest
git status --short                          # clean
```

Expected:

- `tests/test_clear_cache.py` passes (cache emptied + persisted, count returned, unrelated
  settings untouched, empty-cache safe). Full gate green (tsc/build/py_compile + pytest).
  Tree clean.

Deferred verification (record in the session log; requires hardware — performed by the
human/orchestrator, not the implementer):

1. Rebuild the installer from `dev` and sideload on a real Steam Deck.
2. In the QAM plugin panel, confirm a "Clear cache" button appears and tapping it toasts
   confirmation.
3. Confirm it actually forces re-resolution: after clearing, open a previously mis-matched
   game (e.g. Space Marine) and confirm `playhub-metadata.log` shows fresh `storesearch` for
   it and the persisted `steam_appid` updates to the correct app (55150/2183900), with the
   info box / Deck badge / links following.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished clear-metadata-cache-button
```

This writes:

```text
/tmp/Playhub-Metadata-local/clear-metadata-cache-button_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer clear-metadata-cache-button`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/clear-metadata-cache-button-review-*.md
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
   scripts/orchestration/clear-finished clear-metadata-cache-button
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
   git add docs/review/clear-metadata-cache-button-review-*.md
   git commit -m "docs(review): record clear-metadata-cache-button review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished clear-metadata-cache-button
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer clear-metadata-cache-button` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed clear-metadata-cache-button
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize clear-metadata-cache-button
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Playhub-Metadata-local/clear-metadata-cache-button_finalized
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
scripts/orchestration/finalize clear-metadata-cache-button
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Playhub-Metadata-local/clear-metadata-cache-button_finished
/tmp/Playhub-Metadata-local/clear-metadata-cache-button_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
