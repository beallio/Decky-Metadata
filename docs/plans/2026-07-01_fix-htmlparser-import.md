# Plan: Replace html.parser with regex so the backend loads on Decky (fix-htmlparser-import)

## Context

**Critical regression: the plugin backend crashes on load on-device**, so the whole plugin is
non-functional (QAM shows games:0 / metadata:0, the Diagnostics/Debug/version block is gone, and
scan/refresh are disabled — every callable returns nothing). Confirmed via the Decky loader log:

```
File ".../Playhub Metadata/main.py", line 28, in <module>
    from html.parser import HTMLParser
ModuleNotFoundError: No module named 'html.parser'
```

The `community-steam-only` change added `from html.parser import HTMLParser` (main.py:28) and a
`_SteamCommunityCardParser(HTMLParser)` class (main.py:79) to parse the Steam community feed.
**Decky's sandboxed/frozen Python does not bundle the `html.parser` stdlib submodule**, so the
import throws at module load and the backend process dies (observed as a `<defunct>` zombie).
Local `tsc`/pytest/py_compile gates pass because the dev machine's full CPython *has*
`html.parser` — the gate cannot see Decky's stripped runtime. (`import html` at main.py:11 is
fine and stays — only the `html.parser` submodule is unavailable.)

**Fix:** remove the `html.parser` dependency entirely — delete the import and the
`_SteamCommunityCardParser` class, and reimplement `_parse_steam_community_ugc` with **regex**
(no non-stdlib-safe imports), preserving the same output shape and passing the existing
`tests/test_community_steam_only.py`. Add a **regression guard test** asserting `main.py` does
not import `html.parser` (and other known-Decky-unsafe modules), since the normal gates can't
catch this.

**Relevant files:** `main.py` (remove line 28 import + the `_SteamCommunityCardParser` class at
~79; rewrite `_parse_steam_community_ugc` at ~2671 to use regex), `tests/` (existing community
tests must still pass + a new import-guard test).

**Intended outcome:** the backend imports and loads cleanly on-device (no `ModuleNotFoundError`);
the QAM, scan/refresh, diagnostics, metadata, and the community feed all work again; the
community parser produces the same items via regex; a guard test prevents reintroducing
`html.parser` or similar.

**Out of scope:** any other feature change. Do not alter matching, the delisted index, the
frontend, or the community feed's behavior/output shape — only the parsing mechanism.

**Slug used throughout this plan:** `fix-htmlparser-import`

---

## Orchestration Contract

**Slug:** `fix-htmlparser-import`

**Plan file:**

```text
docs/plans/2026-07-01_fix-htmlparser-import.md
```

**Implementation branch:**

```text
feat/fix-htmlparser-import
```

**Round-complete marker:**

```text
/tmp/Playhub-Metadata-local/fix-htmlparser-import_finished
```

**Finalized marker:**

```text
/tmp/Playhub-Metadata-local/fix-htmlparser-import_finalized
```

**Review notes:**

```text
docs/review/fix-htmlparser-import-review-*.md
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
git checkout -b feat/fix-htmlparser-import
```

Commit this plan first:

```bash
git add docs/plans/2026-07-01_fix-htmlparser-import.md
git commit -m "docs(plan): add fix-htmlparser-import implementation plan"
```

---

## Implementation Tasks

Backend-only, `main.py` + tests. The existing `tests/test_community_steam_only.py` parser tests
must keep passing (they define the required output shape). Regex only — no new imports.

1. **Remove the html.parser dependency.**
   - Delete `from html.parser import HTMLParser` (main.py:28).
   - Delete the `class _SteamCommunityCardParser(HTMLParser): ...` (main.py ~79) entirely.
   - Keep `import html` (line 11) — `html.unescape` is still used and is fine.

