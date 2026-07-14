# Review — controller-layout-displayed-shortcut-search-isolation (round 03)

Branch: `feat/controller-layout-displayed-shortcut-search-isolation`
Reviewed against: `docs/plans/2026-07-14_controller-layout-displayed-shortcut-search-isolation.md`

## Verdict

CHANGES_REQUESTED. The corrected verifier now passes the approved, targeted
on-device controller-layout sequence. Production behavior and local gates are
accepted; the remaining change is documentation-only so the durable session
record includes the live evidence and the explicitly deferred checks.

## Gate status

- `node --check scripts/deck/js/check_controller_layouts.js`: PASS
- `./run.sh uv run --with pytest -- pytest -q tests/test_deck_fixture_selection.py`: PASS (7 passed)
- `./scripts/orchestration-hooks/quality-gates`: PASS (149 Vitest tests plus
  TypeScript, bundle, Python compile, and pytest gates)
- Approved targeted Deck smoke: PASS, with evidence at
  `/tmp/Decky-Metadata/verification/controller-layouts-targeted-after-8291027.json`
- Post-smoke `scripts/deck/logs.sh audit --json`: PASS (`fatal:false`, no known
  signature groups, and no unknown errors)

## Required changes

1. Update
   `docs/agent_conversations/2026-07-14_controller-layout-displayed-shortcut-search-isolation.md`
   with the final live-verification evidence:
   - listed shortcut: Community shortcut/source counts `31/31`, elapsed `750 ms`;
   - delisted shortcut: Community shortcut/source counts `11/9`, elapsed `703 ms`;
   - never-on-Steam shortcut: native query only, Community count `1`, elapsed
     `405 ms`;
   - after switching from the first to second shortcut, the first displayed and
     source counts were both `0`, while the second displayed/source counts were
     `72/79`;
   - after switching to the third shortcut, both first and second displayed and
     source counts were `0`, while the current third displayed count was `71`;
   - the log audit was clean as recorded above.
2. Record that the broader dispatcher run's generic quick-links smoke failed
   because its listed fixture had no quick-links row; this is unrelated to the
   controller-search fix and remains outside this plan's scope.
3. Record that no game was launched. Launch verification remains explicitly
   deferred because it requires separate approval naming a safe shortcut; the
   successful targeted controller smoke satisfies this plan's in-scope live
   cache-isolation requirement.
4. Do not change production code or run another Deck action. Re-run the local
   quality gate, commit the documentation update, and recreate the finished
   marker.

STATUS: CHANGES_REQUESTED
