# Review — compatibility-status-defaults (round 14)

Branch: `feat/compatibility-status-defaults`
Reviewed against: `docs/plans/2026-09-07_compatibility-status-defaults.md`

## Verdict

Three bounded deferral edge cases need correction in HEAD
`29384d2dcbe0cb83c550e6a834c2ef79a5ec1488` (code `8c1571c`).
The overall approved policy is unchanged. These findings concern native
replacement preservation and complete authoritative route context.

## Gate status

- The implementation recorded a passing local gate with 467 frontend tests.
- Two independent read-only reviews traced the failures below. They did not
  run device or validation commands.
- Main owns device validation and installation. This correction round is
  local-only; do not operate the Deck concurrently.

## Required changes

### R1 — Preserve held status on every active native replacement

At `metadataPatch.ts:578-582`, an unchanged effective policy causes
`deferActiveCompatibilityUpdate()` to return false, and the incoming native
replacement is left unpatched. Example: the current fixed Verified state is
`0xf`, the desired policy is still Verified, but Steam supplies a replacement
with native nibble 0. The active view then loses Verified, and no pending
entry remains to repair it on exit.

Preserve the held/applied nibble on incoming replacements independently of
whether a DIFFERENT desired policy needs queuing. Include numeric Unknown
and repeated global changes that return to the held state. Preserve the
replacement's unrelated higher bits and exact native App ID.

### R2 — Reconcile retained state after a replacement during reload

At `metadataPatch.ts:299-301`, an adopted pending hold is retained but never
written back onto a native overview replaced while the old hooks were
uninstalled. Retain Playable (`0xa`) while Verified is pending, replace the
overview with native nibble 0 during the reload gap, then start the new
policy pass: the active native object stays Unknown instead of the retained
Playable state.

Reconcile the retained held nibble with the current exact native overview,
without applying the pending desired category early or publishing a new
active-view identity. Keep the eventual exit flush based on current policy.
Test this through the actual retain/adopt/startup path.

### R3 — Preserve query/hash tab state in history callbacks

`routerPatches.ts:450` passes only pathname to the flush. The route helper
already supports query/hash Game Info selection, such as
`/routes/library/app/2155012430?tab=GameInfo`. Dropping the search/hash turns
a same-view history event into a false exit and releases its held update.

Build the authoritative context from the callback's pathname, search, and
hash. Do not fall back to stale browser tokens. Cover a same-Game-Info query
or hash event that must stay held, followed by a real different-tab event
that must flush.

### Handoff

Add meaningful regressions for these three state transitions, run the local
gate, prepare the full ZIP, record actual results/version, commit, mark the
local round complete, and exit. Keep all other policy, reload cleanup,
controller behavior, and documentation semantics unchanged unless these
fixes require a precise correction.

No device actions, merge, push, release, or history rewrite in this round.
The matched-games-only option remains queued separately.

STATUS: CHANGES_REQUESTED
