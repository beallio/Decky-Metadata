# Review — controller-layout-displayed-shortcut-search-isolation (round 01)

Branch: `feat/controller-layout-displayed-shortcut-search-isolation`
Reviewed against: `docs/plans/2026-07-14_controller-layout-displayed-shortcut-search-isolation.md`

## Verdict

The displayed-shortcut isolation design is otherwise coherent with the plan:
the reproduced Space Marine -> Assassin's Creed -> X-Men sequence is covered,
Search remains native-first and store/resolver-free, native array identity is
preserved when nothing is removed, and the shared breaker restores native-only
behavior. Two safety/audit defects must be corrected before the approval-gated
Deck run.

## Gate status

- Independent focused Vitest: 88 tests passed.
- Independent TypeScript, JS syntax, shell syntax, and fixture-selection checks
  passed.
- Independent `scripts/orchestration/run-quality-gates`: passed with 141 Vitest
  tests and the complete build/Python/version/review-note gate.
- `git diff --check dev...HEAD`: passed.
- Red evidence exists at the documented `/tmp/Decky-Metadata/...-red.log` and
  shows the two intended stale-shortcut failures against the old policy.
- No device-changing verification was run during review.

## Required changes

1. **Reject synthetic and out-of-domain matched source appids.**
   `resolveControllerLayoutContext` currently accepts every positive integer
   other than the displayed id, and `establishDisplayedContext` repeats that
   weak validation. Values in the shortcut namespace
   `0x80000000..0xffffffff` (for example X-Men's `3156562597`) and values above
   the unsigned 32-bit range therefore pass as a supposedly real matched Steam
   source and can reach Steam's supplemental query. This violates the plan's
   real-Steam-source and malformed-context fail-open requirements.

   - Define the valid native Steam source domain as integer appids greater than
     zero and below the reserved shortcut high-bit boundary `0x80000000`.
   - In the pure resolver, malformed metadata in the shortcut/overflow domain
     must produce an unmatched non-Steam context, never a supplemental source.
   - At the adapter boundary, an injected/malformed context carrying such a
     source must clear stale state, trip the existing breaker once after the
     native result is secured, show the existing toast once, and leave all later
     wrappers native-only.
   - Add pure and adapter tests for `0x80000000`, a reproduced synthetic shortcut
     id, `0xffffffff`, and `0x100000000`, while preserving the existing valid
     source, equal-id, fraction, and native-context coverage.

2. **Stop labeling the cache-populating controller probe as read-only.**
   `scripts/deck/verify/smoke_controller_layouts.sh` still opens with
   `Read-only ... discovery check`, and
   `tests/test_deck_fixture_selection.py` still names its contract test
   `test_controller_layout_probe_is_read_only...`. The probe intentionally calls
   `QueryConfigsForApp` and populates Steam's in-memory controller cache; the new
   runbook correctly says that requires explicit current device approval.
   Rename these labels to bounded/no-selection/cache-populating terminology so
   future agents do not bypass the user's approval boundary. Also correct any
   directly adjacent controller-smoke comment that calls `--no-launch`
   verification read-only. Preserve the assertions that forbid direct map
   mutation, selection, preview, save, reload, navigation, and launch.

3. Rerun the focused tests and complete local quality gate, update the session
   record with the correction and results, commit this review note plus the
   fixes, and recreate the round-complete marker. Do not access or modify the
   Steam Deck in this correction round; live verification remains a separate
   explicit approval gate.

STATUS: CHANGES_REQUESTED
