# Plan: Steam-first matching with IGN fallback in scan (scan-steam-first)

## Context

Today the metadata scan is **IGN-first**: `_scan_missing` (main.py:1328-1367) fetches IGN
(`_auto_fetch_metadata_sync`) as the base and only then runs `_metadata_with_steam_news_sync`
to resolve the Steam appid and **override** IGN fields — and it does that Steam step **only when
IGN matched**. So a title IGN can't match but Steam can (e.g. *Assassin's Creed: Director's
Cut* → Steam `15100`, verified: `_resolve_steam_appid_for_title(...) -> 15100`) gets no record
at all, and Steam data (already the intended source of truth) is gated behind IGN.

The user wants **Steam-first with IGN fallback**: resolve the Steam match first; when Steam
matches, Steam is the sole/primary source (do not pull IGN for that game); only fall back to
IGN when Steam finds no match (Nintendo/non-Steam titles like Mario). This makes Steam
authoritative, avoids injecting IGN data into games Steam already covers, and fixes AC.

The building blocks already exist and need no change:
- `_metadata_with_steam_news_sync(metadata, title, limit)` (main.py:1662) resolves the Steam
  appid from the title via `_resolve_steam_appid_for_title`, and when it matches sets
  `source="Steam"` and merges Steam appdetails / deck compat / community over the base. Run on a
  minimal `{"title": title}` shell it yields a **pure Steam** record when the title matches, or
  a bare sanitized shell (no `steam_appid`) when it doesn't.
- `_auto_fetch_metadata_sync(title)` (main.py:1456) is the IGN fetch, used only as the fallback.
- `_sanitize_metadata` persists `steam_appid`/`steam_store_url`; `_safe_int` for the match check.

**Intended outcome:** during a scan (or Clear cache → rescan), each unmatched shortcut first
attempts a Steam match on its title; matched titles (incl. AC → 15100) get a Steam-sourced
record (`source="Steam"`, info/deck/community/news) **without** an IGN fetch; unmatched-on-Steam
titles fall back to IGN and are saved when IGN matches; titles neither can match stay
unsaved/retryable. Delisted titles Steam storesearch can't return still use the manual Steam
App ID override.

Relevant code: `_scan_missing` (main.py:1328-1367), `_metadata_with_steam_news_sync` (1662),
`_auto_fetch_metadata_sync` (1456), `_resolve_steam_appid_for_title` (2162), `_safe_int`.
Backend-only.

**Out of scope:** the app-links hider (done); the manual Steam App ID override (done); the IGN
matcher scoring and the Steam resolver scoring (unchanged); any frontend change; scraping
steam-tracker.com for delisted appids (a possible later fallback). No API-surface change beyond
`_scan_missing`'s internals.

**Slug used throughout this plan:** `scan-steam-first`

---

## Orchestration Contract

**Slug:** `scan-steam-first`

**Plan file:**

```text
docs/plans/2026-06-30_scan-steam-first.md
```

**Implementation branch:**

```text
feat/scan-steam-first
```

**Round-complete marker:**

```text
/tmp/Playhub-Metadata-local/scan-steam-first_finished
```

**Finalized marker:**

```text
/tmp/Playhub-Metadata-local/scan-steam-first_finalized
```

**Review notes:**

```text
docs/review/scan-steam-first-review-*.md
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
git checkout -b feat/scan-steam-first
```

Commit this plan first:

```bash
git add docs/plans/2026-06-30_scan-steam-first.md
git commit -m "docs(plan): add scan-steam-first implementation plan"
```

---

## Implementation Tasks

Backend-only, `main.py`, the per-game `try` block inside `_scan_missing` (main.py:1342-1362).
TDD (stub `_auto_fetch_metadata_sync` and `_metadata_with_steam_news_sync` — no network).
Preserve the `missing` selection, progress counters/messages structure, the `except Exception`
handler, and the `finally: completed += 1`.

