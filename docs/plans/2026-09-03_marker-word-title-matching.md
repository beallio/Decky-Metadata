# Plan: Match games titled only with stripped marker words (marker-word-title-matching)

## Context

Decky Metadata cannot resolve a Steam app ID for a game whose title consists
entirely of words the matcher treats as edition/region/variant markers. The
reported example is `Prototype`, and the same failure hits `Prototype 2`. The
user-visible effect is that such a shortcut gets no Steam details, no Steam
news, no Valve compatibility category, and no matched quick links, even when
the Steam store search returns the exact game as its first result.

Two independent defects produce this. `Prototype` needs both fixed: the guard
alone leaves its exact candidate below the score floor, and the query-aware
penalty alone cannot recover an empty normalised query. `Prototype 2` fails
today for both reasons too, but the query-aware penalty alone would already
resolve it, because its current normalised form `"2"` matches its candidate's
`"2"` exactly. Both halves are still required: `"2"` is a degenerate query, and
the base game stays unmatchable without the guard.

**Defect 1 — normalisation erases the whole title.**
`normalise_match_title` in `backend/matching.py:87-99` applies its removals
unconditionally. `Prototype` matches the marker alternation at line 94
(`prototype`), so the function returns `""`; `Prototype 2` returns `"2"`. In
`backend/providers/steam.py`, `resolve_steam_appid_for_title` normalises the
query at line 559 and each candidate at line 569, then discards any candidate
whose own normalisation is empty at line 570. So the store entry literally
named `Prototype` is dropped before the exact-match branch at line 572 is ever
reached. `resolve_delisted_appid_for_title` in
`backend/providers/delisted.py:153-155` returns `0` immediately when the
normalised query is empty.

**Defect 2 — the non-primary penalty fires on the game's own name.**
`NON_PRIMARY_STEAM_TITLE_PATTERNS` in `backend/matching.py:8-25` includes
`\bprototype\b` (line 12) and `\btest\b` (line 24). `is_non_primary_steam_title`
(lines 102-104) is called on the candidate name only —
`backend/providers/steam.py:579` and `backend/providers/delisted.py:175` — so an
exact-title candidate scores `1000 - 800 = 200` in the delisted resolver and
`1000 - 800 - 5 x result index` in the Steam resolver, which is `190` for the
`Prototype` fixture in this plan and `195` for the `Test Drive Unlimited`
fixture. All are below the `< 300` floor (`steam.py:590`, `delisted.py:183`).
This is why the penalty must become query-aware: the marker word belongs to the
queried title itself. `Test Drive Unlimited` fails today for this reason alone,
with no involvement from Defect 1 — its query normalises cleanly, because
`test` is a penalty pattern but not a normalisation removal — which makes it the
isolating regression case for this half of the fix.

**Intended outcome.** A title whose marker words are load-bearing keeps them,
and a marker penalty applies only to a marker that is absent from the query.
Titles that legitimately carry a marker the query did not ask for —
`Warhammer 40,000: Space Marine Demo`, `... - Original Soundtrack`,
`Assassin's Creed Valhalla - Dawn of Ragnarök` — must keep losing exactly as
they do now.

**Guard scope, and why it is narrower than upstream.** The upstream port
`protondb-decky` (`beallio/protondb-decky`, branch `fork-main`,
`src/lib/matchTitle.ts`) guards every removal with
`const stripped = text.replace(removal, ' '); if (/[a-z]/.test(stripped)) { text = stripped }`.
Guarding *every* removal here would regress ROM-style titles whose base name has
no letters: `1942 [USA]` normalises to `1942` today, but a guarded
bracket removal would keep the bracket text and yield `1942 usa`, whose
distinctive token `usa` then rejects the real `1942` store entry. So guard only
the three word removals — articles (line 91), edition words (line 92), and the
region/version/marker alternation (lines 93-97) — and leave the bracket and
parenthesis removal (line 90) unguarded. With that scope, `1942 [USA]` still
normalises to `1942`: the bracket removal runs first, and the later word
removals see letterless text, so their guard never engages.

One narrow behavior change is accepted deliberately: a letterless base title
carrying a bare, unbracketed marker word, such as `1942 USA`, now normalises to
`1942 usa` instead of `1942`. No test pins that form, the bracketed spelling is
the one the console-suffix code actually handles
(`console_title_suffix`, `backend/matching.py:145-151`), and the alternative —
erasing the whole title — is the bug being fixed.

