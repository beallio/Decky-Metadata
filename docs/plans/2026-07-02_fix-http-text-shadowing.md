# Plan: Unshadow the generic http_text so delisted and community fetches work (fix-http-text-shadowing)

## Context

**On-device bug: "Refresh delisted index" always fails.** The log shows the download itself
succeeds (11,998,965 bytes = the full steam-tracker page) but is then discarded:

```
[playhub:http] http text strategy returned blocked page strategy='urllib'
    url='https://steam-tracker.com/apps/delisted' bytes='11998965'
[playhub:steam] failed to download delisted index
    error='TrueAchievements fetch failed: urllib: blocked/invalid page (11998965 bytes)'
```

Root cause is a **duplicate method definition**: `main.py` defines `_http_text` **twice** on
`Plugin` —
- line ~2976: a **generic** TLS-verified urllib fetcher (plain headers), and
- line ~4005: a **TrueAchievements-specific** multi-strategy fetcher (TA headers incl.
  `Referer: trueachievements.com`, urllib/reader fallbacks, and a
  `_looks_like_blocked_trueachievements_page` validator).

Python silently lets the **second definition shadow the first** (py_compile/pytest can't catch
it), so *every* `self._http_text` call — including the delisted download and the Steam community
homecontent fetch — goes through the TA fetcher. Its blocked-page heuristic (line ~4120) scans
the first 12,000 chars for tokens like `"cloudflare"`; steam-tracker is **served by Cloudflare**
(cf scripts in the page head), so the valid response is misclassified as a blocked page and
dropped.

Call-site census of `self._http_text(` (12 sites):
- **Generic** (must use the plain fetcher): 2331 `_download_delisted_index_sync`,
  2535 `_steam_announcement_page_image`, 2705 `_steam_community_ugc_for_appid` (homecontent),
  2901 `_youtube_videos_for_title` (unused legacy), 2938 `_rawg_images_for_title` (unused legacy).
- **TrueAchievements** (need the TA fetcher + heuristic): 3974, 4228, 4279, 4389, 4397, 4842,
  4952 (all in TA profile/search/detail code paths).

**Fix:** rename the TA-specific method (line ~4005) to `_trueachievements_http_text` and update
its 7 TA call sites; the generic `_http_text` (2976) then un-shadows and serves the delisted/
community/announcement fetches with a plain TLS-verified GET (no TA heuristic). Add a guard
test that fails when any class in `main.py` defines the same method name twice — this is the
second bug class in a row (after the `html.parser` import) that the local gates are structurally
blind to.

**Intended outcome:** "Refresh delisted index" succeeds on-device (~10.9k apps cached); the
community homecontent fetch no longer risks the TA blocked-page misfire; TA fetching behavior is
unchanged; a duplicate-method guard prevents silent shadowing regressions.

**Relevant files:** `main.py` (rename + 7 call-site updates), `tests/` (new
duplicate-method guard test; existing tests keep passing).

**Out of scope:** any behavior change to the TA fetcher or the blocked heuristic itself; the
frontend; matching. Do not delete the unused YouTube/RAWG helpers here.

**Slug used throughout this plan:** `fix-http-text-shadowing`

---

## Orchestration Contract

**Slug:** `fix-http-text-shadowing`

**Plan file:**

```text
docs/plans/2026-07-02_fix-http-text-shadowing.md
```

**Implementation branch:**

```text
feat/fix-http-text-shadowing
```

**Round-complete marker:**

```text
/tmp/Playhub-Metadata-local/fix-http-text-shadowing_finished
```

**Finalized marker:**

```text
/tmp/Playhub-Metadata-local/fix-http-text-shadowing_finalized
```

**Review notes:**

```text
docs/review/fix-http-text-shadowing-review-*.md
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
git checkout -b feat/fix-http-text-shadowing
```

Commit this plan first:

```bash
git add docs/plans/2026-07-02_fix-http-text-shadowing.md
git commit -m "docs(plan): add fix-http-text-shadowing implementation plan"
```

---

## Implementation Tasks

Backend-only, `main.py` + tests. Mechanical rename + guard test. No behavior change to either
fetcher's internals.

