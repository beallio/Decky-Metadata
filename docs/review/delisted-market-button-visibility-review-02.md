# Review — delisted-market-button-visibility (round 02)

Branch: `feat/delisted-market-button-visibility`
Reviewed against: `docs/plans/2026-07-07_delisted-market-button-visibility.md`

## Verdict

Changes requested. The semantic cache-only delisted classification issue from
round 01 is fixed, but the plan's whitespace gate still fails.

## Gate status

Reviewer reran:

```bash
./run.sh npm run build
./run.sh scripts/orchestration/check-review-notes-not-deleted
git diff --check dev...HEAD
```

`npm run build` and `check-review-notes-not-deleted` passed.
`git diff --check dev...HEAD` failed.

## Required changes

1. Remove the remaining trailing whitespace:

   ```text
   tests/test_delisted_market.py:41: trailing whitespace.
   ```

2. Rerun the plan gates:

   ```bash
   ./run.sh npm run build
   ./run.sh scripts/orchestration/run-quality-gates
   ./run.sh scripts/orchestration/check-review-notes-not-deleted
   git diff --check dev...HEAD
   git status --short
   ```

3. Commit the whitespace fix and this review note as durable audit evidence,
   then recreate the round-complete marker.

STATUS: CHANGES_REQUESTED