A title that is entirely bracketed, such as `[Prototype]`, still normalises to
`""`, because the unguarded bracket removal empties it before any guarded step
runs. That is unchanged from today and out of scope.

There is a third caller of the normaliser that this plan does not change but
must not disturb: `ign_title_acceptable` (`backend/matching.py:129-134`), used
at `backend/providers/ign.py:341`. It has no falsy short-circuit. Today an
all-marker query normalises to `""`, so its distinctive-token set is empty and
`distinctive_tokens_present` passes vacuously; after the guard that check
becomes meaningful. For realistic inputs the decision does not move, because
`reasonable_match` (`backend/matching.py:118-126`) already gates acceptance on
raw token overlap before normalisation. Task 4 adds a direct control on this
helper, and the IGN suites in Verification step 4 must stay green unchanged.

Relevant files: `backend/matching.py`, `backend/providers/steam.py`,
`backend/providers/delisted.py`, `tests/test_steam_matching.py`,
`tests/test_delisted_index.py`, a new `tests/test_matching_helpers.py`,
`CHANGELOG.md`, `README.md`, and a dated session record. The code change is
backend-only: do not touch `src/`, and do not regenerate `dist/`.

The working tree on `dev` may already carry an uncommitted six-line
`# Known blind spot:` comment above `normalise_match_title` describing this
bug. Carry it onto the branch and replace it with a short comment that states
the implemented guard. Do not leave a stale TODO or a comment that still
describes the bug as unfixed.

**Slug used throughout this plan:** `marker-word-title-matching`

---

## Orchestration Contract

**Slug:** `marker-word-title-matching`

**Plan file:**

```text
docs/plans/2026-09-03_marker-word-title-matching.md
```

**Implementation branch:**

```text
feat/marker-word-title-matching
```

**Round-complete marker:**

```text
/tmp/Decky-Metadata/marker-word-title-matching_finished
```

**Finalized marker:**

```text
/tmp/Decky-Metadata/marker-word-title-matching_finalized
```

**Review notes:**

```text
docs/review/marker-word-title-matching-review-*.md
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
git checkout -b feat/marker-word-title-matching
```

Commit this plan first:

```bash
git add docs/plans/2026-09-03_marker-word-title-matching.md
git commit -m "docs(plan): add marker-word-title-matching implementation plan"
```

---

## Implementation Tasks

1. Route the change and establish the failing contracts before touching
   production code.
   - Run the required entry checks from `AGENTS.md` section 5 and record their
     output: `./run.sh scripts/decky doctor`, then
     `./run.sh scripts/decky verify-change dev --explain`. Do not pass
     `--device` or `--allow-launch`; this change never reaches the Deck.
   - Record `git status --short` verbatim as the baseline. The uncommitted
     six-line `# Known blind spot:` comment on `backend/matching.py` and this
     plan file may appear in that baseline; both are in scope. Do not treat a
     non-empty baseline as a stop condition.
   - Prove the committed bundle is in sync before any edit: run
     `./run.sh npm run build`, then require
     `git diff --exit-code -- dist/index.js dist/index.js.map` to exit `0`. A
     non-zero exit means pre-existing bundle drift — stop and report it to the
     orchestrator instead of committing it under this plan.
   - All store-search app IDs below are synthetic fixture values, not claims
     about the live Steam store. Use them exactly.
   - In `tests/test_steam_matching.py`, using the existing `make_plugin()` and
     `stub_store_search(monkeypatch, plugin, items)` helpers (lines 6-20), add
     three tests with these exact names:
     - `test_steam_appid_matching_resolves_prototype_when_every_title_word_is_a_marker`:
       items in this order — `{"id": 700002, "name": "Prototype 2"}`,
       `{"id": 700003, "name": "Prototype Demo"}`,
       `{"id": 700001, "name": "Prototype"}`. Assert
       `plugin._resolve_steam_appid_for_title("Prototype")` returns
       `(700001, "https://store.steampowered.com/app/700001/")`. Expected
       post-fix scores: `700001` = 990, `700002` = 330, `700003` = -414.
     - `test_steam_appid_matching_resolves_prototype_sequel_without_collapsing_to_base_game`:
       same three items in the same order. Assert
       `plugin._resolve_steam_appid_for_title("Prototype 2")` returns
       `(700002, "https://store.steampowered.com/app/700002/")`. Expected
       post-fix result: `700002` scores 1000; the other two are rejected by
       `distinctive_tokens_present` because they lack the query token `2`.
     - `test_steam_appid_matching_resolves_test_drive_unlimited_despite_test_marker_pattern`:
       items in this order — `{"id": 700012, "name": "Test Drive Unlimited 2"}`,
       `{"id": 700011, "name": "Test Drive Unlimited"}`. Assert
       `plugin._resolve_steam_appid_for_title("Test Drive Unlimited")` returns
       `(700011, "https://store.steampowered.com/app/700011/")`. Expected
       post-fix scores: `700011` = 995, `700012` = 356. This case isolates
       Defect 2: `test` is a penalty pattern but not a normalisation removal,
       so its query normalises cleanly today and the fix that matters here is
       the query-aware penalty alone.
   - In `tests/test_delisted_index.py`, following that file's existing row
     fixtures, add
     `test_delisted_resolver_matches_prototype_when_every_title_word_is_a_marker`:
     rows `[700001, "Prototype"]` and `[700002, "Prototype 2"]`; assert
     `resolve_delisted_appid_for_title("Prototype", rows)` returns `700001`.
     Expected post-fix scores: `700001` = 1000, `700002` = 330; the delisted
     resolver applies no result-index deduction.
   - Run the four new tests and record each failure's exact assertion. The
     three store tests must fail on the returned `(None, "")` and the delisted
     test on `0` — not on a fixture, import, or stub error.

