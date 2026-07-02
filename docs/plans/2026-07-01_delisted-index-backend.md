# Plan: Delisted appid index from steam-tracker with fuzzy fallback matching (delisted-index-backend)

## Context

Delisted Steam games (e.g. *Transformers: Devastation* 338930) are **not** returned by Steam
storesearch, so the Steam-first scan can't auto-match them — today they only match via the
manual Steam App ID override. steam-tracker.com publishes a full delisted list we can use as an
automatic fallback.

Research (already done):
- `https://steam-tracker.com/apps/delisted` returns a **~12 MB HTML** table of **~10,913**
  delisted apps. It is behind Cloudflare but **returns HTTP 200** for us (unlike SteamDB, which
  403s). There is **no** name-search API (`/api` only does user-stats by SteamID), so the whole
  page is the data source.
- Each row is `<tr id='app-<ID>' data-appid='<ID>' data-itemtype='..'>` and the game **name** is
  the text of the anchor whose href is `https://steam-tracker.com/app/<ID>/`, e.g.
  `<a class='text-grey' href='https://steam-tracker.com/app/338930/'> TRANSFORMERS: Devastation</a>`.
  (The other per-row anchors point to `steamdb.info/app/<ID>` (text = the numeric id) and
  `store.steampowered.com/app/<ID>` (icon only) — only the `steam-tracker.com/app/<ID>/` anchor
  carries the name. A sibling `ranking/<n>` anchor holds the category, e.g. "Purchase disabled".)

This plan adds a **cached delisted index** and wires it as a **third matching tier** in the
Steam-first scan: Steam storesearch → **delisted index** → IGN. When the index resolves an
appid, we pin it and reuse `_metadata_with_steam_news_sync` (which respects a pinned
`steam_appid`) to pull Steam appdetails/deck/community/news — the same path the manual override
uses (verified working for 338930).

Reusable building blocks already in `main.py`:
- TLS-verified HTML fetch: `_http_text` (defined at main.py:3632; `_build_https_context` at 144)
  — use it (do **not** disable TLS verification).
- Match scoring used by `_resolve_steam_appid_for_title` (main.py:2188-2245):
  `_normalise_match_title`, `_distinctive_tokens_present`, `_is_non_primary_steam_title`,
  `_clean_game_title`, `_safe_int`, plus difflib ratio ≥ 0.72 and a < 300 reject threshold —
  mirror this for the delisted matcher to avoid false positives across ~10.9k names.
- `_scan_missing` (main.py:1328-1367) is now Steam-first (shell → `_metadata_with_steam_news_sync`
  → else IGN); the delisted tier slots into the `else` before IGN.
- The settings/data file lives in the plugin settings dir (same dir as `playhub_metadata.json`);
  the index cache is a separate sibling file.

**Intended outcome:** after a scan (or Clear cache → rescan), delisted titles steam-tracker
knows about (Transformers: Devastation, Deadpool, etc.) auto-resolve their Steam appid and pull
Steam info/deck/community/news (`source="Steam"`), without the user needing the manual override.
Titles not in storesearch nor the delisted index fall back to IGN, then stay retryable. The
index is downloaded at most weekly (cached), fetched respectfully (single GET, size-capped, TLS
verified), and a failed/again-changed steam-tracker never crashes the scan — it degrades to "no
delisted match".

**Relevant files:** `main.py` only (constants; `_parse_delisted_html`; download/cache/load;
`_resolve_delisted_appid_for_title`; `_scan_missing` wiring; `refresh_delisted_index` /
`get_delisted_index_status` callables) and `tests/` (new tests). The frontend refresh button is
a **separate** plan (`delisted-index-ui`); this plan's callables make it possible but it is
functional without UI via lazy auto-download.

**Out of scope:** the refresh UI (separate plan); removing diagnostics; any change to the
existing storesearch resolver or IGN path beyond adding the new tier. No frontend change.

**Slug used throughout this plan:** `delisted-index-backend`

---

## Orchestration Contract

**Slug:** `delisted-index-backend`

**Plan file:**

```text
docs/plans/2026-07-01_delisted-index-backend.md
```

**Implementation branch:**

```text
feat/delisted-index-backend
```

**Round-complete marker:**

```text
/tmp/Playhub-Metadata-local/delisted-index-backend_finished
```

**Finalized marker:**

```text
/tmp/Playhub-Metadata-local/delisted-index-backend_finalized
```

**Review notes:**

```text
docs/review/delisted-index-backend-review-*.md
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
git checkout -b feat/delisted-index-backend
```

Commit this plan first:

```bash
git add docs/plans/2026-07-01_delisted-index-backend.md
git commit -m "docs(plan): add delisted-index-backend implementation plan"
```

---

## Implementation Tasks