2. **Reimplement `_parse_steam_community_ugc(self, html_text, limit=20)` with regex** (main.py
   ~2671), preserving the exact return shape it has today (a list sanitized via
   `self._sanitize_screenshots`, each item `{id, url, caption, author, link}`):
   - Split the document into card blocks on `apphub_Card` occurrences (e.g. iterate matches of
     `class="apphub_Card` and slice each block up to the next `apphub_Card` or end). Avoid
     catastrophic backtracking (bound each block; don't use a single greedy `.*` across 150 KB).
   - Per block, extract with focused regexes and reuse the existing helpers:
     - image: first `https://images.steamusercontent.com/ugc/[^"'&) ]+` → pass through
       `self._steam_community_image_url(...)` (which already upsizes the `imw` thumbnail). Skip
       the card if no image.
     - link: first of `data-modal-content-url="([^"]+)"` or an
       `href="([^"]*sharedfiles/filedetails/\?id=\d+[^"]*)"` (or a `steam-tracker`/community app
       link if that helper expects it) → `self._steam_community_link_url(...)`.
     - author: `apphub_CardContentAuthorName[^>]*>\s*<a[^>]*>([^<]+)</a>` → `html.unescape` +
       `self._clean_html_text`.
     - caption/title: optional — the existing tests expect `caption` from the card title text if
       present else `""`; keep it best-effort (e.g. an `apphub_CardTextContent`/title regex) or
       `""`. Match whatever the current tests assert.
     - id: `self._steam_sharedfile_id(link)` or the image URL (as today).
   - De-dupe by image URL; cap via the existing `cap = max(1, min(int(self._as_number(limit,20)),30))`.
   - Wrap in try/except returning `[]` on any error (never raise).
   - **Run the existing `tests/test_community_steam_only.py` and make its parser assertions pass**
     unchanged; if a test's expected value genuinely can't match the regex output, adjust the
     regex — do NOT weaken the test — and note it in the session log.

3. **Add a regression guard** `tests/test_no_unsafe_stdlib_imports.py`: read `main.py` source and
   assert it does **not** contain `from html.parser` / `import html.parser` (and, as a small
   allowlist, other modules known to be absent from Decky's frozen runtime if any are known —
   at minimum `html.parser`). This catches the class of bug the build/tsc/py_compile gates can't.

4. **Scope discipline:** only the import/class removal, the regex reimplementation, and the guard
   test. No other behavior change. No new imports; no frontend; no npm deps.

5. Record a session log under `docs/agent_conversations/` per `AGENTS.md` §9, noting the root
   cause (Decky's sandboxed Python lacks `html.parser`) and that gates can't detect it.

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
uv run --with pytest -- pytest -q tests/test_community_steam_only.py tests/test_no_unsafe_stdlib_imports.py
python3 -c "import ast,sys; ast.parse(open('main.py').read()); print('no html.parser:', 'html.parser' not in open('main.py').read())"
scripts/orchestration/run-quality-gates    # tsc + build + py_compile + full pytest
git status --short
```

Expected: `main.py` no longer references `html.parser`; community parser tests pass with the
regex implementation; guard test passes; full gate green; tree clean.

Deferred verification (requires hardware — performed by the human/orchestrator):

1. Rebuild from `dev`, sideload.
2. Confirm the backend **loads** — the plugin's `playhub-metadata.log` shows a fresh
   `[playhub:load] backend startup begin` / `backend ready`, and there is **no** `<defunct>`
   Playhub process / no `ModuleNotFoundError` in the Decky loader log.
3. Open the Playhub QAM → games count, metadata count, scan/refresh, achievement/cache sections,
   the **Diagnostics/Debug-logging/version** block, and the delisted status all render again.
4. Open a matched game → the Community section shows the real Steam feed (parsed via regex).

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished fix-htmlparser-import
```

This writes:

```text
/tmp/Playhub-Metadata-local/fix-htmlparser-import_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer fix-htmlparser-import`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/fix-htmlparser-import-review-*.md
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
   scripts/orchestration/clear-finished fix-htmlparser-import
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
   git add docs/review/fix-htmlparser-import-review-*.md
   git commit -m "docs(review): record fix-htmlparser-import review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished fix-htmlparser-import
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer fix-htmlparser-import` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed fix-htmlparser-import
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize fix-htmlparser-import
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Playhub-Metadata-local/fix-htmlparser-import_finalized
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
scripts/orchestration/finalize fix-htmlparser-import
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Playhub-Metadata-local/fix-htmlparser-import_finished
/tmp/Playhub-Metadata-local/fix-htmlparser-import_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
