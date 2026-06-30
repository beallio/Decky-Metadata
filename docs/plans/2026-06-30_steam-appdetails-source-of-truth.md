# Plan: Steam appdetails as metadata source of truth (steam-appdetails-source-of-truth)

## Context

Today the plugin sources **all** displayed metadata (title, description, developers,
publishers, genres, release date, screenshots, rating) from IGN/RAWG — even for games that
resolve to a real Steam app. IGN is matched by fuzzy title, which mismatches (e.g. an
"Assassin's Creed: Director's Cut" shortcut pulled IGN's *Valhalla* page). The plugin makes
**zero** calls to Steam's own store API; `storesearch` is used only to resolve the appid,
deck-compat, and news.

Fix: when a shortcut resolves to a `steam_appid`, pull the metadata **directly from Steam's
appdetails API** and use it as the source of truth, with IGN/RAWG only as a fallback (and
still the sole source for games not on Steam). This eliminates the fuzzy-IGN mismatch class:
the matched app's own data is authoritative.

Steam endpoint (returns the matched app's real data):
```
https://store.steampowered.com/api/appdetails?appids=<steam_appid>&l=english
```
Response shape: `{"<appid>": {"success": true, "data": { name, short_description,
detailed_description, about_the_game, developers[], publishers[], genres[{id, description}],
release_date{date}, screenshots[{path_thumbnail, path_full}], metacritic{score},
categories[{id, description}], header_image, ... }}}`.

Seam: `_metadata_with_steam_news_sync` (main.py:1661) already resolves `steam_appid` and, in
the `if steam_appid:` block (main.py:1675-1679), fetches deck-compat. Add the appdetails
fetch+merge here. Reuse existing helpers: `_http_json` (5122), `_clean_html_text` (7759),
`_date_to_epoch` (7786), `_rating_to_percent` (7774), `_sanitize_screenshots` (2253),
`_safe_int`/`_as_number`. `_sanitize_metadata` (main.py:~1561) already normalises the target
fields (developers/publishers/genres/release_date/rating/store_categories/screenshots/title/
description), so the merged dict flows through unchanged.

**Intended outcome:** for a Steam-matched game, the title / description / developers /
publishers / genres / release date / screenshots / rating shown come from that exact Steam
app (so "Director's Cut" shows Director's Cut, not Valhalla). Non-matched games are unchanged
(IGN/RAWG). This is the root fix that supersedes relying on fuzzy IGN matching for matched
games.

**Out of scope:** the Community-tab tile content (`community_images`/`community_videos`,
separate follow-up — though Steam `movies`/`screenshots` could feed it later); the native
button redirect (separate, awaiting the nav trace).

**Slug used throughout this plan:** `steam-appdetails-source-of-truth`

---

## Orchestration Contract

**Slug:** `steam-appdetails-source-of-truth`

**Plan file:**

```text
docs/plans/2026-06-30_steam-appdetails-source-of-truth.md
```

**Implementation branch:**

```text
feat/steam-appdetails-source-of-truth
```

**Round-complete marker:**

```text
/tmp/Playhub-Metadata-local/steam-appdetails-source-of-truth_finished
```

**Finalized marker:**

```text
/tmp/Playhub-Metadata-local/steam-appdetails-source-of-truth_finalized
```

**Review notes:**

```text
docs/review/steam-appdetails-source-of-truth-review-*.md
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
git checkout -b feat/steam-appdetails-source-of-truth
```

Commit this plan first:

```bash
git add docs/plans/2026-06-30_steam-appdetails-source-of-truth.md
git commit -m "docs(plan): add steam-appdetails-source-of-truth implementation plan"
```

---

## Implementation Tasks

Backend-only, `main.py`. TDD: the fetch/parse/merge is unit-testable by stubbing `_http_json`.

1. **Add the endpoint constant** near the other Steam URLs (main.py:206-ish):
   `STEAM_APP_DETAILS_URL = "https://store.steampowered.com/api/appdetails"`.

2. **Add `_steam_appdetails_for_appid(self, steam_appid: int) -> dict[str, Any] | None`** that
   fetches and maps Steam appdetails into the plugin's metadata shape. It must:
   - return `None` for a non-positive appid;
   - GET `f"{STEAM_APP_DETAILS_URL}?{urlencode({'appids': appid, 'l': 'english'})}"` via
     `_http_json` (same TLS/redaction path as the other Steam fetchers);
   - read `payload[str(appid)]`; if not a dict or `success` is falsy or `data` missing →
     return `None`;
   - from `data`, build a partial-metadata dict containing **only the keys it can populate**
     (omit empty ones so they don't clobber IGN fallback):
     - `title` ← `data["name"]` (stripped) ;
     - `description` ← `_clean_html_text(data.get("detailed_description") or
       data.get("about_the_game") or data.get("short_description") or "")`;
     - `short_description` ← `_clean_html_text(data.get("short_description") or "")`;
     - `developers` ← `[{"name": n, "url": ""} for n in data.get("developers") or [] if n]`;
     - `publishers` ← same shape from `data.get("publishers")`;
     - `genres` ← `[g.get("description") for g in data.get("genres") or [] if g.get("description")]`;
     - `release_date` ← `_date_to_epoch((data.get("release_date") or {}).get("date"))` when > 0;
     - `rating` ← `_rating_to_percent((data.get("metacritic") or {}).get("score"))` when not None;
     - `store_categories` ← `[self._safe_int(c.get("id")) for c in data.get("categories") or []]`
       filtered to truthy ints;
     - `screenshots` ← `_sanitize_screenshots([{ "id": s.get("id"), "url": s.get("path_full"),
       "thumbnail": s.get("path_thumbnail") } for s in data.get("screenshots") or [] if s.get("path_full")])`;
     - `header_image` is optional — skip unless a field already exists for it.
   - **never raise** — wrap network/parse in try/except, log via
     `_plog("steam", "appdetails fetch failed", level=logging.WARNING, exc=True,
     steam_appid=appid)` and return `None`; on success log a DEBUG line with the resolved
     name.

3. **Merge Steam data over IGN in `_metadata_with_steam_news_sync`** (inside `if steam_appid:`,
   after the deck-compat fetch, main.py:1679):
   ```python
   steam_details = self._steam_appdetails_for_appid(steam_appid)
   if steam_details:
       for key, value in steam_details.items():
           if value:                      # Steam wins, but never blank out a field
               next_metadata[key] = value
       next_metadata["source"] = "Steam"
   ```
   Do this only when `steam_appid` is truthy. Leave `community_images`/`community_videos`/
   `steam_news` untouched. Keep IGN values for any field Steam did not provide.

4. **Tests** `tests/test_steam_appdetails.py` (harness; stub `_http_json` — no network):
   - a stubbed appdetails payload (`{"<id>": {"success": True, "data": {name, short_description,
     detailed_description, developers, publishers, genres, release_date, screenshots,
     metacritic, categories}}}`) → `_steam_appdetails_for_appid` returns a dict with `title`,
     `description`, `developers` (shaped `{"name","url"}`), `publishers`, `genres` (list of
     strings), `release_date` (int epoch), `rating` (int), `store_categories` (list of ints),
     and `screenshots` (sanitized);
   - `success: False`, a missing `data`, a malformed payload, and an HTTP exception each →
     `None` (no raise); `steam_appid <= 0` → `None` with no HTTP call;
   - **precedence:** drive `_metadata_with_steam_news_sync` with `_steam_news_for_metadata`
     stubbed to return a `steam_appid`, `_steam_deck_compat_for_appid` stubbed, and
     `_steam_appdetails_for_appid` stubbed to return `{"title": "Steam Name", "description":
     "Steam desc"}`; assert the result's `title`/`description` are the Steam values
     (overriding the IGN input) and `source == "Steam"`; and that when
     `_steam_appdetails_for_appid` returns `None`, the IGN `title`/`description` are preserved.

5. **Scope discipline:** only the appdetails fetch + merge + constant + tests. Do not change
   matching scoring, the IGN matcher, deck-compat, news, `_sanitize_metadata`'s field set, or
   any frontend. No npm deps; no `from __future__ import annotations` change.

6. Record a session log under `docs/agent_conversations/` per `AGENTS.md` §9.

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
uv run --with pytest -- pytest -q tests/test_steam_appdetails.py
scripts/orchestration/run-quality-gates    # tsc + build + py_compile + full pytest
git status --short                          # clean
```

Expected:

- `tests/test_steam_appdetails.py` passes (mapping, all failure modes → `None`, and Steam
  data overriding IGN with `source == "Steam"`; IGN preserved when appdetails is `None`).
- Full quality gate passes; tree clean.

Deferred verification (record in the session log; requires hardware — performed by the
human/orchestrator):

1. Rebuild the installer from `dev`, sideload, tap **Clear cache**.
2. Confirm a Steam-matched game now shows the **matched app's** real Steam description/title/
   developer/genres/release date/screenshots (e.g. the "Director's Cut" shortcut shows
   Director's Cut data, not Valhalla; Space Marine shows the 55150 description). Check
   `playhub-metadata.log` for `appdetails` fetch lines and confirm no errors.
3. Confirm non-Steam games (e.g. Mario titles) are unchanged (still IGN/RAWG or none).

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished steam-appdetails-source-of-truth
```

This writes:

```text
/tmp/Playhub-Metadata-local/steam-appdetails-source-of-truth_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer steam-appdetails-source-of-truth`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/steam-appdetails-source-of-truth-review-*.md
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
   scripts/orchestration/clear-finished steam-appdetails-source-of-truth
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
   git add docs/review/steam-appdetails-source-of-truth-review-*.md
   git commit -m "docs(review): record steam-appdetails-source-of-truth review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished steam-appdetails-source-of-truth
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer steam-appdetails-source-of-truth` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed steam-appdetails-source-of-truth
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize steam-appdetails-source-of-truth
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Playhub-Metadata-local/steam-appdetails-source-of-truth_finalized
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
scripts/orchestration/finalize steam-appdetails-source-of-truth
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Playhub-Metadata-local/steam-appdetails-source-of-truth_finished
/tmp/Playhub-Metadata-local/steam-appdetails-source-of-truth_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