2. Guard the word removals in `normalise_match_title`
   (`backend/matching.py:87-99`).
   - Add a module-level helper that applies one `re.sub` removal and keeps the
     result unless that removal erased the last ASCII letter: keep the result
     unless `re.search(r"[a-z]", before)` matched and
     `re.search(r"[a-z]", after)` does not. Return the unmodified text in that
     one case.
   - Route exactly three removals through it, in their current order: the
     article removal (line 91), the edition-word removal (line 92), and the
     region/version/marker alternation (lines 93-97).
   - Leave the bracket and parenthesis removal (line 90) unguarded, together
     with the trademark-symbol strip (line 89), the non-alphanumeric collapse
     (line 98), and the whitespace collapse (line 99). The Context section
     explains why guarding line 90 would regress `1942 [USA]`; do not widen the
     guard to it.
   - Do not change any pattern's word list, and do not add or remove a marker.
   - Expected values after this task:
     - `Prototype` -> `prototype` (was `""`)
     - `Prototype 2` -> `prototype 2` (was `"2"`)
     - `Prototype Demo` -> `prototype demo` (was `""`)
     - `1942 [USA]` -> `1942` (unchanged)
     - `The Last of Us Part I Remastered` -> `last of us part i` (unchanged)
     - `Warhammer 40,000: Space Marine Demo` -> `warhammer 40 000 space marine`
       (unchanged; the marker removal still leaves letters, so the guard does
       not engage and this candidate keeps colliding with the base-game query,
       which is what the `-800` penalty is for)
     - `1942 USA` -> `1942 usa` (changed from `1942`; accepted, see Context)

3. Make the non-primary penalty query-aware.
   - Change `is_non_primary_steam_title` (`backend/matching.py:102-104`) to
     accept an optional second parameter, `query: str = ""`, keeping the
     existing single-argument behavior when it is empty or omitted.
   - When a query is supplied, ignore any pattern in
     `NON_PRIMARY_STEAM_TITLE_PATTERNS` that also matches the query text,
     normalised through the same `html.unescape(...).casefold()` treatment the
     function already applies to `name`. Return `True` only when some remaining
     pattern still matches the candidate name.
   - Update the two callsites to pass the queried title:
     `backend/providers/steam.py:579` (pass `clean_title`) and
     `backend/providers/delisted.py:175` (pass `clean`). Do not change the
     `-800` weight, the `-120` numeric penalty, the `0.72` ratio floor, or the
     `300` score floor.

