# Game Info Route Shield Exhaustion

Date: 2026-07-10

## Objective

Keep the Game Info quick-link buttons visible when returning from a subsection
on a matched non-Steam game's page, without weakening shortcut launch behavior.

## Root Cause

On-device debug traces proved that return navigation armed route-shield sequence
57 with four hits, then the Game Info render burst consumed all four hits in
approximately 4 ms. The next `BIsModOrShortcut` call for the same appid fell
through to the continuously re-armed truth window, returned `true`, and caused
Steam to render shortcut mode without the quick-link buttons.

## Files Modified

- `src/steam/core.ts`
- `dist/index.js`
- `dist/index.js.map`
- `docs/agent_conversations/2026-07-10_gameinfo-shield-exhaustion.md`

## Design Decisions

- Raised the appid-targeted shield budget from 4 to 64 hits and named it as a
  module constant. The larger budget is only a runaway backstop for unusually
  large render bursts.
- Kept the TTL at exactly 2000 ms and named it as a module constant. The TTL is
  the primary expiry and remains load-bearing for launch flows, which must see
  shortcut truth after the brief render-shield window.
- Preserved the existing single-slot shield, age comparison, appid matching,
  decrement behavior, clearing behavior, arming sites, and trace output.

## Validation

- Baseline `scripts/orchestration/run-quality-gates`: passed.
- Final `scripts/orchestration/run-quality-gates`: passed.
- `scripts/orchestration/check-review-notes-not-deleted`: passed.
- `git diff --check`: passed.

The existing rollup circular-dependency warning remains unchanged.

## Deferred On-Device Verification

Behavioral verification remains deferred to the human/orchestrator after the
`cold-boot-patch-install` prerequisite is merged and verified. The Deck check
must repeat the Game Info subsection round-trip, confirm the shield does not
exhaust mid-burst, exercise Play both before and after the 2000 ms TTL, and
regression-check unmatched shortcuts and real Steam games before promotion from
`dev` to `main`.
