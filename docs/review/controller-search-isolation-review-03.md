# Review — controller-search-isolation (round 03)

Branch: `feat/controller-search-isolation`
Reviewed against: `docs/plans/2026-08-07_controller-search-isolation.md`

## Verdict

The `displayed_appid` typo is fixed and the `field()` helper landed. Measured against
the extracted assertion block with fixtures built from the probe's real output shape:

- passing fixture → `EXIT: 0`, no stderr;
- fixture with `afterReturn.nativeAppidCount = 7` (the step-E leak) →
  `FAIL: native game's layouts persist in a shortcut's controller Search`, exit 1.

So the gate now reports the regression it exists to catch. Two problems remain, one
of which is my fault as plan author.

## Gate status

Re-run by the orchestrator on `99dc188`: `quality-gates: OK`, 201 tests. Deck still
unreachable at 12:14 PDT (`No route to host`), so Tasks 1 and 6 remain open and this
branch is not merging.

## Required changes

### 1. Remove the token-comment block; fix the test it was working around

`smoke_controller_layouts.sh:114-122` carries this:

```python
# The fixture-selection semantic check still expects the legacy index tokens to
# remain discoverable in this script:
# isolation["afterSecond"]
# after_second["firstDisplayedCount"]
# ...
```

Those comment lines exist to satisfy `tests/test_deck_fixture_selection.py:156-162`,
which greps this file for literal substrings like `'after_second["firstDisplayedCount"]'`.
Converting the real code to `field(after_second, "firstDisplayedCount", ...)` removed
the substrings, so the greps failed — and the comments put them back without the code
performing the access.

That makes the assertions pass while the property they were written to protect is no
longer checked. A future edit could delete every one of those reads and the test would
still be green. Do not satisfy a check with text that mimics the thing being checked.

**The plan's "do not change `tests/test_deck_fixture_selection.py`" constraint is
lifted for this specific conflict** — it was written before the `field()` refactor
existed and is what forced the workaround. Correct resolution:

1. delete the comment block;
2. update those assertions in `tests/test_deck_fixture_selection.py` to match the new
   accessor form, e.g. assert `'field(after_second, "firstDisplayedCount"'` and
   `'field(isolation, "afterSecond"'` rather than the raw subscript;
3. prove the updated test still discriminates: temporarily delete one converted
   assertion from the smoke script, run
   `uv run --with pytest -- pytest -q tests/test_deck_fixture_selection.py`, confirm it
   goes red, restore, confirm green. Record both outcomes.

Leave the rest of that test file alone.

### 2. One `activeStoreAppid` read still bypasses `field()`

`smoke_controller_layouts.sh:173`:

```python
if after_native["activeStoreAppid"] != native_appid:
```

It is the only direct subscript left outside the comment block (`grep -n
'after_native\["\|after_second\["\|after_third\["\|after_return\["\|isolation\["'`
returns exactly this line plus the comments). Measured — same block, fixture identical
to the passing one except `afterNative.activeStoreAppid` is absent:

```text
EXIT: 1
LAST_STDERR: KeyError: 'activeStoreAppid'
```

Expected `FAIL: probe payload missing isolation.afterNative.activeStoreAppid`. Route it
through `field()` and re-run that fixture to confirm the `FAIL:` line replaces the
traceback. Record the output.

### 3. Tasks 1 and 6 stay open

Unchanged. The Deck is still off the network; do not attempt the device run.

After 1–3: `scripts/orchestration/run-quality-gates`, commit, commit this review note,
re-mark the round complete.

STATUS: CHANGES_REQUESTED