1. **Reorder to Steam-first.** Replace the current
   `metadata = _auto_fetch...; if metadata: enrich+save else: failed` body with:
   ```python
   self._scan_progress["message"] = f"Matching Steam for {title}"
   steam_shell = {"title": title, "source": "Manual", "id": title}
   steam_record = await asyncio.to_thread(
       self._metadata_with_steam_news_sync, steam_shell, title, 10
   )
   matched_steam = bool(self._safe_int(steam_record.get("steam_appid")))
   if matched_steam:
       await self.save_metadata(app_id, steam_record)
       self._scan_progress["assigned"] += 1
       self._scan_progress["message"] = f"Matched Steam for {title}"
   else:
       # IGN fallback only when Steam finds no match.
       self._scan_progress["message"] = f"Fetching metadata for {title}"
       ign_metadata = await asyncio.to_thread(self._auto_fetch_metadata_sync, title)
       if ign_metadata:
           enriched = await asyncio.to_thread(
               self._metadata_with_steam_news_sync, ign_metadata, title, 10
           )
           await self.save_metadata(app_id, enriched)
           self._scan_progress["assigned"] += 1
           self._scan_progress["message"] = f"Saved metadata for {title}"
       else:
           self._scan_progress["failed"] += 1
           self._scan_progress["message"] = f"No metadata match for {title}"
   ```
   - When Steam matches, **IGN must not be fetched** for that game (the `_auto_fetch_metadata_sync`
     call lives only in the `else`).
   - When Steam does not match but IGN does, run `_metadata_with_steam_news_sync` over the IGN
     result (unchanged from today, so IGN-matched records keep any Steam enrichment they'd get)
     and save.
   - When neither matches, save nothing (stays retryable) and count `failed`.
   - Keep the `self._scan_progress["current"] = ...` line above the try unchanged.

2. **Do not change** `_metadata_with_steam_news_sync`, `_auto_fetch_metadata_sync`,
   `_resolve_steam_appid_for_title`, `_metadata_needs_scan`, or the `missing` list construction.

3. **Tests** `tests/test_scan_steam_first.py` (async; harness `tests/_plugin.py`/conftest
   `FakeDecky`; stub, no network). Build a plugin with `self._data = {"metadata": {}}`,
   `self._scan_progress = self._new_scan_progress("running")` (or an equivalent dict with
   `total/completed/assigned/failed/current/message`), and `_load_data`/`_save_data` as no-ops.
   Cover:
   - **Steam matches → IGN skipped:** stub `_metadata_with_steam_news_sync` to return
     `{"title": t, "steam_appid": 15100, "source": "Steam", "description": "d"}`; stub
     `_auto_fetch_metadata_sync` to raise `AssertionError` (must not be called). Run
     `await plugin._scan_missing([{ "appid": 1, "name": "Assassin's Creed: Director's Cut" }])`.
     Assert `self._data["metadata"]["1"]["steam_appid"] == 15100`, `assigned == 1`,
     `failed == 0`, and `_auto_fetch_metadata_sync` was never called.
   - **Steam misses → IGN matches:** stub `_metadata_with_steam_news_sync` to return its input
     unchanged (a `lambda base, title, limit=...: dict(base)` — never adds a `steam_appid`); stub
     `_auto_fetch_metadata_sync` to return `{"title": t, "source": "IGN", "description": "d"}`.
     Assert the saved record is the IGN one (has description / `source` reflects the IGN path),
     `assigned == 1`, and `_auto_fetch_metadata_sync` was called once.
   - **Both miss:** `_metadata_with_steam_news_sync` returns input unchanged (no appid);
     `_auto_fetch_metadata_sync` returns `None`. Assert `"1" not in self._data["metadata"]`,
     `failed == 1`, `assigned == 0`.
   (If asserting via the real `save_metadata` is awkward, stub `save_metadata` to record into
   `self._data["metadata"][str(app_id)]` and assert on that.)

4. **Scope discipline:** only the `_scan_missing` per-game reorder + the new test. No other files.
   No npm deps.

5. Record a session log under `docs/agent_conversations/` per `AGENTS.md` §9, noting the scan is
   now Steam-first (Steam match → pure Steam record, IGN skipped) with IGN as the fallback only
   when Steam finds no match.

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
uv run --with pytest -- pytest -q tests/test_scan_steam_first.py
scripts/orchestration/run-quality-gates    # tsc --noEmit + rollup build + py_compile + full pytest
git status --short                          # clean
```

Expected: new test passes (Steam-match skips IGN and saves appid; Steam-miss falls back to IGN;
both-miss saves nothing/failed); full gate green; tree clean.

Deferred verification (requires hardware — performed by the human/orchestrator):

1. Rebuild from `dev`, sideload, tap **Clear cache** (rescan).
2. *Assassin's Creed: Director's Cut* matches Steam **15100** (`source="Steam"`, info/deck/
   community, working native buttons) — and IGN is not consulted for it.
3. Non-Steam titles (e.g. Mario) still resolve via IGN as before.
4. Delisted titles Steam can't return still work via the manual Steam App ID override.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished scan-steam-first
```

This writes:

```text
/tmp/Playhub-Metadata-local/scan-steam-first_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer scan-steam-first`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/scan-steam-first-review-*.md
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
   scripts/orchestration/clear-finished scan-steam-first
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
   git add docs/review/scan-steam-first-review-*.md
   git commit -m "docs(review): record scan-steam-first review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished scan-steam-first
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer scan-steam-first` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed scan-steam-first
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize scan-steam-first
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Playhub-Metadata-local/scan-steam-first_finalized
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
scripts/orchestration/finalize scan-steam-first
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Playhub-Metadata-local/scan-steam-first_finished
/tmp/Playhub-Metadata-local/scan-steam-first_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