Backend-only, `main.py`. TDD — the parser and matcher are **pure** and must be unit-tested
without network. Never crash the scan; all network/parse failures degrade to "no delisted
match" and preserve any existing cache.

### A. Constants (module scope, near other URL/TTL constants)
```python
STEAM_TRACKER_DELISTED_URL = "https://steam-tracker.com/apps/delisted"
DELISTED_INDEX_TTL_SECONDS = 7 * 24 * 3600          # refresh at most weekly
DELISTED_INDEX_MAX_BYTES = 30 * 1024 * 1024         # size cap for the download
DELISTED_INDEX_FILENAME = "delisted_index.json"
```

### B. Pure parser (TDD this first)
`_parse_delisted_html(self, html_text: str) -> list[list]` (or a `@staticmethod`):
- Use a single regex over the **name anchors** (robust, avoids row-splitting/backtracking):
  ```python
  pattern = re.compile(
      r"href='https://steam-tracker\.com/app/(\d+)/'[^>]*>\s*([^<]+?)\s*</a>", re.I
  )
  ```
- For each match: `appid = self._safe_int(m.group(1))`; `name = html.unescape(m.group(2)).strip()`.
  Skip if no appid or empty name. De-dupe by appid (keep first). Return a list of `[appid, name]`
  pairs (JSON-friendly). Do not fetch anything here.

### C. Download + cache
- `_delisted_index_path(self) -> str`: the settings dir (same dir as the main data file) +
  `DELISTED_INDEX_FILENAME`.
- `_download_delisted_index_sync(self) -> dict | None`:
  `text = self._http_text(STEAM_TRACKER_DELISTED_URL, timeout=30)`; if `len(text.encode())` (or
  `len(text)`) exceeds `DELISTED_INDEX_MAX_BYTES`, treat as failure (log, return `None`); parse
  via `_parse_delisted_html`; if it yields a plausible count (e.g. `>= 100`), return
  `{"fetched_at": now(), "source": STEAM_TRACKER_DELISTED_URL, "apps": pairs}`; else log and
  return `None` (never raise out).
- `_save_delisted_index_sync(self, index)`: write JSON to `_delisted_index_path()` (atomic-ish:
  write then replace is nice-to-have, not required). `_load_delisted_index_sync(self) -> dict |
  None`: read+parse the file; on any error return `None`.
- Keep an in-memory cache attribute (e.g. `self._delisted_index` initialized to `None`) plus a
  normalized name→appid lookup built lazily from it (see E). Initialize the attribute wherever
  the plugin initializes its other in-memory state (guard for `__new__`-based test construction
  by using `getattr(self, "_delisted_index", None)`).
- `_ensure_delisted_index_sync(self, force: bool = False) -> dict | None`:
  1. if in-memory present and not `force` and not stale → return it;
  2. else load from disk; if disk present and not `force` and `now() - fetched_at <
     DELISTED_INDEX_TTL_SECONDS` → cache in memory and return;
  3. else download (`_download_delisted_index_sync`); if it succeeds, save + cache + return it;
  4. if download fails, fall back to whatever disk/in-memory copy exists (stale is better than
     nothing); may return `None` if there is none. Never raise.

### D. Async callables (place near `auto_fetch_metadata` / `enrich_steam_app`)
- `async def refresh_delisted_index(self) -> dict`: `idx = await asyncio.to_thread(
  self._ensure_delisted_index_sync, True)`; return `{"ok": idx is not None,
  "count": len(idx.get("apps", [])) if idx else 0, "fetched_at": idx.get("fetched_at") if idx else 0}`.
- `async def get_delisted_index_status(self) -> dict`: load (without forcing a download) via
  `await asyncio.to_thread(self._ensure_delisted_index_sync, False)` **only if you want lazy
  populate**, OR just read the existing cache/disk without downloading — prefer **no download**
  here: return `{"count": ..., "fetched_at": ...}` from the in-memory/disk copy, `0`/`0` if none.

### E. Matcher (TDD — inject the index, no network)
`_resolve_delisted_appid_for_title(self, title: str) -> int`:
- `idx = self._ensure_delisted_index_sync(False)`; if not `idx` or no `apps`, return `0`.
- `clean = self._clean_game_title(title)`; if empty return `0`;
  `q = self._normalise_match_title(clean)`.
- Iterate `apps`; mirror `_resolve_steam_appid_for_title` scoring per candidate name:
  - `name = self._clean_game_title(raw_name)`; `cand = self._normalise_match_title(name)`;
  - require `self._distinctive_tokens_present(q, cand)` else skip;
  - exact `cand == q` → `score = 1000`; else `ratio = difflib.SequenceMatcher(None, q, cand).ratio()`;
    `if ratio < 0.72: continue`; `score = int(ratio * 500)`;
  - `if self._is_non_primary_steam_title(name): score -= 800`;
  - extra numeric tokens in candidate not in query → `score -= 120`;
  - track best. Reject if best `< 300`. Return best appid or `0`.
