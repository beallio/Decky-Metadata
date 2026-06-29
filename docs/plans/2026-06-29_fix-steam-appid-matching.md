# Plan: Fix Steam app id matching accuracy (fix-steam-appid-matching)

## Context

The plugin matches a non-Steam shortcut's title to a real Steam app and stores the result in
`metadata.steam_appid`. That id drives the info box, Deck badge, and the native context-menu
Store/Community/Discussions/Guides links. **The matcher is resolving the wrong Steam app for
several titles**, so all of those surfaces point at the wrong game. Confirmed on-device
(persisted `playhub_metadata.json`) and reproduced locally:

- "Warhammer 40,000: Space Marine" → **55410** = *Space Marine **Demo*** (should be the real
  game, e.g. 55150 *Anniversary Edition* or 2183900 *Space Marine 2*).
- "Assassin's Creed **Valhalla**" → **15100** = *Assassin's Creed: Director's Cut* (the 2008
  original; should be 2208920 *Valhalla*).

Both are real Steam appids (NOT the shortcut's synthetic id — the frontend uses
`steam_appid` correctly). Three distinct backend flaws in `main.py`:

1. **Demo/variant stripping causes a false exact match.** `_normalise_match_title`
   (main.py:7072) strips `demo`/`beta`/`prototype`/`sample` (line 7079). So
   "…Space Marine Demo" normalises to exactly "warhammer 40 000 space marine" — equal to the
   query — and `_resolve_steam_appid_for_title` (main.py:1983) awards it the exact-match
   **+1000** (line 2018-2019), beating the real game. *Verified locally.*
2. **Series cross-match via a loose threshold.** `_reasonable_match` (main.py:7680) returns
   true at **0.55** token overlap, so "Assassin's Creed Valhalla" vs "Assassin's Creed
   Director's Cut" matches on just {assassins, creed} and scores **+700** (line 2020-2021),
   even though the distinctive token "valhalla" is absent from the candidate.
3. **Cache trap blocks re-resolution.** `_resolve_steam_appid_for_title` first short-circuits
   on any `store.steampowered.com/app/<id>` found in `metadata.steam_store_url` /
   `source_url` / `id` (main.py:1989-1994). Once a wrong match is saved, the plugin writes
   `steam_store_url` for that wrong app, and every subsequent resolve returns the **cached
   wrong id without re-searching** — so a scoring fix alone would not correct already-matched
   games.

There is already an unused, better-shaped helper `_title_match_score` (main.py:7086) that
does query/candidate token coverage plus a number-mismatch penalty — useful reference, though
this plan adjusts `_resolve_steam_appid_for_title` directly.

**Intended outcome:** the matcher prefers the real base game over demos/soundtracks/DLC,
rejects same-series mismatches that drop the distinctive title tokens, and re-resolves
already-cached titles (so the wrong matches self-correct on next enrichment) — making the
info box, Deck badge, and context-menu links point at the correct game.

Relevant seams (all in `main.py`):

- `_resolve_steam_appid_for_title` (main.py:1983) — the URL short-circuit (1989) and the
  per-result scoring loop (2009-2033).
- `_normalise_match_title` (main.py:7072), `_reasonable_match` (main.py:7680),
  `_clean_game_title` (main.py:7700), `_safe_int` (main.py:6471).
- `_http_json` (main.py:5017) — used for storesearch; do not change its TLS/redaction.

**Slug used throughout this plan:** `fix-steam-appid-matching`

---

## Orchestration Contract

**Slug:** `fix-steam-appid-matching`

**Plan file:**

```text
docs/plans/2026-06-29_fix-steam-appid-matching.md
```

**Implementation branch:**

```text
feat/fix-steam-appid-matching
```

**Round-complete marker:**

```text
/tmp/Playhub-Metadata-local/fix-steam-appid-matching_finished
```

**Finalized marker:**

```text
/tmp/Playhub-Metadata-local/fix-steam-appid-matching_finalized
```

**Review notes:**

```text
docs/review/fix-steam-appid-matching-review-*.md
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
git checkout -b feat/fix-steam-appid-matching
```

Commit this plan first:

