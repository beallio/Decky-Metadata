# Review — controller-search-isolation (round 04)

Branch: `feat/controller-search-isolation`
Reviewed against: `docs/plans/2026-08-07_controller-search-isolation.md`

## Verdict

Both round-03 findings are resolved. The token-comment block is gone,
`tests/test_deck_fixture_selection.py` asserts the `field(...)` accessor forms, and
`after_native["activeStoreAppid"]` now goes through the helper. Verified by the
orchestrator against the extracted assertion block, with fixtures built from the
probe's real output shape:

- passing fixture → `EXIT: 0`, no stderr;
- fixture missing `afterNative.activeStoreAppid` →
  `FAIL: probe payload missing isolation.afterNative.activeStoreAppid` (a `KeyError`
  last round);
- fixture with `afterReturn.nativeAppidCount = 7` →
  `FAIL: native game's layouts persist in a shortcut's controller Search`.

The updated pytest still discriminates: replacing one converted assertion in the smoke
with `if False:` fails it at `tests/test_deck_fixture_selection.py:159`; restoring gives
`7 passed`.

The source change has been correct and untouched since round 01. Every finding across
four rounds has been in the verification scaffolding.

## Gate status

`scripts/orchestration/run-quality-gates` on `29d65fe` → `quality-gates: OK`, 201 tests.

**The Deck is reachable again** as of 12:29 PDT — `ssh steamdeck` answers, the tunnel is
up, and `cdp.py list` enumerates the Big Picture targets. The blocker that held Tasks 1
and 6 open is gone, so this round executes them.

## Required changes

### 1. Execute Task 1 step 3 — the pre-change baseline (must FAIL)

Follow the plan's "R2" procedure exactly. `dist/index.js` is committed, so `dev`'s copy
is the pre-change bundle:

```bash
run_dir=/tmp/Decky-Metadata/verification/search-isolation
mkdir -p "$run_dir"
ssh "${DECKY_DECK_HOST:-steamdeck}" \
  'cat /home/deck/homebrew/settings/Decky-Metadata/decky_metadata.json' \
  > "$run_dir/metadata.json"
scripts/deck/verify/select_fixtures.py "$run_dir/metadata.json" > "$run_dir/fixtures.json"

git show dev:dist/index.js > dist/index.js
scripts/deck/deploy.sh --no-build
scripts/deck/verify/smoke_controller_layouts.sh "$run_dir/fixtures.json"   # MUST FAIL
```

Record the exact `FAIL:` line and the exit status. The expected failure is one of the
native-phase assertions — shortcut layouts leaking into the native game's Search, or the
native game's layouts persisting into the shortcut's Search.

If it passes, stop and report rather than continuing: a baseline that passes means the
probe is not exercising the bug and Task 6 would prove nothing.

Then restore the fixed bundle by rebuilding, and confirm the tree is clean again:

```bash
scripts/deck/deploy.sh
git status --short
```

### 2. Execute Task 6 — the post-fix run (must PASS)

```bash
scripts/deck/verify/smoke_controller_layouts.sh "$run_dir/fixtures.json"
```

Record the full stdout, including the pre-existing `OK: controller Search isolated ...`
line, the native-phase result, `isolation.nativeAppid` (a null is a FAIL, not a skip),
and the evidence JSON path.

### 3. Correct the stale scratch-check entry in the session log

The log still carries this from round 02:

```text
- Scratch verification for corrected `after_return` assertion line:
  - fixture payload: `{... "second":{"displayed_appid":123}}`
```

That fixture used the key that turned out to be wrong, so the entry records a check that
validated the typo. Replace it with the round-03/04 scratch results, or strike it and say
why. Then replace the "Task 1 / Task 6 not completed" note with the real device output
from changes 1 and 2, and state which Verification items are now satisfied.

### 4. Verification items to close

The plan's Verification steps 1 and 5 become satisfiable this round. Leave the "Not
verified" list intact — no layout is applied, no physical-controller input, the global
Settings → Controller page is untested, cold-cache is unit-only, and the aliased
matched-source fix is unit-only because no matched source is in this library.

After 1–4: `scripts/orchestration/run-quality-gates`, commit, commit this review note,
re-mark the round complete.

STATUS: CHANGES_REQUESTED
