# Session: Harden post-review findings

**Date:** 2026-07-11
**Branch:** `feat/review-hardening`
**Objective:** Implement the six robustness fixes from
`docs/plans/2026-07-11_review-hardening.md` in verify tooling and Steam patches.

## Changes

- Extracted the launch trace verdict into the stdlib-only
  `scripts/deck/verify/check_launch.py`. It requires the requested appid to be
  running, rejects the target's bare-appid launch signature, ignores malformed
  or unrelated RunGame arguments, and returns only the target's 64-bit gameid.
- Updated `smoke_launch.sh` to abort when a game is already running, pass the
  target appid into `click_play.js`, use the checker, and terminate only the
  verified target gameid. The click probe now waits for target-app context
  before selecting Play.
- Made `npm test` unconditional in the quality gate so missing Vitest tooling
  fails instead of silently skipping frontend tests.
- Added a bounded, teardown-aware retry for the quick-links section-class
  fingerprint. Each miss emits a console warning and a backend `warning` log.
- Added `withInCallTruth`, which saves and restores the prior bypass counter in
  `finally`; the GetGameID/GetPrimaryAppID patches now remain correct across
  nested calls and exceptions.
- Regenerated the committed Rollup artifacts in `dist/`.

## Design decisions

- The launch pre-flight aborts on any already-running game instead of trying to
  infer a set difference, keeping termination ownership explicit and safe.
- Unrelated 32-bit RunGame calls are ignored; only a call carrying the target's
  own bare appid is the launch-regression signature.
- Quick-links retry state is local to that installer. It does not expand
  `steamPatchTargetsReady` or delay unrelated patches, and its registered
  unpatcher cancels pending work on plugin unload.
- The truth-window helper restores the exact prior value rather than resetting
  to zero, preserving both nested truth windows and pre-existing armed windows.

## Validation

- `scripts/orchestration/run-quality-gates` — passed: TypeScript type-check,
  Rollup build, 20 Vitest tests, Python byte-compilation, and 227 pytest tests.
- `scripts/orchestration/check-review-notes-not-deleted` — passed.
- Targeted TDD:
  - `tests/test_check_launch.py` — 6 passed after the expected missing-checker
    red run.
  - `src/steam/inCallTruth.test.ts` — 2 passed after the expected
    missing-helper red run.

## Deferred on-device checks

Per the implementation plan, hardware checks are deferred to the
orchestrator/human before `dev` to `main` promotion:

- `scripts/deck/deploy.sh` and `scripts/deck/verify/run_all.sh` with the
  specified matched, delisted, and never-on-Steam fixtures.
- Forced quick-links fingerprint miss warning plus normal-boot install check.
- Matched-game launch during the shield window and `in-call-truth` reason log
  spot-check.

## On-device validation (run 2026-07-11, orchestrator)

Deployed to the Deck (`deploy.sh`) and ran the suite. Fixtures:
listed=`2312439508`, delisted=`3497159354`, never-on-Steam=`3462906031`.

- `smoke_quicklinks.sh` — PASS (B1 install both directions; metadata intact).
- `smoke_rerender.sh` — PASS (0 cache writes across subsection round-trips).
- `smoke_launch.sh 2312439508` — PASS. Game launched inside the shield window
  with a real 64-bit gameid (`9931852060871884800`), not the bare appid
  (validates A1/A2/A3 and B2).
- B1 forced fingerprint miss (broke the deployed bundle's `.includes(...)`
  literal): emitted `WARNING [decky:patch] never-on-Steam quick-links section
  target not found` for exactly 5 bounded attempts ~514 ms apart, then stopped.
  Correct bundle restored; `smoke_quicklinks.sh` re-passed.
- `logs.sh reasons` — `in-call-truth` (1788) and `truth-window` (109) present;
  in-call-truth precedence healthy (B2).

### Defect found and fixed on-device

`smoke_launch.sh` pre-flight read `SteamUIStore.RunningApps.length` (a raw
number), but `cdp eval` only prints the bare value for `type == "string"`
results and otherwise prints the full RemoteObject JSON — so the `== "0"`
compare never matched and the pre-flight always failed. Fixed by wrapping the
expression in `String(...)`, matching the JSON-string idiom every other probe
uses. This was a test-harness-only bug (the plugin is not involved in the
pre-flight); the automated gates could not have caught it.
