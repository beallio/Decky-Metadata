# Plan: Fix QAM Panel Metadata Counter and Status Issues (qam-panel-metadata-fixes)

## Context

The QAM ContentPanel shows three metadata counters that disagree, and two smaller UI issues.

- **Issues 1 & 4 (backend counter mismatch).** After a scan the panel shows e.g.
  "Scan complete: 14/18 saved, 4 not matched" but "Missing metadata: 7" (and separately
  "3/7 saved, 4 not matched" vs "Missing metadata: 5"). Root cause: the scan pipeline increments
  `assigned` ("saved") purely on resolver status `"matched"`, and both the Steam and delisted
  resolvers return `"matched"` as soon as a `steam_appid` is resolved — even when the Steam store
  `appdetails` fetch fails or returns `success:false` (the normal response for a delisted appid),
  leaving the saved record with `source:"Manual"` and no description. The post-scan
  "Missing metadata" figure comes from `get_missing_metadata_count` → `_metadata_needs_scan`,
  which still flags such a record as missing (`source in {"", "manual"} and not has_description`).
  So an appid-only record is counted BOTH as saved AND as missing:
  `missing_after = failed + (assigned-but-incomplete)`. This is not a transient network artifact —
  delisted titles fail `appdetails` on every scan by design, so they mismatch permanently, and the
  `_metadata_scan_match_sync` short-circuit returns on the first `"matched"`, so IGN (the one
  resolver that could supply the missing description) is never tried for exactly those records.
  Evidence: `backend/scan_runner.py:72-73`; `main.py:494-499` (`_steam_scan_match_sync`),
  `main.py:501-514` (`_delisted_scan_match_sync`), `main.py:523-532` (`_metadata_scan_match_sync`),
  `main.py:483-492` (`_metadata_needs_scan`), `main.py:746-787`
  (`_metadata_with_steam_news_sync`, details gated behind `include_details`),
  `backend/providers/steam.py:329-330,424-432` (appdetails returns None on `success:false`/error).

- **Issue 2 (Refresh Activity affordance).** "Refresh Activity" re-fetches only the Steam
  Activity/news feed for games that already have a metadata record (`include_details=False`,
  `main.py:534-546`, `main.py:616-641`); it does not create new matches or refresh store details.
  The button has no explainer text, unlike the Metadata cache section
  (`src/ContentPanel.tsx:356`). Purely an affordance gap.

- **Issue 3 (delisted refresh redundant status).** While the delisted refresh is busy, the status
  line renders `inlineStatusStyle("active")` (blue) plus a `<BusySpinner/>` around stale text,
  while the button already shows its own busy spinner via `<ButtonLabel busy>`
  (`src/ContentPanel.tsx:357-373`). Two spinners + a blue duplicate of unchanged text. Cosmetic.

**Intended outcome.** After a scan, `assigned == total − missing` holds by construction; the panel
counters reconcile. The two frontend fixes remove the redundant spinner and add a one-line
explainer.

**Relevant files:** `main.py` (backend RPC facade + resolvers), `backend/scan_runner.py`
(pipeline counting), `src/ContentPanel.tsx` (QAM panel), `tests/` (pytest backend suite; harness
via `tests/_plugin.py` `make_plugin` and, for resolver/monkeypatch tests, `main.Plugin()` directly
as in `tests/test_scan_steam_first.py`).

**Slug used throughout this plan:** `qam-panel-metadata-fixes`

---

## Orchestration Contract

**Slug:** `qam-panel-metadata-fixes`

**Plan file:**

```text
docs/plans/2026-07-06_qam-panel-metadata-fixes.md
```

**Implementation branch:**

```text
feat/qam-panel-metadata-fixes
```

**Round-complete marker:**

```text
/tmp/Decky-Metadata/qam-panel-metadata-fixes_finished
```

**Finalized marker:**

```text
/tmp/Decky-Metadata/qam-panel-metadata-fixes_finalized
```

**Review notes:**

```text
docs/review/qam-panel-metadata-fixes-review-*.md
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
git checkout -b feat/qam-panel-metadata-fixes
```

Commit this plan first:

```bash
git add docs/plans/2026-07-06_qam-panel-metadata-fixes.md
git commit -m "docs(plan): add qam-panel-metadata-fixes implementation plan"
```

---

## Implementation Tasks

Do these in order: **A** (backend, TDD), then **B** and **C** (frontend). All three land on the
single branch `feat/qam-panel-metadata-fixes`.

> **Frontend build requirement (Tasks B & C).** `src/` is compiled to `dist/` by rollup and
> `dist/` is committed. After ANY edit under `src/`, you MUST rebuild (`npm run build`; the
> quality-gates hook also runs `npx tsc --noEmit` then `npm run build`) and commit the regenerated
> `dist/` so the working tree is clean. A dirty `dist/` fails the quality gates
> (`git status --short` must be empty). Task A is backend-only (no build needed).

### Task A — Fix the counter reconciliation (issues 1 & 4) — TDD