```bash
git add docs/plans/2026-06-29_fix-steam-appid-matching.md
git commit -m "docs(plan): add fix-steam-appid-matching implementation plan"
```

---

## Implementation Tasks

Backend-only, in `main.py`. Follow TDD — the scoring is pure and unit-testable by stubbing
`_http_json` with a fixed storesearch payload (no network). Do not change frontend, TLS, or
`from __future__ import annotations`.

1. **Add a non-game-variant detector.** Add a small helper, e.g.
   `_is_non_primary_steam_title(name: str) -> bool`, that returns true when the **original**
   (un-normalised) candidate name indicates a non-base-game entry: matches (case-insensitive,
   word-boundary) any of `demo`, `beta`, `playtest`, `prototype`, `soundtrack`, `\bost\b`,
   `season pass`, `\bdlc\b`, `pack`, `bundle`, `artbook`, `art book`, `trailer`,
   `dedicated server`, `server`, `\btest\b`. Keep the list as a module constant for testing.

2. **Add a distinctive-token coverage check.** Add a helper, e.g.
   `_distinctive_tokens_present(query_norm: str, candidate_norm: str) -> bool`, that:
   - tokenises both on whitespace (they are already normalised lowercased strings);
   - treats numbers and tokens of length >= 3 as "distinctive" (skip ultra-common franchise
     filler is unnecessary — requiring the rare tokens is enough);
   - returns true only if **every distinctive query token appears in the candidate tokens**.
   This rejects "valhalla"∉"assassins creed directors cut" and number mismatches like query
   "space marine" (no number) vs candidate "space marine 2" only when you also apply task 3's
   number rule — see below.

3. **Rework the scoring in `_resolve_steam_appid_for_title`** (the loop at main.py:2009-2033):
   - Compute `normalised_name` as today.
   - **Reject** a candidate outright (`continue`) when
     `not _distinctive_tokens_present(normalised_query, normalised_name)` — this kills the
     Valhalla→Director's-Cut class of errors.
   - Base score: keep the exact-normalised `== ` bonus (+1000) and the difflib fallback, but
     **drop or tighten `_reasonable_match`** to avoid the 0.55 cross-match (either remove the
     +700 `_reasonable_match` branch entirely in favour of the difflib ratio, or only grant it
     when `_distinctive_tokens_present` already passed AND the ratio is >= 0.72). State which
     you chose in the session log.
   - **Penalise non-primary variants:** if `_is_non_primary_steam_title(name)` (original
     name), subtract a large penalty (e.g. `-800`) so a Demo/soundtrack/DLC can only win when
     nothing else matches. This makes the real game outrank "Space Marine Demo".
   - **Number/sequel rule:** if the query has no trailing/standalone number but the candidate
     name adds one (e.g. query "space marine" vs "space marine 2"), apply a smaller penalty
     (e.g. `-120`) so the base entry is preferred when both exist, without hard-rejecting a
     sequel when it is the only hit. (Reuse the digit-set comparison style from
     `_title_match_score`, main.py:7100-7105.)
   - Keep the existing `score -= index * 5` store-rank tiebreak.
   - Pick the highest-scoring candidate as today; if the best remaining score is below a
     sane floor (e.g. exact/`>=` 0.72 difflib or a positive score after penalties), return
     `None` rather than a poor match.

4. **Fix the cache trap (task 3 in Context).** In the URL short-circuit (main.py:1989-1994),
   **stop trusting the plugin's own previously-written `steam_store_url`**: only short-circuit
   on a `store.steampowered.com/app/<id>` found in the upstream `source_url` or `id` fields
   (provider-supplied), not on `steam_store_url` (which the matcher itself generates). This
   forces a real re-search with the corrected scoring, so already-cached wrong matches
   self-correct on next enrichment. (If preserving an explicit user-pasted Steam URL matters,
   note it in the session log as a follow-up — for now, correctness of auto-matching wins.)

