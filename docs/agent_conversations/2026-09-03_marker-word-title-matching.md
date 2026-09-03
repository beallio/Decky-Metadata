# Marker-word title matching

## Date

2026-09-03

## Objective

Allow a non-Steam shortcut to match the correct Steam entry when its title is
made entirely of words that the matcher normally treats as edition, region, or
variant markers. The reported cases are `Prototype` and `Prototype 2`.

## Root cause and implementation

- `normalise_match_title` removed marker words unconditionally. It turned
  `Prototype` into an empty string and `Prototype 2` into `2`, so the Steam
  resolver either discarded the exact candidate or gave it a degenerate query.
- The non-primary-title penalty also treated a marker that was part of the
  user's title as an unwanted variant. An exact `Prototype` or `Test Drive
  Unlimited` candidate lost 800 points and fell below the 300-point floor.
- `_remove_words_unless_last_letter_erased` now protects only the article,
  edition-word, and marker-word removals. It keeps a removal unless it erases
  the final ASCII letter. Bracket and parenthesis removal deliberately remains
  unguarded, so `1942 [USA]` still normalises to `1942`. This intentionally
  differs from `protondb-decky`'s broader `src/lib/matchTitle.ts` guard, which
  would retain `usa` and regress this console-suffix form.
- `is_non_primary_steam_title` now accepts the queried title and omits only
  penalty patterns already present in that query. Steam and delisted resolvers
  pass their clean query while the existing one-argument behavior remains.

## Test-first and mutation evidence

- Before production edits, the focused resolver run had 14 passing and 4
  failing tests. The three store assertions returned `(None, "")` instead of
  the synthetic `700001`, `700002`, and `700011` results; the delisted resolver
  returned `0` instead of `700001`. The output is saved at
  `/tmp/Decky-Metadata/marker-word-title-matching-red-tests.log`.
- After the fix, the focused resolver and helper suite had 37 passing tests;
  the full backend suite had 477 passing tests.
- Mutation A restored only the raw word-removal chain. It had exactly 6
  failures: the `Prototype` Steam and delisted cases plus the four protected
  normalisation values (`Prototype`, `Prototype 2`, `Prototype Demo`, and
  `1942 USA`). The sequel and `Test Drive Unlimited` resolver tests stayed
  green. Output:
  `/tmp/Decky-Metadata/marker-word-title-matching-mutation-a.log`.
- Mutation B retained the optional parameter but ignored it, and restored the
  one-argument resolver callsites. It had exactly 9 failures: all three Steam
  resolver cases, the delisted case, and all five query-contained-marker helper
  cases. No normalisation helper case failed. Output:
  `/tmp/Decky-Metadata/marker-word-title-matching-mutation-b.log`.
- The last regression control had 60 passing tests. `git diff --numstat dev --
  tests/` reported only additions: 53 lines in `test_steam_matching.py` and 7
  lines in `test_delisted_index.py`; no existing assertion was changed.

## Final quality gate

- `./scripts/orchestration-hooks/quality-gates` exited 0: TypeScript completed
  without diagnostics, Rollup built successfully, Vitest passed 26 files / 390
  tests, Python byte-compilation completed, and pytest passed 477 tests. Its
  captured output is `/tmp/Decky-Metadata/marker-word-title-matching-final-quality-gates.log`.
- `scripts/orchestration/check-review-notes-not-deleted` exited 0 with `no
  deleted review notes`. The post-build `git diff --exit-code -- dist/index.js
  dist/index.js.map` also exited 0.

## Files changed

- `backend/matching.py`
- `backend/providers/steam.py`
- `backend/providers/delisted.py`
- `tests/test_steam_matching.py`
- `tests/test_delisted_index.py`
- `tests/test_matching_helpers.py`
- `README.md`
- `CHANGELOG.md`
- `docs/agent_conversations/2026-09-03_marker-word-title-matching.md`

## Deferred verification

No Steam Deck or live Steam store call was made. All app IDs and store results
are synthetic, stubbed fixtures. No `src/` file changed, so the on-device
verification trigger does not apply. The existing score weights and thresholds
remain unchanged.
