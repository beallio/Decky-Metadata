# Review — marker-word-title-matching (round 01)

Branch: `feat/marker-word-title-matching`
Reviewed against: `docs/plans/2026-09-03_marker-word-title-matching.md`
Commit reviewed: `8ccdbcd fix(matching): preserve marker-word game titles`

## Verdict

The code is correct and complete. Every behavioral plan item is implemented,
and the evidence was re-verified independently rather than taken from the
session log. One audit-trail item is missing, which is the only reason this
round is not a pass.

Production code verified line by line:

- `backend/matching.py:81-85` — `_remove_words_unless_last_letter_erased`
  implements the specified semantics exactly: it returns the original text only
  when the text had an ASCII letter and the removal left none.
- `backend/matching.py:93-101` — the guard wraps exactly the three word
  removals (articles, edition words, marker alternation). The bracket and
  parenthesis removal on line 93 is correctly left unguarded, which is what
  keeps `1942 [USA]` normalising to `1942`.
- `backend/matching.py:106-113` — `is_non_primary_steam_title(name, query="")`
  skips any pattern that also matches the query and preserves the
  single-argument behavior. The `any(... and not ...)` form is semantically
  equivalent to the specified per-pattern filter.
- `backend/providers/steam.py:579` passes `clean_title`;
  `backend/providers/delisted.py:175` passes `clean`. No weight, ratio floor, or
  score floor was touched.

Independent verification of the evidence:

- Red set (`/tmp/Decky-Metadata/marker-word-title-matching-red-tests.log`)
  contains exactly the four new resolver tests, failing on the returned
  `(None, "")` and `0` — not on a fixture or import error.
- Mutation A (`...-mutation-a.log`) fails exactly six: the `Prototype` store and
  delisted resolvers plus the four protected normalisation values. The sequel
  and `Test Drive Unlimited` resolvers stay green, which is the isolation proof
  the plan required.
- Mutation B (`...-mutation-b.log`) fails exactly nine: all three store tests,
  the delisted test, and all five query-contains-marker helper cases, with no
  normalisation case failing.
- Both sets match the values the plan pre-computed by simulation, including the
  scores 990/330/-414, 1000, 995/356, and 1000/330.
- `git diff --numstat dev -- tests/` shows additions only (53/0, 7/0, 55/0). No
  existing assertion was edited.
- Working tree is clean and the round-complete marker's stamped sha equals
  `HEAD` (`8ccdbcd`).
- No review note was deleted, and the implementer wrote no review of its own.

The two extra helper cases the implementer added beyond the plan
(`("Space Marine Demo", "Space Marine Demo")` as `False` and
`("Test Drive Unlimited", "Drive Unlimited")` as `True`) are correct and
strengthen the contract. They are accepted.

## Gate status

Re-run by the reviewer on `feat/marker-word-title-matching`:

- `./run.sh uv run --with pytest -- pytest -q` — 477 passed.
- Working tree clean after the run; `dist/index.js` and `dist/index.js.map`
  unchanged.

Reported by the implementer and confirmed present in its captured logs:

- `./scripts/orchestration-hooks/quality-gates` exited 0 (tsc clean, rollup
  built, vitest 26 files / 390 tests, `py_compile` clean, pytest 477).
- `scripts/orchestration/check-review-notes-not-deleted` exited 0.
- `scripts/decky doctor` — `OVERALL WARN`
  (`/tmp/Decky-Metadata/marker-word-title-matching-doctor.log`). The warnings
  are pre-existing and unrelated to this change: dirty working tree at capture
  time, cache policy, repository-local `node_modules`, stale local package.
- `scripts/decky verify-change dev --explain` — `STATUS PASS`
  (`/tmp/Decky-Metadata/marker-word-title-matching-verify-change.log`).

## Required changes

1. Record the routing evidence in the session log. Implementation task 1 of the
   plan required running `scripts/decky doctor` and
   `scripts/decky verify-change dev --explain` **and recording their output**.
   Both were run and both logs exist under `/tmp/Decky-Metadata/`, but
   `docs/agent_conversations/2026-09-03_marker-word-title-matching.md` never
   mentions them, so the durable audit record is incomplete — a later reader has
   no way to know the required entry checks happened.

   Add them to the `## Final quality gate` section (or a short
   `## Routing checks` section) with: the exact command, its verdict
   (`OVERALL WARN` and `STATUS PASS`), the captured log path, and one line
   noting that the `doctor` warnings are pre-existing and unrelated to this
   change.

2. Also state in that section that the pre-edit bundle-sync precondition from
   task 1 was satisfied: `./run.sh npm run build` followed by
   `git diff --exit-code -- dist/index.js dist/index.js.map` exited 0 before any
   production edit, so no pre-existing `dist/` drift was folded into this
   change. The log `...-bundle-build.log` covers this; cite it.

Do not change any production code, test, `README.md`, or `CHANGELOG.md` content
for this round. This is a documentation-only round. Re-run
`scripts/orchestration/run-quality-gates` and
`scripts/orchestration/check-review-notes-not-deleted` afterwards, commit the
session-log change together with this review note, and recreate the
round-complete marker.

STATUS: CHANGES_REQUESTED
