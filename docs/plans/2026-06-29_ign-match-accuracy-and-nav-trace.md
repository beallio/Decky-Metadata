# Plan: IGN match accuracy and native nav tracing (ign-match-accuracy-and-nav-trace)

## Context

Two issues, confirmed on-device:

**(A) The IGN metadata matcher accepts the wrong game.** A shortcut named "Assassin's Creed:
Director's Cut" got its title/art/description from IGN's **"Assassin's Creed Valhalla"** page
(`source_url = ign.com/games/assassins-creed-valhalla`). The IGN matcher
`_auto_fetch_metadata_sync` (main.py:1440) accepts a candidate when
`_reasonable_match(cleaned, candidate_title)` passes — and `_reasonable_match` (main.py:7741)
returns true at **0.55 token overlap**. For "Assassin's Creed: Director's Cut" vs "Assassin's
Creed Valhalla" the shared {assassin, s, creed} tokens give ~0.6 overlap → wrongly accepted.
This is the same over-loose matching the Steam app-id matcher already had; the fix is to
require the query's **distinctive tokens** to be present in the candidate, reusing
`_distinctive_tokens_present` (main.py:7137) + `_normalise_match_title` (main.py:7117). The
Steam app-id match (15100 = Director's Cut) is already correct; only the IGN metadata match is
wrong.

**(B) The native page buttons don't redirect, and we don't yet know why.** The plugin makes a
matched shortcut look like a real app, so Steam renders its own native Store / Community Hub /
Discussions / Guides buttons on the game page. They navigate to the wrong place (synthetic
appid → main store / wrong app). The existing redirect (`installSteamLinkRedirect`,
steam.ts:3811) patches `NavigateToSteamWeb`/`NavigateToExternalWeb`/`OpenInSystemBrowser`/
`OpenExternalBrowserURL`/`window.open`/`SteamClient.Apps.ShowStore`, but on-device the log
shows **only one** `[playhub:nav]` event ever fired — so the native buttons use **other**
Steam-internal navigation methods we have not identified. Rather than keep guessing, this plan
adds **broad, temporary tracing** that logs every `SteamClient.Apps.*` and `Navigation.*`
(and `Router`) call (method name + scalar args) to `playhub-metadata.log` via the existing
`frontend_log` bridge, so a single round of button clicks reveals the exact method + appid
each button uses. A follow-up plan will then patch those precise methods.

Relevant files:
- `main.py` — `_auto_fetch_metadata_sync` (1440); helpers `_distinctive_tokens_present`
  (7137), `_normalise_match_title` (7117), `_reasonable_match` (7741).
- `src/steam.ts` — `installSteamLinkRedirect` (3811), `frontendLog` / `logSteamLinkNavigation`
  (3808), and `installSteamPatches` where the trace is installed onto `unpatchers`.

**Intended outcome:** (A) IGN no longer mismatches "Director's Cut" → "Valhalla" (distinctive
tokens required); (B) the log captures exactly which navigation methods the native page
buttons call, so the redirect can be completed precisely in a follow-up.

**Out of scope:** actually patching the newly-discovered methods (follow-up once the trace
data is in); the Community-tab tile content.

**Slug used throughout this plan:** `ign-match-accuracy-and-nav-trace`

---

## Orchestration Contract

**Slug:** `ign-match-accuracy-and-nav-trace`

**Plan file:**

```text
docs/plans/2026-06-29_ign-match-accuracy-and-nav-trace.md
```

**Implementation branch:**

```text
feat/ign-match-accuracy-and-nav-trace
```

**Round-complete marker:**

```text
/tmp/Playhub-Metadata-local/ign-match-accuracy-and-nav-trace_finished
```

**Finalized marker:**

```text
/tmp/Playhub-Metadata-local/ign-match-accuracy-and-nav-trace_finalized
```

**Review notes:**

```text
docs/review/ign-match-accuracy-and-nav-trace-review-*.md
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
git checkout -b feat/ign-match-accuracy-and-nav-trace
```

Commit this plan first:

```bash
git add docs/plans/2026-06-29_ign-match-accuracy-and-nav-trace.md
git commit -m "docs(plan): add ign-match-accuracy-and-nav-trace implementation plan"
```

---

## Implementation Tasks

### Part A — IGN matcher accuracy (`main.py`)

1. In `_auto_fetch_metadata_sync` (main.py:1440), require the **distinctive tokens** of the
   query to be present in a candidate's title before accepting it — at **both** acceptance
   points (the slug-candidate loop, ~line 1448, and the search-results pick, ~line 1457).
   Add a small private helper, e.g.:
   ```python
   def _ign_title_acceptable(self, query: str, candidate_title: str) -> bool:
       if not self._reasonable_match(query, candidate_title):
           return False
       q = self._normalise_match_title(query)
       c = self._normalise_match_title(candidate_title)
       return self._distinctive_tokens_present(q, c)
   ```
   and replace the two `self._reasonable_match(cleaned, ...title...)` checks with
   `self._ign_title_acceptable(cleaned, ...title...)`. This rejects "Director's Cut" →
   "Valhalla" (candidate lacks the distinctive tokens `director`/`cut`) while still accepting
   genuine matches. Do not change `_reasonable_match`, `_distinctive_tokens_present`, or the
   Steam app-id matcher.

2. **Tests** `tests/test_ign_match_accuracy.py` (harness): `_ign_title_acceptable`
   - returns `False` for query "Assassin's Creed: Director's Cut" vs candidate "Assassin's
     Creed Valhalla" (distinctive tokens missing), and for an unrelated title;
   - returns `True` for an exact/near title (e.g. query "Wobbly Life" vs "Wobbly Life", and
     query "Assassin's Creed: Director's Cut" vs "Assassin's Creed Director's Cut Edition").
   (Pure string logic; no network.)

### Part B — broad navigation tracing (`src/steam.ts`)

3. Add a temporary diagnostic `installNavigationTrace(unpatchers)` (call it from
   `installSteamPatches`, pushing teardown to `unpatchers`; reuse the `__playhubNavTrace`
   global-guard idempotency pattern like `__playhubNavRedirect`). It wraps the **function**
   properties of `(window as any).SteamClient?.Apps` and `Navigation` (and, if present,
   `(window as any).SteamClient?.Router` / the global `Router`) so each call is logged via the
   existing fire-and-forget bridge:
   ```ts
   void frontendLog("trace", `${objLabel}.${name}`, { args: scalarArgs }).catch(() => undefined);
   ```
   Requirements:
   - **Only wrap function-valued own/enumerable properties**; skip getters/non-functions.
   - **`scalarArgs`**: map args to a compact array of just numbers/short strings (truncate
     strings to ~80 chars; replace objects with their type name) so logging is safe and small.
   - To cut noise, **only log when** the method name matches
     `/store|community|hub|forum|discuss|guide|review|news|workshop|market|nav|url|web|app|overlay/i`
     OR any scalar arg is a number that is a known shortcut appid (`steamAppIdForApp(arg) > 0`).
   - The wrapper must **always call the original and return its result unchanged**, never throw
     (try/catch around the log only), and restore the original on teardown (guard that the
     property is still our wrapper).
   - This is explicitly temporary instrumentation; note in the session log that a follow-up
     will remove it and patch the discovered methods.

4. **Scope discipline:** Part A touches only the IGN acceptance check; Part B only adds the
   trace install + teardown. Do not change matching scoring, the existing redirect, the
   `BIsModOrShortcut` patch, or the Community-tab content. No npm deps; no
   `from __future__ import annotations` change.

5. Record a session log under `docs/agent_conversations/` per `AGENTS.md` §9.

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
uv run --with pytest -- pytest -q tests/test_ign_match_accuracy.py
scripts/orchestration/run-quality-gates    # tsc --noEmit + rollup build + py_compile + pytest
git status --short                          # clean
```

Expected:

- `tests/test_ign_match_accuracy.py` passes (Director's Cut rejects Valhalla; genuine titles
  accepted). `tsc`/build pass; full pytest green; tree clean.

Deferred verification (record in the session log; requires hardware — performed by the
human/orchestrator):

1. Rebuild the installer from `dev`, sideload, tap **Clear cache**. Confirm the "Director's
   Cut" shortcut now pulls **Director's Cut** metadata (not Valhalla) — its `source_url`/title
   should no longer be the Valhalla IGN page (or it falls back to no IGN match, which is
   acceptable).
2. Open a matched game and tap **each** native button — Store Page, Community Hub, Discussions,
   Guides — once. Then read `playhub-metadata.log` for `[playhub:trace] ...` lines and record
   the exact method name + appid each button invoked (e.g. `Apps.ShowStore(<appid>)`,
   `Navigation.NavigateTo...`). Paste those back as a review note / next-step input so the
   follow-up plan can patch precisely.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished ign-match-accuracy-and-nav-trace
```

This writes:

```text
/tmp/Playhub-Metadata-local/ign-match-accuracy-and-nav-trace_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer ign-match-accuracy-and-nav-trace`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/ign-match-accuracy-and-nav-trace-review-*.md
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
   scripts/orchestration/clear-finished ign-match-accuracy-and-nav-trace
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
   git add docs/review/ign-match-accuracy-and-nav-trace-review-*.md
   git commit -m "docs(review): record ign-match-accuracy-and-nav-trace review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished ign-match-accuracy-and-nav-trace
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer ign-match-accuracy-and-nav-trace` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed ign-match-accuracy-and-nav-trace
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize ign-match-accuracy-and-nav-trace
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Playhub-Metadata-local/ign-match-accuracy-and-nav-trace_finalized
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
scripts/orchestration/finalize ign-match-accuracy-and-nav-trace
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Playhub-Metadata-local/ign-match-accuracy-and-nav-trace_finished
/tmp/Playhub-Metadata-local/ign-match-accuracy-and-nav-trace_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