Goal invariant: **after a scan, `progress["assigned"] == progress["total"] - missing_after`**,
where `missing_after` is `get_missing_metadata_count` over the same games. A record only counts as
`assigned` when it is genuinely complete by the plugin's own predicate.

Write the tests FIRST (red), then implement (green). Do not weaken an existing test to pass; if
`tests/test_scan_steam_first.py` or `tests/test_scan_resolves_steam_appid.py` legitimately needs a
new case, add cases rather than editing expectations, and record rationale in the session log.
(Note: `test_scan_missing_steam_match_skips_ign` feeds a COMPLETE Steam record — description +
`source:"Steam"` — so it must stay green; only appid-only/incomplete matches change behavior.)

**Step 1 — pytest tests (red first).** Add a new test module, e.g.
`tests/test_scan_counter_reconciliation.py`, using the `main.Plugin()` + `monkeypatch` pattern from
`tests/test_scan_steam_first.py` (monkeypatch `_metadata_with_steam_news_sync`,
`_auto_fetch_metadata_sync`, `_resolve_delisted_appid_for_title`, and
`_ensure_delisted_index_sync` to avoid network). Cover:

1. **Appid-only Steam match does NOT count as assigned and stays missing.** Monkeypatch
   `_metadata_with_steam_news_sync` to return an incomplete record (has `steam_appid` + optional
   `steam_news`, but `source:"Manual"` and no `description`), and make IGN also miss. After
   `_scan_missing([...])`: assert the record is persisted (`steam_appid` present in
   `plugin._data["metadata"]`), assert `plugin._scan_progress["assigned"] == 0` and
   `["failed"] == 1`, and assert `get_missing_metadata_count` over the same game still returns 1.
2. **Delisted appid-only match: same expectation.** Monkeypatch `_resolve_delisted_appid_for_title`
   to return an appid and `_metadata_with_steam_news_sync` to return an incomplete record (no
   description); IGN miss. Assert not assigned, still missing, record persisted with the delisted
   `steam_appid`.
3. **IGN backfill completes an appid-only record → assigned.** Steam/delisted resolve an
   appid-only (incomplete) record, then `_auto_fetch_metadata_sync` returns metadata with a
   `description`; the enriched result must be complete. Assert `assigned == 1`, `failed == 0`, the
   persisted record has BOTH the pinned `steam_appid` (survives the merge) AND the description, and
   `get_missing_metadata_count` returns 0.
4. **Full reconciliation invariant.** Build a small games list mixing: a complete Steam match, a
   delisted appid-only-no-description match, and a total miss. After `_scan_missing`, assert
   `assigned == total - get_missing_metadata_count(games)` and `assigned + failed == total`.
5. **Predicate delegation.** A focused unit test that `_metadata_needs_scan(app_id)` still returns
   the same booleans as today for: no record → True; complete record → False; manual shell no
   description → True; appid-only no description → True (guards the refactor in Step 2).

**Step 2 — extract shared completeness predicate.** In `main.py`, add
`_metadata_is_complete(self, metadata: dict[str, Any] | None) -> bool` that returns the logical
inverse of the current `_metadata_needs_scan` body (`main.py:483-492`): a record is complete iff it
is a dict AND has a cleaned `title` AND (`source` casefolded not in `{"", "manual"}` OR it has a
cleaned description/short_description). Reuse the existing `_clean_game_title` / `_clean_html_text`
helpers exactly as `_metadata_needs_scan` does today so behavior is byte-identical. Then rewrite
`_metadata_needs_scan` (main.py:483-492) to delegate: `return not self._metadata_is_complete(...)`,
preserving its no-record → True short-circuit and its comment about repairing manual shells.

**Step 3 — resolvers return "matched" only when complete.** In `_steam_scan_match_sync`
(main.py:494-499) and `_delisted_scan_match_sync` (main.py:501-514): after building the enriched
`metadata` via `_metadata_with_steam_news_sync`, return
`{"status":"matched", "metadata":metadata, "source":...}` only when
`self._metadata_is_complete(metadata)`. Otherwise return
`{"status":"miss", "metadata":metadata, "source":...}` — keep the partial `metadata` (not `None`)
so `scan_runner` still persists the resolved `steam_appid`/`steam_news`
(`backend/scan_runner.py:70-71` saves any non-None metadata regardless of status). For delisted,
only produce a partial when an appid was actually resolved (unchanged early `"miss"` with
`metadata:None` when `_resolve_delisted_appid_for_title` yields nothing). `_ign_scan_match_sync`
(main.py:516-521) is unchanged (IGN records carry a real source + description).

**Step 4 — carry the best partial forward and try IGN.** Rewrite `_metadata_scan_match_sync`
(main.py:523-532) so it no longer returns on the first non-`None` partial. Iterate
`_steam_scan_match_sync`, `_delisted_scan_match_sync`, `_ign_scan_match_sync`:
- On a `"matched"` result, return it immediately (complete records still short-circuit, so a
  complete Steam match keeps skipping IGN).
- On a `"miss"` that carries `metadata` (an appid-only partial), remember the best partial
  (prefer one with a `steam_appid`) and CONTINUE to the next resolver.
