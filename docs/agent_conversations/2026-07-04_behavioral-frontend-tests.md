# 2026-07-04 - behavioral-frontend-tests

## Objective

Implement `docs/plans/2026-07-03_behavioral-frontend-tests.md` by removing
frontend tests that inspect `src/*.ts(x)` as source text instead of behavior.

## Files Modified

- `tests/test_qam_controller_scroll.py`
- `docs/plans/2026-07-03_behavioral-frontend-tests.md`

## Design Notes

- `tests/test_qam_controller_scroll.py` was the only test reading a frontend source file with
  `read_text` and regex-matching JSX layout.
- The assertions guarded QAM controller navigation structure, but they were tied to exact source
  shape and would fail during harmless React refactors.
- This repository does not currently have a TS/React test runner or Decky UI render harness, so the
  source-regex test was removed rather than replaced with another brittle Python source scan.

## On-device Verification

After sideloading or reloading the plugin on Steam Deck Gaming Mode, open the Decky Metadata QAM
page and use controller directional navigation to move to the top stats block and bottom Versions
block. Focus should land on both display blocks, and the scroll panel should keep the focused block
visible.

## Validation

- Baseline before implementation: `scripts/orchestration/run-quality-gates` passed.
- Source-pinned frontend test scan:
  `grep -rn "read_text" tests | grep -E "src/.*\.(ts|tsx)"` produced no matches.
- Targeted pytest: `./run.sh uv run --with pytest -- pytest -q` passed with 107 tests.
- Final quality gate: `scripts/orchestration/run-quality-gates` passed.
- Review-note safeguard: `scripts/orchestration/check-review-notes-not-deleted` passed.
