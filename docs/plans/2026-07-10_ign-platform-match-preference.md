# Plan: Prefer PC Platform in IGN Match Selection (ign-platform-match-preference)

## Context

**User-visible problem.** A matched non-Steam game can show metadata for the
wrong platform edition. On-device, `X-Men Origins: Wolverine` (a PC game) matched
IGN's **Nintendo DS** SKU: the record has `source_url:
https://www.ign.com/games/x-men-origins-wolverine-ds`, `developers: Griptonite
Games` (the DS studio, not the PC developer), and a DS box-shot as its only
"screenshot". The same failure mode can pick any console SKU (`[Xbox 360]`,
`[PS3]`, `[Wii]`, …) when IGN lists platform-specific editions.

**Root cause (code-pinned).** IGN exposes one object per platform edition, often
disambiguated only by a title suffix (`"X-Men Origins: Wolverine [DS]"`) and by
`objectRegions[].releases[].platformAttributes`. The matcher
(`backend/providers/ign.py:309-333`, `auto_fetch_metadata`) is platform-blind:

- the search fallback takes `results[0]` outright
  (`ign.py:329`), and the search query (`searchObjectsByName`, `ign.py:212-230`)
  returns **no** platform data — only title/slug/score, so nothing there can
  prefer PC;
- `ign_title_acceptable` (`backend/matching.py:70`) accepts
  `"X-Men Origins: Wolverine [DS]"` because its distinctive tokens match the
  query — platform is never considered;
- the per-slug fetch **does** retrieve `platformAttributes` (`ign.py:296`), but
  `game_to_metadata` (`ign.py:170-204`) reads only release dates from
  `objectRegions` and **discards the platform data**.

**Chosen approach (hybrid; confirmed with the user).** Two complementary signals:
1. **Search-time ranking** — demote candidates whose title carries a non-PC
   console suffix (`[DS]`, `[3DS]`, `[Wii]`, `[Wii U]`, `[Switch]`, `[Xbox]`,
   `[Xbox 360]`, `[Xbox One]`, `[PS2]`, `[PS3]`, `[PS4]`, `[PS5]`, `[PSP]`,
   `[PS Vita]`/`[Vita]`, `[GBA]`, `[GameCube]`, `[N64]`, `[N-Gage]`, …), so a
   PC/unsuffixed edition is tried first.
2. **Fetch-time verification** — surface the fetched SKU's platforms and only
   accept a candidate that lists a PC platform (`pc`/`windows`/`linux`/`mac`/
   `macintosh`/`steamos`); if the top-ranked candidate is console-only, fall
   through to the next candidate. Bounded to the top handful of candidates.

**No-regression rule.** If IGN exposes *no* PC edition for a title (only console
SKUs), the matcher must still return the best acceptable match rather than leave
the game unmatched — platform preference is a tiebreaker, not a hard filter. This
means `X-Men` may remain a console SKU if IGN has no findable PC edition; that is
acceptable and the bogus Market button is separately handled by
`market-button-appid-gate`.

**Effect on existing records.** This changes future scans/fetches only. Already
wrongly-matched records are not rewritten automatically — re-fetching the
affected game applies the new selection.

**Relevant files:** `backend/providers/ign.py` (selection + platform surfacing),
`backend/matching.py` (generic PC-platform / console-suffix helpers),
`tests/test_ign_match_accuracy.py` and/or a new test module. No frontend changes,
no `dist` rebuild.

**Slug used throughout this plan:** `ign-platform-match-preference`

---

## Orchestration Contract

**Slug:** `ign-platform-match-preference`

**Plan file:**

```text
docs/plans/2026-07-10_ign-platform-match-preference.md
```

**Implementation branch:**

```text
feat/ign-platform-match-preference
```

**Round-complete marker:**

```text
/tmp/Decky-Metadata/ign-platform-match-preference_finished
```

**Finalized marker:**

```text
/tmp/Decky-Metadata/ign-platform-match-preference_finalized
```

**Review notes:**

```text
docs/review/ign-platform-match-preference-review-*.md
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
git checkout -b feat/ign-platform-match-preference
```

Commit this plan first:

```bash
git add docs/plans/2026-07-10_ign-platform-match-preference.md
git commit -m "docs(plan): add ign-platform-match-preference implementation plan"
```

---

## Implementation Tasks

Backend-only (Python). `.protocol: TDD_REQUIRED=true` — write the failing tests
first, then implement. Run Python through `./run.sh`. Keep changes minimal and
behavior-preserving except for the documented selection change.

### Task 1 — tests first

Add tests (extend `tests/test_ign_match_accuracy.py` and/or a new
`tests/test_ign_platform_preference.py`, following the injected-callable style of
`auto_fetch_metadata` and the fixture patterns already in
`tests/test_ign_match_accuracy.py`). `auto_fetch_metadata(title, fetch_fn,
search_fn)` takes injected `fetch_fn`/`search_fn`, so drive it with fakes — no
network. Cover at least:

1. **Prefer PC over console at search fallback**: `search_fn` returns
   `[{title: "X-Men Origins: Wolverine [DS]", slug: "…-ds"}, {title: "X-Men
   Origins: Wolverine", slug: "…"}]`; `fetch_fn` returns the DS SKU with
   `platforms: ["nintendo-ds"]` and the plain slug with `platforms: ["pc"]`.
   Assert the PC one is chosen.
2. **Fetch-time skip of a console-only top rank**: even when the console SKU
   ranks first by title, if it has no PC platform and a later candidate does,
   the PC candidate is returned.
3. **No-regression fallback**: when the only acceptable candidate is console-only
   (no PC edition anywhere), that candidate is still returned (not `None`).
4. **Unknown/empty platforms accepted**: a candidate with `platforms: []` or no
   `platforms` key is treated as acceptable (don't over-filter when IGN omits
   platform data).
5. **Slug-candidate path honors platform**: if a direct slug candidate fetch
   returns a console-only SKU but a searched candidate is PC, the PC one wins;
   if the slug candidate is PC, it's returned without searching.
6. Unit tests for the helpers: `has_pc_platform([...])` truthy for
   `pc`/`windows`/`linux`/`mac`/`macintosh`/`steamos` (case-insensitive, matches
   on name or slug) and falsy for console-only; `console_title_suffix("Game
   [DS]")` detects the suffix while `console_title_suffix("Wobbly Life")` does
   not and a legitimately bracketed non-platform title (e.g. a subtitle in
   brackets) is not misclassified.
7. **Regression**: existing `ign_title_acceptable` acceptances/rejections in
   `tests/test_ign_match_accuracy.py` still pass unchanged.

### Task 2 — surface platforms from the fetched SKU (`backend/providers/ign.py`)

1. Add `ign_platforms(game: dict) -> list[str]` that collects platform
   identifiers from `game["objectRegions"][].releases[].platformAttributes[]`,
   taking each entry's `slug` (fallback `name`), lowercased/trimmed,
   de-duplicated, ignoring malformed entries. Mirror the defensive iteration style
   of `first_release_date` (`ign.py:103-113`).
2. In `game_to_metadata` (`ign.py:170-204`), add `"platforms":
   ign_platforms(game)` to the returned dict. This field is allowed to persist in
   saved records; do not strip it. Do not change any other returned field.

### Task 3 — generic helpers (`backend/matching.py`)

1. `has_pc_platform(platforms: list[str]) -> bool`: true if any entry
   (lowercased) matches a PC keyword set — `pc`, `windows`, `linux`, `mac`,
   `macintosh`, `steamos`, `steam-deck`/`steam deck` — via exact token or
   substring so IGN slug variants (e.g. `pc`, `windows-pc`) are caught. Empty
   list ⇒ `False`.
2. `console_title_suffix(title: str) -> str | None`: return the matched console
   token when the title ends with a bracketed non-PC console platform (case-
   insensitive) from the set listed in Context, else `None`. Only match a
   trailing `[...]` (or `(...)`) group so mid-title brackets/subtitles are not
   misclassified.

Keep these in `matching.py` so they are unit-testable alongside the existing
matching tests. Do not alter `ign_title_acceptable`'s existing acceptance rules;
platform logic is additive in the selection layer, not a new rejection inside
`ign_title_acceptable`.

### Task 4 — platform-aware selection (`backend/providers/ign.py::auto_fetch_metadata`)

Rewrite `auto_fetch_metadata` (`ign.py:309-333`) to:

1. Keep a single `fallback` holding the first acceptable-but-not-PC-verified
   match.
2. Define a local `consider(metadata)`: return the metadata only when it is
   truthy, `matching.ign_title_acceptable(cleaned, metadata["title"])` passes,
   **and** (`not metadata.get("platforms")` **or**
   `matching.has_pc_platform(metadata["platforms"])`). When acceptable but
   console-only, record it as `fallback` (first one wins) and return `None`.
3. Slug-candidate path: for each `slug_candidates(cleaned)`, `consider(
   fetch_metadata_fn(slug))`; return on first hit.
4. Search path: `results = search_metadata_fn(cleaned, 5)`; **stable-sort** so
   candidates whose title has `console_title_suffix(...)` sort **after** those
   without (preserve original order within each group). Iterate at most the top
   4 ranked candidates, `consider(fetch_metadata_fn(slug or url))`, return on
   first hit.
5. After both paths, return `fallback` (may be `None`). Never return a metadata
   whose title fails `ign_title_acceptable`.
6. Preserve the existing per-candidate `try/except: continue` guards so one bad
   fetch cannot abort selection.

Bound the number of fetches (slug candidates + top 4 search results); do not
fetch every result.

### Task 5 — session log

Record a session summary at
`docs/agent_conversations/2026-07-10_ign-platform-match-preference.md` per
`AGENTS.md`, covering: the platform-blind `results[0]` root cause, the hybrid
(title-suffix rank + platform verify) design, the no-regression fallback, that
existing mis-matched records need a re-fetch, and the deferred on-device
verification below.

### Scope discipline (exact allowed change list)

May change:

- `backend/providers/ign.py` — Tasks 2 and 4 (add `ign_platforms`, surface
  `platforms`, rewrite `auto_fetch_metadata`).
- `backend/matching.py` — Task 3 (add `has_pc_platform`, `console_title_suffix`).
- `tests/test_ign_match_accuracy.py` and/or new `tests/test_ign_platform_preference.py`.
- `docs/plans/2026-07-10_ign-platform-match-preference.md` (first commit),
  `docs/agent_conversations/` session log, committed review notes.

Must NOT change: `src/` (no frontend), `dist/` (no rebuild), `main.py` beyond
nothing (do not touch it), the IGN GraphQL query shapes (`searchObjectsByName`
already omits platform; the per-slug query already includes `platformAttributes`
— no query edits needed), existing tests' expected values, `package.json`. Do not
add title-/appid-specific hacks; behavior must derive from IGN platform data and
the generic console-suffix set.

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

Automated (must pass before any round is marked complete):

```bash
./run.sh uv run --with pytest -m pytest tests/test_ign_platform_preference.py tests/test_ign_match_accuracy.py -q
scripts/orchestration/run-quality-gates
```

The new tests are the primary proof (backend-only, no network — all selection is
driven through injected `fetch_fn`/`search_fn` fakes).

**Deferred on-device verification (required before dev→main; performed by the
human/orchestrator on the Steam Deck):**

1. Re-fetch metadata for `X-Men Origins: Wolverine`. Expected: if IGN exposes a
   PC edition, the record now shows the PC SKU (PC developer/screenshots, non-`-ds`
   `source_url`); if IGN exposes only console SKUs, the match is unchanged and no
   Market button shows (via `market-button-appid-gate`). Either outcome is
   acceptable — confirm which occurred and that it is not silently unmatched.
2. Re-scan / spot-check a title that has both console and PC IGN editions and
   confirm the PC edition is chosen.
3. Regression: re-confirm a set of already-correct matches (e.g. Wobbly Life,
   Prince of Persia The Lost Crown) still resolve to the same games — platform
   preference must not dislodge good matches.
4. Confirm no title is newly left unmatched that previously matched (the
   `fallback` path).

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished ign-platform-match-preference
```

This writes:

```text
/tmp/Decky-Metadata/ign-platform-match-preference_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer ign-platform-match-preference`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/ign-platform-match-preference-review-*.md
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
   scripts/orchestration/clear-finished ign-platform-match-preference
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
   git add docs/review/ign-platform-match-preference-review-*.md
   git commit -m "docs(review): record ign-platform-match-preference review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished ign-platform-match-preference
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer ign-platform-match-preference` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed ign-platform-match-preference
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize ign-platform-match-preference
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Decky-Metadata/ign-platform-match-preference_finalized
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
scripts/orchestration/finalize ign-platform-match-preference
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Decky-Metadata/ign-platform-match-preference_finished
/tmp/Decky-Metadata/ign-platform-match-preference_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