4. Pin the helper behavior directly.
   - Add unit tests for `matching.normalise_match_title` covering every
     expected value listed in task 2, including all four unchanged cases and
     the one accepted change.
   - Add unit tests for `matching.is_non_primary_steam_title` proving the
     query-aware behavior for the marker patterns the following cases cover
     (`demo`, `prototype`, `pack`, `server`, `test`), each in both directions.
     Query-contains-marker cases must be
     `False`: `("Prototype", "Prototype")`,
     `("Test Drive Unlimited", "Test Drive Unlimited")`,
     `("Worms Armageddon Pack", "Worms Armageddon Pack")`,
     `("Server Simulator", "Server Simulator")`. Candidate-only marker cases
     must stay `True`: `("Prototype Demo", "Prototype")`,
     `("Warhammer 40,000: Space Marine Demo", "Warhammer 40,000: Space Marine")`,
     `("Sonic Mega Pack", "Sonic")`, `("Rust Dedicated Server", "Rust")`. The
     single-argument call `("Prototype",)` must still be `True`. The `pack` and
     `server` patterns (`backend/matching.py:17`, `:23`) have no test coverage
     today; these are their first.
   - Add one control for the IGN path that the guard makes non-vacuous:
     `matching.ign_title_acceptable("Prototype 2", "Prototype")` must be
     `False` both before and after the change. It fails the distinctive-token
     check on the query token `2` either way, so it proves the guard did not
     loosen IGN acceptance.
   - Place these in a new `tests/test_matching_helpers.py`, following the
     existing test files' plain-function layout.

5. Complete records.
   - Replace the `# Known blind spot:` comment above `normalise_match_title`
     with a short comment stating that the three word removals are skipped when
     they would erase the last letter, that the bracket removal is deliberately
     unguarded, and naming `protondb-decky`'s `src/lib/matchTitle.ts` as the
     parallel implementation.
   - Add one sentence to `README.md` in the `## See more in Game Info` section
     (after line 65) stating that a game whose title is made up of words like
     `Prototype` now matches its Steam entry automatically. `AGENTS.md`
     section 6 requires a README update when user-visible behavior changes, and
     matching accuracy is user-visible behavior.
   - Add a `CHANGELOG.md` `## [Unreleased]` entry under `### Fixed` saying that
     games whose titles are made up of words like `Prototype` or `Test` now
     match their Steam store entry, so they receive Steam details, news,
     compatibility, and quick links.
   - Record the root cause of both defects, the chosen guard semantics and the
     deliberate divergence from upstream, the red-then-green test evidence, the
     mutation results, and the quality-gate output in
     `docs/agent_conversations/2026-09-03_marker-word-title-matching.md`.

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

Follow
`skill://orchestration-plan-author/references/verification-standards.md`.

1. Prove the focused regressions fail first.
   - Before production edits, run:
     `./run.sh uv run --with pytest -- pytest -q tests/test_steam_matching.py tests/test_delisted_index.py`
   - Record the failing test names and the asserted values. The three store
     tests must fail on the returned `(None, "")` and the delisted test on `0`.
     A failure raised from a fixture, an import, or the stub means the test is
     wrong, not the production code.

2. Prove the fix turns them green and record counts.
   - After tasks 2-4, rerun the command from step 1 plus the new helper file:
     `./run.sh uv run --with pytest -- pytest -q tests/test_steam_matching.py tests/test_delisted_index.py tests/test_matching_helpers.py`
   - Record the pass/fail tallies, not a conclusion.
   - Then run the whole backend suite and record its tally:
     `./run.sh uv run --with pytest -- pytest -q`

3. Mutation-test each half of the fix separately, after step 2 is green. Each
   mutation has an exact expected failure set; record the observed set and
   compare. Every score and failure set below was pre-computed by simulating
   the specified implementation, so a deviation means the implementation
   differs from the plan — investigate before adjusting a test.
   - Mutation A — revert only the task-2 guard (call the raw `re.sub` chain
     again) and rerun the step-2 command. Expected red:
     `..._resolves_prototype_when_every_title_word_is_a_marker`,
     `test_delisted_resolver_matches_prototype_when_every_title_word_is_a_marker`,
     and the `normalise_match_title` helper cases for `Prototype`,
     `Prototype 2`, `Prototype Demo`, and `1942 USA`. Expected still green:
     `..._resolves_prototype_sequel_without_collapsing_to_base_game` — without
     the guard its query normalises to `"2"`, which still matches its
     candidate's `"2"` exactly once the penalty is query-aware — and
     `..._resolves_test_drive_unlimited_despite_test_marker_pattern`. That green
     pair is the isolation proof; if either goes red, the two halves are not
     independent and the plan's diagnosis is wrong.
   - Mutation B — revert only the task-3 query-aware behavior. Keep the
     optional `query` parameter in the signature but make
     `is_non_primary_steam_title` ignore it and apply every matching pattern,
     and restore both resolver callsites to the one-argument form. Reverting
     only the callsites is not enough: the direct two-argument helper tests
     would stay green and the mutation would prove nothing. Rerun the step-2
     command. Expected red: all three store tests, the delisted test, and every
     `is_non_primary_steam_title` case whose query contains the marker.
     Expected still green: every `normalise_match_title` case.
   - Restore the code after each mutation and rerun green. Commit neither
     mutation. A mutation that leaves its expected set green means the test does
     not defend the change and must be strengthened before proceeding.