- (Performance: ~10.9k candidates scored once per unmatched game is fine.)

### F. Wire the delisted tier into `_scan_missing`
In the Steam-first `else` branch (after storesearch shell miss, **before** the IGN fetch):
```python
delisted_appid = await asyncio.to_thread(self._resolve_delisted_appid_for_title, title)
if delisted_appid:
    pinned = {"title": title, "source": "Manual", "id": title, "steam_appid": delisted_appid}
    steam_record = await asyncio.to_thread(self._metadata_with_steam_news_sync, pinned, title, 10)
    if self._safe_int(steam_record.get("steam_appid")):
        await self.save_metadata(app_id, steam_record)
        self._scan_progress["assigned"] += 1
        self._scan_progress["message"] = f"Matched delisted Steam app for {title}"
        # continue to next game (skip IGN)
        <fall through so IGN is not run>
```
Structure it so: if `delisted_appid` resolves and pins a `steam_appid`, save and skip IGN; only
if the delisted tier yields nothing do we run the existing IGN fallback. Preserve the
`assigned`/`failed`/`current`/`message` bookkeeping, the `except Exception` handler, and
`finally: completed += 1`. Do not change the storesearch tier or the IGN tier logic.

### G. Tests `tests/test_delisted_index.py` (harness; no network)
- **parser:** feed a small fixture string containing two real-shaped rows (incl. the 338930 name
  anchor and one other) → assert `_parse_delisted_html` returns
  `[[338930, "TRANSFORMERS: Devastation"], [<id2>, "<name2>"]]` (order preserved, de-duped).
- **matcher:** monkeypatch `_ensure_delisted_index_sync` to return
  `{"apps": [[338930, "TRANSFORMERS: Devastation"], [111, "Some Other Game"]]}`; assert
  `_resolve_delisted_appid_for_title("Transformers Devastation") == 338930` and an unrelated
  title (e.g. "Halo Infinite") returns `0`.
- **scan tier:** `_scan_missing` with `_metadata_with_steam_news_sync` stubbed to return the
  input unchanged (no appid) for the shell, `_resolve_delisted_appid_for_title` stubbed → 338930,
  and a second stub behavior so the **pinned** call returns `{"title": t, "steam_appid": 338930,
  "source": "Steam"}`; `_auto_fetch_metadata_sync` stubbed to raise if called. Assert the saved
  record has `steam_appid == 338930`, `assigned == 1`, and IGN was not called. Add a case where
  `_resolve_delisted_appid_for_title` returns 0 → IGN fallback path still runs.

### H. Scope discipline & safety
- Only `main.py` (+ tests). No frontend. No npm deps.
- **TLS verification stays on** (use `_http_text`; never pass an unverified context).
- Respect the size cap; single GET per refresh; weekly TTL; never raise out of the scan.
- Record a session log under `docs/agent_conversations/` per `AGENTS.md` §9.

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
uv run --with pytest -- pytest -q tests/test_delisted_index.py
scripts/orchestration/run-quality-gates    # tsc --noEmit + rollup build + py_compile + full pytest
git status --short                          # clean
```

Expected: parser/matcher/scan-tier tests pass; full gate green; tree clean. (No network in
tests — the download path is exercised only on-device.)

Deferred verification (requires hardware — performed by the human/orchestrator):

1. Rebuild from `dev`, sideload, **Clear cache** (rescan). On the first delisted lookup the
   index downloads once (~12 MB) and caches to `delisted_index.json` in the plugin settings dir.
2. A delisted title steam-tracker knows (e.g. *Deadpool*, currently `steam=None`) now matches
   its Steam appid with `source="Steam"` and working native buttons.
3. Confirm normal (storesearch-matchable) and IGN-only (Nintendo) titles are unchanged, and a
   second scan does **not** re-download the index (within the weekly TTL).

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished delisted-index-backend
```

This writes:

```text
/tmp/Playhub-Metadata-local/delisted-index-backend_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer delisted-index-backend`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/delisted-index-backend-review-*.md
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
   scripts/orchestration/clear-finished delisted-index-backend
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
   git add docs/review/delisted-index-backend-review-*.md
   git commit -m "docs(review): record delisted-index-backend review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished delisted-index-backend
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer delisted-index-backend` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed delisted-index-backend
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize delisted-index-backend
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Playhub-Metadata-local/delisted-index-backend_finalized
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
scripts/orchestration/finalize delisted-index-backend
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Playhub-Metadata-local/delisted-index-backend_finished
/tmp/Playhub-Metadata-local/delisted-index-backend_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