5. **Tests** `tests/test_steam_matching.py` (harness; stub `_http_json` to return a fixed
   storesearch `items` payload — no network):
   - **Space Marine:** payload containing `{55410:"…Space Marine Demo", 55150:"…Space Marine -
     Anniversary Edition", 2183900:"…Space Marine 2", 3212020:"…Space Marine 2 - Original
     Soundtrack"}`; query "Warhammer 40,000: Space Marine" → resolves to a **non-variant base
     game (55150 or 2183900), never 55410 (demo) or the soundtrack**, and (number rule)
     prefers 55150 over 2183900 when both are present.
   - **Valhalla:** payload with `{2208920:"Assassin's Creed Valhalla", 15100:"Assassin's
     Creed: Director's Cut Edition", 2210140:"…Valhalla - Dawn of Ragnarök"}`; query
     "Assassin's Creed Valhalla" → resolves to **2208920**, never 15100, and not the DLC.
   - **Distinctive-token rejection:** a payload where only a wrong-series entry is present
     (e.g. query "Assassin's Creed Valhalla", items = only `{15100:"Assassin's Creed:
     Director's Cut Edition"}`) → returns `None` (no false match).
   - **Variant-only fallback:** query "Some Game", items = only a demo → returns `None` (or
     the demo only if you decide a lone demo is acceptable — pick `None` and assert it).
   - **Cache trap:** `_resolve_steam_appid_for_title("X", {"steam_store_url":
     "https://store.steampowered.com/app/999/"})` does **not** short-circuit to 999 — it runs
     the (stubbed) search instead; whereas `{"source_url": ".../app/999/"}` **does**
     short-circuit to 999. Assert both.
   - Helper unit tests: `_is_non_primary_steam_title` true for demo/soundtrack/DLC, false for
     a base game; `_distinctive_tokens_present` rejects the Valhalla/Director's-Cut pair.

6. Record a session log under `docs/agent_conversations/` per `AGENTS.md` §9, including the
   scoring-branch decision (task 3) and the red→green evidence.

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
uv run --with pytest -- pytest -q tests/test_steam_matching.py
scripts/orchestration/run-quality-gates    # tsc + build + py_compile + full pytest
git status --short                          # clean
```

Expected:

- `tests/test_steam_matching.py` passes: Space Marine resolves to a non-variant base game
  (never the Demo/soundtrack), Valhalla resolves to 2208920 (never the Director's Cut), the
  distinctive-token and variant-only cases return `None`, and the cache-trap test proves a
  cached `steam_store_url` no longer pins the result while an upstream `source_url` still
  does.
- Full quality gate passes (tsc/build/py_compile + pytest). Working tree clean.

Deferred verification (record in the session log; requires hardware — performed by the
human/orchestrator, not the implementer):

1. Rebuild the installer from `dev` and sideload on a real Steam Deck.
2. Because already-matched games self-correct only on re-enrichment, confirm re-resolution
   actually runs: after launching, check `playhub-metadata.log` for fresh `storesearch`
   requests for the affected titles and confirm the persisted `steam_appid` in
   `playhub_metadata.json` updates (e.g. Space Marine → 55150/2183900, Valhalla → 2208920).
   If a title remains stale, capture whether enrichment re-runs for already-cached games and
   feed it back as a review note (a one-time metadata refresh/rescan may be needed).
3. On the matched game, confirm the native context-menu Store/Community/Discussions/Guides
   now open the **correct** game's Steam pages, and the info box/Deck badge match.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished fix-steam-appid-matching
```

This writes:

```text
/tmp/Playhub-Metadata-local/fix-steam-appid-matching_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer fix-steam-appid-matching`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/fix-steam-appid-matching-review-*.md
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
   scripts/orchestration/clear-finished fix-steam-appid-matching
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
   git add docs/review/fix-steam-appid-matching-review-*.md
   git commit -m "docs(review): record fix-steam-appid-matching review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished fix-steam-appid-matching
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer fix-steam-appid-matching` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed fix-steam-appid-matching
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize fix-steam-appid-matching
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Playhub-Metadata-local/fix-steam-appid-matching_finalized
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
scripts/orchestration/finalize fix-steam-appid-matching
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Playhub-Metadata-local/fix-steam-appid-matching_finished
/tmp/Playhub-Metadata-local/fix-steam-appid-matching_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
