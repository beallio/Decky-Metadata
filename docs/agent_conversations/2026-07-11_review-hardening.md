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
