# Review — non-steam-compatibility-status (round 11)

Branch: `feat/non-steam-compatibility-status`
Reviewed against: `docs/plans/2026-08-28_non-steam-compatibility-status.md`

## Verdict

The dropdown and packed-state matrix passed, but the selected-card feature still
fails after a normal hard reload. The final Home App-ID fix is correct in source
and tests; the runtime patch is not installed when Steam's lazy Library modules
are absent at plugin startup. This is the remaining root cause of the user's
missing Home/Library indicators.

## Gate status

- Reviewer deployed current HEAD containing `a64c19a`, saved Playable, and
  confirmed the exact shortcut overview had packed `10` / derived category `2`.
- `/tmp/Decky-Metadata/review-final-home-app-prop-playable.png` shows the
  selected Space Marine Home card with no compatibility indicators.
- A targeted live fiber probe confirmed the current card component receives
  `app.appid = 2155012430`; the `a64c19a` fallback is therefore the correct prop
  shape.
- Current frontend logs report `steam patches installed ... unpatcherCount=91`
  for the failing reload. Successful indicator-patch runs added another cleanup
  handle. No indicator installer retry occurs after the Library modules load.
- `installSteamPatches()` sets `installStarted` once core targets are ready and
  calls `installLibraryCompatibilityIndicators()` only once. That function
  returns when `resolveTargets()` cannot see lazy Library modules, permanently
  disabling indicators for that SteamUI session.

## Required changes

1. Make `installLibraryCompatibilityIndicators()` own a bounded, cancellable
   target-resolution retry. Register its cleanup immediately, even when targets
   are not yet available. Retry at a modest interval until Home, grid,
   indicator, and styles resolve; install transactionally once; then stop.

2. Dismount cleanup must cancel the pending timer, deactivate installed
   wrappers, and unpatch any installed Home/grid targets. Repeated ticks,
   repeated route loads, and repeated mount/dismount cycles must never install
   duplicate wrappers.

3. Inject the scheduler/clock into focused tests. Add red-to-green cases for:
   modules absent initially then available on a later tick; cleanup before
   resolution; target ambiguity that later resolves uniquely; successful
   install exactly once; and no post-cleanup retry.

4. Keep existing exact App-ID, positive-category, official pass-through,
   transactional install, stable-key, and teardown-safe wrapper behavior.
   Continue to fail closed after the retry bound rather than patching a guessed
   export.

5. Deploy from a non-Library route, hard-reload, then navigate to Home and the
   grid. With Playable packed `10`, both selected cards must show the Deck plus
   yellow Playable indicators. Repeat a hard reload while already on Home.
   Capture badge count/classes/labels, patch-install evidence, and screenshots.

6. Restore the fixture to Automatic and its original packed category, update
   the session log, close the tunnel, rerun the full quality gate, commit the
   source/tests/bundle/log, and mark complete. No backend package reinstall is
   required because this is a frontend-only installer-timing fix.

STATUS: CHANGES_REQUESTED