- When reaching IGN with a remembered partial, merge so the pinned `steam_appid`/`steam_news`
  survive the IGN backfill — e.g. start from the partial, overlay IGN's fields, then re-run
  `_metadata_with_steam_news_sync` (which already passes an existing `steam_appid` through,
  main.py:795-798) and re-check `_metadata_is_complete`; return `"matched"` if now complete, else a
  `"miss"` carrying the merged best partial.
- If all resolvers miss, return `{"status":"miss","metadata":<best partial or None>,"source":"metadata"}`.

Keep the per-game progress messages coherent: a genuinely matched delisted record may still use the
"Matched delisted Steam app for {title}" message (main.py:606-610), but an appid-only record that
falls through to a miss should surface the miss message. If the existing `matched_messages` mapping
makes this awkward, prefer correctness of the counts over message wording and note any message
change in the session log.

**Do not** change `_metadata_needs_scan` to accept steam_appid+news as complete, and **do not**
patch the counts by recomputing `assigned` post-hoc — the fix must be at the resolver level so the
per-game status and the counts agree.

### Task B — Refresh Activity explainer (issue 2) — frontend

In `src/ContentPanel.tsx`, add a single `compactTextStyle` line describing Refresh Activity,
placed above the Scan/Activity button row (the `spacedButtonRowStyle` div at `src/ContentPanel.tsx:320`,
inside the first action `PanelSection`, around lines 318-320). Suggested copy (concise, one line):

> "Refresh Activity re-fetches the Steam Activity feed for games that already have metadata. It
> does not find new matches or update store details — use Scan metadata for that."

Mirror the existing Metadata cache explainer pattern at `src/ContentPanel.tsx:356`
(`<div style={compactTextStyle}>…</div>`). No new state, no behavior change. Then rebuild `dist/`
(see the frontend build requirement above) and commit.

### Task C — Delisted refresh redundant status (issue 3) — frontend

In `src/ContentPanel.tsx:357-362`, render the delisted status line at rest even while busy: use
`inlineStatusStyle("idle")` (drop the `delistedBusy ? "active" : "idle"` ternary) and remove the
conditional `<BusySpinner />` block so only the `<span>{delistedStatusText}</span>` remains. The
button's own `<ButtonLabel busy={true}>Refreshing...</ButtonLabel>` (lines 368-372) stays as the
single busy indicator. Keep the line present (do not hide it) to avoid layout jump in the QAM
column stack. `BusySpinner` then has no remaining use in this file — remove it from the import at
`src/ContentPanel.tsx:23` (confirm no other reference remains in the file before removing).
`delistedBusy` is still used for the button `disabled`/label. Then rebuild `dist/` and commit.

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

Automated (part of quality gates, must pass before marking the round complete):

1. `uv run --with pytest -- pytest -q` — the new `tests/test_scan_counter_reconciliation.py`
   passes, and the full existing suite (notably `test_missing_count.py`,
   `test_scan_steam_first.py`, `test_scan_resolves_steam_appid.py`,
   `test_scan_pipeline_refactor.py`) stays green.
2. `npx tsc --noEmit` and `npm run build` succeed (Tasks B & C).
3. `git status --short` is empty — `dist/` was rebuilt and committed after the `src/` edits.

Manual sanity (reason through, no device required for the plan):

- Task A: for a games list with a delisted appid-only match, `assigned + failed == total` and
  `assigned == total - get_missing_metadata_count(games)`; the appid-only record is persisted (so
  the Steam appid/news are usable) but reported as "not matched" and remains in the missing count
  until IGN or store details complete it.
- Task B: the explainer line appears above the Scan/Activity buttons.
- Task C: while refreshing the delisted index, only the button spinner shows; the status line stays
  neutral-colored with no spinner.

Deferred / on-device (NOT required for this round; note in the session log): confirm on the Steam
Deck QAM panel that the three counters (Detected / Metadata saved / Missing metadata) reconcile
after a real scan against live Steam/delisted data, and that the Refresh Activity explainer and
delisted status line render correctly in Gaming Mode. The "Metadata saved" counter
(`Object.keys(metadataCache).length`, `src/ContentPanel.tsx:123`) intentionally counts all stored
records including partials and is out of scope for this plan.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished qam-panel-metadata-fixes
```

This writes:

```text
/tmp/Decky-Metadata/qam-panel-metadata-fixes_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer qam-panel-metadata-fixes`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/qam-panel-metadata-fixes-review-*.md
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
   scripts/orchestration/clear-finished qam-panel-metadata-fixes
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
   git add docs/review/qam-panel-metadata-fixes-review-*.md
   git commit -m "docs(review): record qam-panel-metadata-fixes review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished qam-panel-metadata-fixes
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer qam-panel-metadata-fixes` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed qam-panel-metadata-fixes
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize qam-panel-metadata-fixes
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Decky-Metadata/qam-panel-metadata-fixes_finalized
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
scripts/orchestration/finalize qam-panel-metadata-fixes
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Decky-Metadata/qam-panel-metadata-fixes_finished
/tmp/Decky-Metadata/qam-panel-metadata-fixes_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