4. Regression control — run last, after every failure case above.
   - `./run.sh uv run --with pytest -- pytest -q tests/test_steam_matching.py tests/test_ign_match_accuracy.py tests/test_ign_platform_preference.py tests/test_delisted_index.py tests/test_delisted_market.py tests/test_scan_steam_first.py tests/test_scan_resolves_steam_appid.py tests/test_steam_appid_override.py`
   - Every pre-existing expectation must still hold: the Space Marine base game
     still beats its demo and soundtrack, Valhalla still beats its DLC and the
     series entry, the wrong-series query still resolves to nothing, and IGN
     platform preference is unchanged.
   - Prove no existing assertion was edited rather than asserting it: run
     `git diff --numstat dev -- tests/` and record it. The deletions column must
     be `0` for every pre-existing test file; only additions are permitted
     there. A non-zero deletions count means an existing expected value was
     changed — stop and report it instead of proceeding.

5. Run the project gates.
   - `./scripts/orchestration-hooks/quality-gates`
   - `scripts/orchestration/check-review-notes-not-deleted`
   - `git diff --exit-code -- dist/index.js dist/index.js.map` — must exit `0`.
     `npm run build` runs inside the gate, and because no file under `src/`
     changes, the bundle must be byte-identical. A non-zero exit means
     something outside this plan's scope moved; stop and report it rather than
     committing the bundle.
   - Record each command's exit status and output.
   - After committing, run `git status --porcelain` and record its output
     verbatim. It must print nothing. Before committing it will list the
     intended files; that is not a failure, and `git status` alone never fails,
     so treat the empty-output requirement as the assertion.

Deferred and unverified work, stated explicitly:

- No on-device verification is required or performed. Nothing under `src/` or
  `src/steam/` changes, so the on-device trigger in `AGENTS.md` section 6 does
  not apply, and no Deck tooling beyond `scripts/decky doctor` and
  `scripts/decky verify-change dev --explain` is run.
- `README.md` receives one sentence (task 5). Nothing else in it changes: no
  interface, setting, or documented workflow moves.
- The live Steam store search is never contacted. Every resolver test stubs
  `plugin._http_json`, so the real ranking of a live `term=Prototype` response
  is unverified, and the synthetic fixture app IDs say nothing about which
  entries the live store actually returns for these titles. Whether `Prototype`
  and `Prototype 2` are still purchasable on Steam was not checked; if they are
  not, the delisted-index path carries them, and it too is covered only by a
  stubbed row fixture.
- The fix does not change any weight or floor (`0.72` ratio, `300` score,
  `-800` marker, `-120` numeric), so their tuning stays unverified outside the
  added cases. One consequence is inherited, not introduced: a query whose exact
  candidate is absent can still be answered by a near-miss sequel — with the
  guard, `Prototype` against a list containing only `Prototype 2` scores 330 and
  resolves. That is the same arithmetic every other title already gets (for
  example `Portal` against only `Portal 2`), so it is accepted as parity rather
  than fixed here.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished marker-word-title-matching
```

This writes:

```text
/tmp/Decky-Metadata/marker-word-title-matching_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer marker-word-title-matching`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/marker-word-title-matching-review-*.md
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
   scripts/orchestration/clear-finished marker-word-title-matching
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
   git add docs/review/marker-word-title-matching-review-*.md
   git commit -m "docs(review): record marker-word-title-matching review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished marker-word-title-matching
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer marker-word-title-matching` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed marker-word-title-matching
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize marker-word-title-matching
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Decky-Metadata/marker-word-title-matching_finalized
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
scripts/orchestration/finalize marker-word-title-matching
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Decky-Metadata/marker-word-title-matching_finished
/tmp/Decky-Metadata/marker-word-title-matching_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
