# Plan: Delete dead Plugin wrappers, dead provider functions, and dead frontend modules (remove-dead-plugin-wrappers)

## Context

The thermo-nuclear review (`docs/reviews/2026-07-05_thermo-nuclear-fable.md`, BLOCKER 1 + MAJOR 9)
found that the backend decomposition into `backend/` modules left a large layer of **one-line
`Plugin` delegation wrappers** in `main.py`, a substantial fraction of which have **zero live
callers** — plus a few provider functions reachable only through those dead wrappers, and two
frontend modules imported nowhere. This plan is **deletion-only and behavior-preserving**: it
removes symbols with zero live callers and nothing else.

**This plan does NOT collapse the live wrapper layer** (the broader "repoint every caller/test to
`matching.*` / `steam_provider.*`" refactor from BLOCKER 1) — that is a larger behavioral-surface
change deferred to its own plan. Here we only delete what is provably dead.

### Enumeration verified against current code

Method-reference counting was run across `main.py`, `tests/`, and `src/` (word-boundary +
`self.`/`.NAME(` checks). Two categories:

**(A) MUST KEEP — not dead (do NOT delete):**
- **Decky lifecycle hooks** invoked by the Decky loader by name, not by in-repo callers:
  `Plugin._main` (`main.py:240`), `Plugin._unload` (`main.py:258`), `Plugin._migration`
  (`main.py:279`). Grep finds zero in-repo callers, but these are framework entry points — deleting
  them breaks plugin load/unload/migration. **Keep.**
- **All `async def` RPC methods** (`get_all_metadata`, `save_metadata`, `start_scan_missing`,
  `get_platform_capabilities`, …) — the frontend `callable()` bindings in `src/backend.ts` depend on
  their names. **Keep, untouched.** (Note: `get_platform_capabilities` is also called internally at
  `main.py:251`.)
- **Live wrappers** still referenced by RPC methods or tests (e.g. `_load_data`, `_save_data`,
  `_sanitize_metadata`, `_metadata_with_steam_news_sync`, `_steam_news_for_appid`,
  `_steam_news_image_candidates`, `_collected_steam_news_image_sources`, `_clean_game_title`,
  `_clean_html_text`, `_safe_int`, `_as_number`, `_https_url`, `_ign_title_acceptable`,
  `_parse_delisted_html`, `_date_to_epoch`, `_is_non_primary_steam_title`,
  `_distinctive_tokens_present`, `_steam_announcement_page_image`, `_read_steam_shortcuts`,
  `_extract_shortcuts_from_vdf`, `_normalize_shortcut_app_id`, `_steam_partner_events_for_appid`,
  `_steam_appdetails_for_appid`, `_steam_deck_compat_for_appid`, `_resolve_steam_appid_for_title`,
  `_resolve_delisted_appid_for_title`, `_ensure_delisted_index_sync`, `_load_delisted_index_sync`,
  `_delisted_index_path`, `_download_delisted_index_sync`, etc.). **Keep — out of scope for this
  deletion plan.**

**(B) DEAD — zero live callers anywhere (delete). `Plugin` methods in `main.py`:**

| Symbol | main.py line |
|---|---|
| `_scan_pipeline_message` | 553 |
| `_steam_event_json` | 807 |
| `_steam_localized_value` | 810 |
| `_steam_event_clan_id` | 813 |
| `_steam_partner_event_images` | 822 |
| `_steam_partner_event_image` | 825 |
| `_save_delisted_index_sync` | 860 |
| `_delisted_index_is_fresh` | 866 |
| `_steam_news_image` | 946 |
| `_ign_images_to_screenshots` | 961 |
| `_rawg_slug_candidates` | 1057 |
| `_jsonish_unescape` | 1076-1081 (`@staticmethod`) |
| `_field_is_empty` | 1115-1117 (`@staticmethod`) |
| `_shortcut_for_app` | 1159 |
| `_normalise_match_title` | 1167-1169 (`@staticmethod`) |
| `_vdf_get` | 1240-1242 (`@staticmethod`) |
| `_strip_surrounding_quotes` | 1244-1246 (`@staticmethod`) |
| `_steam_user_id_from_shortcut_path` | 1248-1250 (`@staticmethod`) |
| `_parse_binary_vdf_object` | 1255 |
| `_read_vdf_cstring` | 1260-1262 (`@staticmethod`) |
| `_slug_from_ign_value` | 1271 |
| `_absolute_ign_url` | 1274 |
| `_attributes_to_people` | 1277 |
| `_attributes_to_names` | 1280 |
| `_first_release_date` | 1283 |
| `_infer_store_categories` | 1286 |
| `_reasonable_match` | 1289-1291 (`@staticmethod`) |
| `_rating_to_percent` | 1301-1303 (`@staticmethod`) |

(28 dead `Plugin` methods. `_shortcut_app_id` at 1264-1266 is NOT in this list — verify its caller
count during implementation and delete only if genuinely zero-ref; the reference-count run flagged
it as borderline via substring collision with `_normalize_shortcut_app_id`, so re-check with a
word-boundary grep before removing. If it has any live caller, keep it.)

**(C) DEAD provider functions — reachable only through now-deleted wrappers (delete):**
- `backend/providers/ign.py:78-89` `rawg_slug_candidates` — only caller is the dead
  `_rawg_slug_candidates`. Its callees `slug_candidates` / `slug_from_ign_value` stay (live
  elsewhere).
- `backend/providers/steam.py:208-210` `steam_partner_event_image` — only caller is the dead
  `_steam_partner_event_image`. Its callee `steam_partner_event_images` stays (live via
  `steam_partner_events_for_appid`).
- `backend/providers/steam.py:251-253` `steam_news_image` — only caller is the dead
  `_steam_news_image`. Its callee `steam_news_image_candidates` stays (live).

**(D) DEAD frontend modules/exports (delete):**
- `src/steamLinks.ts` (whole file) — zero importers anywhere in `src/`, `tests/`, `scripts/`.
- `src/openExternalUrl.ts` (whole file) — zero importers anywhere.
- `getPlatformCapabilities` callable (`src/backend.ts:74-76`) + its `PlatformCapabilities` import
  (`src/backend.ts:6`) + the `PlatformCapabilities` type (`src/types.ts:267-276`) — the frontend
  callable is never invoked (grep: only its own definition). **Delete the frontend binding only —
  the backend `get_platform_capabilities` RPC method stays** (it is used at `main.py:251`).
- `hasAppDetailsStore` — exported at `src/steam/core.ts:21` and re-exported at `src/steam.ts:15`;
  no consumer. Delete the export and the re-export.

**Intended outcome:** `main.py` shrinks by ~90-130 lines (28 dead methods), three dead provider
functions and two dead frontend files are gone, and two unused frontend exports are removed —
with **zero behavior change**. Every deletion is justified by a zero-live-caller grep captured in
the session log.

### Relevant files
`main.py` (delete 28 dead methods), `backend/providers/ign.py` + `backend/providers/steam.py`
(delete 3 dead functions), `src/steamLinks.ts` + `src/openExternalUrl.ts` (delete files),
`src/backend.ts` + `src/types.ts` (remove `getPlatformCapabilities`/`PlatformCapabilities`),
`src/steam/core.ts` + `src/steam.ts` (remove `hasAppDetailsStore`), `dist/index.js` (rebuilt),
`docs/agent_conversations/`.

**Out of scope / deferred (needs its own effort):**
- The full BLOCKER 1 wrapper-collapse (repointing the ~15 live call sites and the test suite to call
  `matching.*` / `steam_provider.*` / `ign_provider.*` directly and deleting the *live* wrapper
  layer) is a larger behavioral-surface refactor deferred to its own plan.
- The MAJOR 9 `slug_candidates` "James Bond" special-case relocation (`backend/providers/ign.py:71-74`)
  is **live** logic, not dead code — deferred; do NOT touch it here.
- `PLUGIN_VERSION = ""` inlining (`src/ContentPanel.tsx:39`) is a live reference (seeds `useState`),
  not dead — deferred as a MINOR; do NOT touch it here.

> Source: thermo-nuclear review (2026-07-05) BLOCKER 1 + MAJOR 9, each dead symbol verified
> zero-live-caller against the current code by the author.

**Slug used throughout this plan:** `remove-dead-plugin-wrappers`

---

## Orchestration Contract

**Slug:** `remove-dead-plugin-wrappers`

**Plan file:**

```text
docs/plans/2026-07-05_remove-dead-plugin-wrappers.md
```

**Implementation branch:**

```text
feat/remove-dead-plugin-wrappers
```

**Round-complete marker:**

```text
/tmp/Decky-Metadata/remove-dead-plugin-wrappers_finished
```

**Finalized marker:**

```text
/tmp/Decky-Metadata/remove-dead-plugin-wrappers_finalized
```

**Review notes:**

```text
docs/review/remove-dead-plugin-wrappers-review-*.md
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
git checkout -b feat/remove-dead-plugin-wrappers
```

Commit this plan first:

```bash
git add docs/plans/2026-07-05_remove-dead-plugin-wrappers.md
git commit -m "docs(plan): add remove-dead-plugin-wrappers implementation plan"
```

---

## Implementation Tasks

Pure deletion. Before deleting each symbol, re-run a zero-caller grep and paste the result into the
session log — this is the audit trail that makes the deletion safe. If any listed symbol turns out
to have a live caller, **do not delete it**; record the discrepancy instead.

### Task 0 — Re-verify every dead symbol (audit gate)

For each symbol in categories (B), (C), (D), run a word-boundary reference check across
`main.py`, `backend/`, `src/`, `tests/`, `scripts/` and confirm the only match is the definition
itself. Example:

```bash
for n in _scan_pipeline_message _steam_event_json _steam_localized_value _steam_event_clan_id \
  _steam_partner_event_images _steam_partner_event_image _save_delisted_index_sync \
  _delisted_index_is_fresh _steam_news_image _ign_images_to_screenshots _rawg_slug_candidates \
  _jsonish_unescape _field_is_empty _shortcut_for_app _normalise_match_title _vdf_get \
  _strip_surrounding_quotes _steam_user_id_from_shortcut_path _parse_binary_vdf_object \
  _read_vdf_cstring _slug_from_ign_value _absolute_ign_url _attributes_to_people \
  _attributes_to_names _first_release_date _infer_store_categories _reasonable_match \
  _rating_to_percent; do
  echo "== $n"; grep -rwn "$n" main.py backend src tests scripts --include="*.py" --include="*.ts" --include="*.tsx" | grep -v "def $n"
done
```

Any symbol printing a line other than nothing has a live caller — exclude it from deletion and note
it. Separately re-check `_shortcut_app_id` (borderline) and, for category (C), grep
`rawg_slug_candidates`, `steam_partner_event_image`, `steam_news_image` across `backend/` and
`tests/`.

### Task 1 — Delete the 28 dead `Plugin` methods (main.py)

Remove each method in category (B) in full (decorator + def + body). Preserve `_main`, `_unload`,
`_migration`, every `async def` RPC method, and every live wrapper (category A). Do **not** reorder
or reformat surrounding methods — delete only the dead blocks so the diff is clean.

### Task 2 — Delete the 3 dead provider functions

- `backend/providers/ign.py`: delete `rawg_slug_candidates` (78-89). Confirm `slug_candidates` and
  `slug_from_ign_value` remain (they are called elsewhere).
- `backend/providers/steam.py`: delete `steam_partner_event_image` (208-210) and `steam_news_image`
  (251-253). Confirm `steam_partner_event_images` and `steam_news_image_candidates` remain.

### Task 3 — Delete dead frontend modules/exports

- `git rm src/steamLinks.ts src/openExternalUrl.ts`.
- `src/backend.ts`: remove the `getPlatformCapabilities` callable export (74-76) and drop
  `PlatformCapabilities` from the type import (line 6). **Do not** remove the backend
  `get_platform_capabilities` method in `main.py` (it is live at `main.py:251`).
- `src/types.ts`: remove the `PlatformCapabilities` type (267-276) only if it has no remaining
  importer after the `backend.ts` edit (re-grep to confirm).
- `src/steam/core.ts`: remove the `hasAppDetailsStore` export (21). `src/steam.ts`: remove
  `hasAppDetailsStore` from the re-export list (15). Re-grep to confirm no other consumer.

### Task 4 — Gates + rebuild + session log

- `./run.sh python3 -m py_compile main.py backend/*.py backend/providers/*.py`.
- `./run.sh uv run --with pytest -- pytest -q` (all existing tests must still pass unchanged — no
  test should reference any deleted symbol; if one does, that symbol was not actually dead — stop
  and reassess).
- `./run.sh npx tsc --noEmit` and `./run.sh npm run build`; stage `dist/`.
- Record `docs/agent_conversations/2026-07-05_remove-dead-plugin-wrappers.md`: the enumerated dead
  symbols with their zero-caller grep evidence (Task 0 output), the deletions, and the explicitly
  deferred BLOCKER-1 wrapper-collapse / James-Bond-alias / PLUGIN_VERSION items.

### Scope discipline

Deletion only, and only the enumerated dead symbols. Do NOT collapse live wrappers, repoint live
call sites/tests, relocate the James Bond alias, inline `PLUGIN_VERSION`, or reformat surviving code.
Every remaining behavior must be identical.

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
./run.sh python3 -m py_compile main.py backend/*.py backend/providers/*.py
./run.sh uv run --with pytest -- pytest -q            # ALL existing tests still green, unchanged
./run.sh npx tsc --noEmit                             # frontend still type-checks
./run.sh npm run build                                # dist rebuilt
scripts/orchestration/run-quality-gates
git status --short                                    # clean
```

Grep/scope gates:

```bash
# Task 1 — dead Plugin methods gone (each should print nothing):
for n in _scan_pipeline_message _steam_event_json _rawg_slug_candidates _jsonish_unescape \
  _field_is_empty _shortcut_for_app _normalise_match_title _reasonable_match _rating_to_percent \
  _parse_binary_vdf_object _steam_partner_event_image _steam_news_image _ign_images_to_screenshots; do
  echo "== $n"; grep -wn "def $n" main.py;
done
# Kept: lifecycle hooks + RPC methods still present:
grep -nE "def _main|def _unload|def _migration|def get_platform_capabilities|def save_metadata" main.py
# Task 2 — dead provider fns gone, callees kept:
grep -n "def rawg_slug_candidates" backend/providers/ign.py          # nothing
grep -n "def steam_partner_event_image\b" backend/providers/steam.py # nothing (singular)
grep -n "def steam_news_image\b" backend/providers/steam.py          # nothing (singular)
grep -n "def steam_partner_event_images\|def steam_news_image_candidates\|def slug_candidates" backend/providers/steam.py backend/providers/ign.py  # still present
# Task 3 — dead frontend modules/exports gone:
test ! -f src/steamLinks.ts && echo "steamLinks removed"
test ! -f src/openExternalUrl.ts && echo "openExternalUrl removed"
grep -rn "getPlatformCapabilities\|hasAppDetailsStore" src            # nothing
grep -rn "PlatformCapabilities" src                                   # nothing (type removed)
# No dangling imports of deleted symbols anywhere:
grep -rn "steamLinks\|openExternalUrl" src tests scripts --include="*.ts*" --include="*.py" --include="*.mjs"  # nothing
git diff --name-only dev..HEAD    # scope: main.py, ign.py, steam.py, backend.ts, types.ts, core.ts, steam.ts, (deleted 2 files), dist, docs
```

Static review:
- Every deleted symbol had a zero-caller grep recorded in the session log (Task 0).
- Lifecycle hooks (`_main`/`_unload`/`_migration`), all RPC `async def` methods, and every live
  wrapper remain untouched.
- `tsc`, `py_compile`, and the **unchanged** pytest suite all pass — no test referenced a deleted
  symbol, confirming deadness.
- `git diff` is deletions only (plus the rebuilt `dist` and the session log); no surviving code was
  reformatted or reordered.

### Deferred verification — on-device
Sideload and smoke-test: plugin loads (lifecycle `_main`), the QAM panel renders, scan/activity/
clear-cache/refresh-delisted actions work, and a non-Steam game's metadata page opens — confirming
no live path depended on a removed symbol.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished remove-dead-plugin-wrappers
```

This writes:

```text
/tmp/Decky-Metadata/remove-dead-plugin-wrappers_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer remove-dead-plugin-wrappers`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/remove-dead-plugin-wrappers-review-*.md
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
   scripts/orchestration/clear-finished remove-dead-plugin-wrappers
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
   git add docs/review/remove-dead-plugin-wrappers-review-*.md
   git commit -m "docs(review): record remove-dead-plugin-wrappers review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished remove-dead-plugin-wrappers
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer remove-dead-plugin-wrappers` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed remove-dead-plugin-wrappers
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize remove-dead-plugin-wrappers
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Decky-Metadata/remove-dead-plugin-wrappers_finalized
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
scripts/orchestration/finalize remove-dead-plugin-wrappers
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Decky-Metadata/remove-dead-plugin-wrappers_finished
/tmp/Decky-Metadata/remove-dead-plugin-wrappers_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
