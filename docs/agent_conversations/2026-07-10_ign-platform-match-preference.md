# IGN Platform Match Preference Implementation

**Date:** 2026-07-10  
**Objective:** Prefer an IGN PC edition when a non-Steam game has multiple
platform-specific IGN records, without losing matches that have no known PC
edition.

## Root cause

The IGN search fallback selected `results[0]` even though search results do not
include platform attributes. IGN platform data was available from the per-slug
query, but `game_to_metadata` discarded it. As a result, an otherwise acceptable
console-suffixed result such as `X-Men Origins: Wolverine [DS]` could win before
the matcher saw the PC edition.

## Changes

- Added generic helpers to identify PC platform names/slugs and recognized
  trailing console-platform suffixes.
- Added defensive extraction of IGN `platformAttributes` and persisted the
  normalized platform list in fetched metadata.
- Changed automatic IGN selection to use the planned hybrid strategy: stable
  title-suffix ranking followed by verification of fetched platform data.
- Preserved the first acceptable console-only result as a fallback, so a title
  is not left unmatched when IGN exposes no findable PC edition.
- Added offline tests for PC preference, console fallback, missing platform
  data, direct-slug behavior, helper behavior, platform extraction, and the
  existing title-acceptance regressions.

Existing incorrectly matched records are not rewritten. The affected game must
be re-fetched for the new selection behavior to take effect.

## Validation

- Targeted: `./run.sh uv run --with pytest -m pytest
  tests/test_ign_platform_preference.py tests/test_ign_match_accuracy.py -q`
- Full: `scripts/orchestration/run-quality-gates`
- Review-note deletion guard: passed as part of the orchestration quality gate.

Both targeted and full automated validation passed. The full suite completed
with 183 passing tests.

## Deferred verification

On-device verification remains for the human/orchestrator before promotion from
`dev` to `main`: re-fetch X-Men Origins: Wolverine, spot-check a title with PC
and console editions, confirm known-good matches remain stable, and confirm the
fallback prevents newly unmatched titles.