1. **Rename the TA-specific fetcher.** Change `def _http_text(self, url: str, timeout: int = 18)`
   at line ~4005 (the one whose body builds TA headers, tries `_http_text_urllib`/reader
   strategies, and raises `RuntimeError("TrueAchievements fetch failed: ...")`) to
   `def _trueachievements_http_text(self, url: str, timeout: int = 18)`. Do not touch its body,
   nor `_http_text_urllib`/`_http_text_curl`/`_http_text_powershell` (those are its internal
   strategies, differently named — no conflict).

2. **Update the 7 TrueAchievements call sites** (lines ~3974, 4228, 4279, 4389, 4397, 4842,
   4952) from `self._http_text(` to `self._trueachievements_http_text(`. Verify by context that
   each is a TA URL (profile/search/game/achievement-detail pages).

3. **Leave the 5 generic call sites unchanged** (2331 delisted, 2535 announcement image,
   2705 community homecontent, 2901 youtube, 2938 rawg) — they now resolve to the generic
   TLS-verified `_http_text` at line ~2976, which is the intent.

4. **Guard test** `tests/test_no_duplicate_methods.py`: parse `main.py` with `ast`; for every
   `ast.ClassDef`, collect the names of its direct `FunctionDef`/`AsyncFunctionDef` children and
   assert there are **no duplicates** (report the duplicated names in the assertion message).
   This would have caught this bug and prevents future silent shadowing.

5. **Sanity test for the delisted download path** (extend `tests/test_delisted_index.py` or add
   to the new file): monkeypatch the **generic** `_http_text` (e.g.
   `monkeypatch.setattr(plugin, "_http_text", fake)`) and assert
   `_download_delisted_index_sync` consumes it and returns a parsed index for a small fixture
   (two rows) — proving the delisted path uses the generic fetcher, not the TA one. Also assert
   `_trueachievements_http_text` is NOT called (stub it to raise).

6. **Scope discipline:** rename + call-site updates + the two tests only. No fetcher-body,
   heuristic, frontend, or matcher changes. No new imports beyond `ast` in the test.

7. Record a session log under `docs/agent_conversations/` per `AGENTS.md` §9, noting the root
   cause (duplicate `_http_text` definitions; TA blocked-page heuristic misfiring on
   Cloudflare-served steam-tracker HTML).

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
uv run --with pytest -- pytest -q tests/test_no_duplicate_methods.py tests/test_delisted_index.py
python3 - <<'PY'
import ast
tree = ast.parse(open("main.py").read())
for cls in [n for n in ast.walk(tree) if isinstance(n, ast.ClassDef)]:
    names = [f.name for f in cls.body if isinstance(f, (ast.FunctionDef, ast.AsyncFunctionDef))]
    dupes = {n for n in names if names.count(n) > 1}
    assert not dupes, f"{cls.name}: {dupes}"
print("no duplicate methods")
PY
scripts/orchestration/run-quality-gates
git status --short
```

Expected: exactly one `_http_text` on `Plugin`; guard + delisted tests pass; full gate green;
tree clean.

Deferred verification (requires hardware — performed by the human/orchestrator):

1. Rebuild from `dev`, sideload.
2. QAM → **Refresh delisted index** → succeeds; status line shows ~10.9k apps + today's date;
   `playhub-metadata.log` shows no "blocked page"/"TrueAchievements fetch failed" lines for
   steam-tracker.
3. Open a matched game → Community section still loads (homecontent now via the generic fetcher).
4. Xbox/TrueAchievements features still work (TA fetcher renamed, unchanged behavior).

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished fix-http-text-shadowing
```

This writes:

```text
/tmp/Playhub-Metadata-local/fix-http-text-shadowing_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer fix-http-text-shadowing`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/fix-http-text-shadowing-review-*.md
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
   scripts/orchestration/clear-finished fix-http-text-shadowing
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
   git add docs/review/fix-http-text-shadowing-review-*.md
   git commit -m "docs(review): record fix-http-text-shadowing review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished fix-http-text-shadowing
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer fix-http-text-shadowing` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed fix-http-text-shadowing
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize fix-http-text-shadowing
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Playhub-Metadata-local/fix-http-text-shadowing_finalized
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
scripts/orchestration/finalize fix-http-text-shadowing
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Playhub-Metadata-local/fix-http-text-shadowing_finished
/tmp/Playhub-Metadata-local/fix-http-text-shadowing_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
