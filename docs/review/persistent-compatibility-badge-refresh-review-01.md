# Review — persistent-compatibility-badge-refresh (round 01)

Branch: `feat/persistent-compatibility-badge-refresh`
Reviewed against: `docs/plans/2026-08-31_persistent-compatibility-badge-refresh.md`

## Verdict

Changes are required. The local quality gate passed, but the implementation has
not completed the required live Steam Deck validation. Two lifecycle paths also
need stronger handling before the badge can be called persistent.

## Gate status

- Local quality gate: PASS (26 Vitest files, 367 tests, and pytest passed in the
  implementer round).
- Steam Deck reachability: PASS during review (`scripts/decky doctor --deck`).
- Required on-device hard-reload and persistence checks: NOT RUN.
- Session record: incomplete because live evidence is still pending.

## Required changes

1. Complete the plan's on-device validation now that the Deck is reachable.
   Deploy the feature build, perform a SharedJSContext hard reload, and verify
   the Home badge before any detail navigation. Verify Home and Library grid
   badges again after at least two minutes and after a native AppOverview
   replacement. Confirm that official, unmatched, missing, unresolved, and
   Unknown cases have no badge. Run the no-launch live smoke set. Update the
   session record with exact commands, results, and evidence paths.
2. Make the mounted-grid wrapper recover when React replaces
   `grid.props.cellRenderer`. `installCachedHomeCellRenderer` returns early for
   every grid in `mountedHomeGrids` (`libraryCompatibilityIndicators.tsx:641-650`).
   If React publishes new props, the stored wrapper is no longer active, but
   later compatibility revisions only recompute the grid. Add a regression test
   that replaces `cellRenderer` after installation, sends a revision, and proves
   that the visible card still gets the compatibility slot. Restore the latest
   native renderer during cleanup.
3. Do not publish a class instance that skipped its constructor.
   `publishCompatibilityReplacement` uses `Object.create(prototype)` plus
   `Object.assign` (`metadataPatch.ts:269-291`). Live Steam has both `E`
   (`BHasObservables() === false`) and `P` (`BHasObservables() === true`)
   AppOverview classes. A prototype-only copy can claim the observable class
   behavior without its MobX initialization and can retain constructor-created
   fields that belong to the old instance. Preserve the native instance
   initialization contract, and add a focused test that proves constructor
   initialization and the AppOverview API survive publication.

STATUS: CHANGES_REQUESTED
