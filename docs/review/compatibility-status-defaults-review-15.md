# Review — compatibility-status-defaults (round 15)

Branch: `feat/compatibility-status-defaults`
Reviewed against: `docs/plans/2026-09-07_compatibility-status-defaults.md`

## Verdict

One retained-hold collapse variant remains in `7961576`. Preserve the
authoritative held value before mutating/deleting its pending entry.
This is a local, narrowly scoped correction; the approved policy is unchanged.

## Gate status

- The preceding local gate passed with 470 tests.
- Main has installed the full `0.3.14+7961576` ZIP and owns device validation.
- Do not make device calls or change unrelated behavior in this round.

## Required changes

### R1 — Keep the held nibble when queuing collapses back to the held policy

Both `applyCompatibilityToOverview` and
`applyCompatibilityToIncomingOverview` currently:

1. Take a local `heldNibble` from the current native object.
2. Call `deferActiveCompatibilityUpdate`.
3. Read the pending entry again, falling back to that local native nibble.

The helper can delete the pending entry when the latest desired policy equals
its retained held value. If the current object was replaced during reload,
its native nibble is not the retained held value.

Concrete case: retain held Playable (`0xa`); the native replacement is `0`;
the saved/latest desired policy is now Playable. The helper correctly drops
the unnecessary pending update, but the caller then falls back to `0` and
loses the retained `0xa` instead of reconciling it.

Resolve the authoritative held nibble BEFORE calling the helper, and use
that stable local value for preservation/reconciliation even if the helper
removes the pending entry. Apply this consistently to both paths; do not
apply a different pending desired value early.

Add a regression for reload adoption with a replacement native object and a
latest policy equal to the retained held state. Verify the held native value
is restored and no stale update is replayed on exit. Cover the corresponding
incoming path where applicable.

Run local gates, prepare the ZIP, record actual results/version, commit, mark
the round complete, and exit. No device action, merge, history rewrite, or
matched-games-only toggle implementation in this correction.

STATUS: CHANGES_REQUESTED
