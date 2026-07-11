# Session: Fix non-Steam launch regression (in-call truth precedence)

**Date:** 2026-07-11
**Branch:** `nonsteam-launch-incall-truth` → `dev`
**Objective:** Resume and close the release-blocking non-Steam launch
regression (`docs/research/2026-07-11_nonsteam-launch-regression.md`).

## What was done

1. **Traced the Play press on-device** (CDP, SharedJSContext + BPM targets):
   wrapped `BIsModOrShortcut`, `GetGameID`, `BHasRecentlyLaunched`,
   `SteamClient.Apps.RunGame` et al. with stack capture, drove real UI clicks
   on the Play button via dispatched pointer events.
2. **Root cause confirmed** (corrects the original hypothesis): Steam's Play
   handler derives the launch gameid via `GetGameID`/`GetPrimaryAppID`. Their
   patches force in-call truth (`bypassCounter = -1`), but the render-shield
   and `/library/home` checks in the `BIsModOrShortcut` afterPatch
   short-circuited first. On a matched game's detail page the shield is
   effectively always armed (route-render + history `listen` re-arm), so
   `GetGameID` returned a plain-appid gameid and `RunGame` silently dropped
   the launch — no GameAction created. Unmatched shortcuts were unaffected
   (shield arming is gated on `metadataCache[appId]`), which is why Ludusavi
   launched while matched games failed. 150 hijacked in-call truths
   (`reason='render-shield'`, `bypassCounterBefore='-1'`) found in the user's
   own session logs.
3. **Fix:** reorder the afterPatch (`src/steam/metadataPatch.ts`) — honor
   `bypassCounter === -1` (new trace reason `in-call-truth`) before
   `consumeRouteShield`/home checks; early-return paths no longer consume
   shield budget; `shouldBypass` simplified to `> 0`.

## Validation

- `./scripts/orchestration-hooks/quality-gates` — OK (tsc, rollup, py_compile,
  pytest).
- On-device after scp + hard-reload:
  - Play 3 ms after navigation (shield armed): `RunGame` got the correct
    64-bit gameid `14074539753793912832`, Transformers FoC launched. Before
    the fix the identical scenario passed `"3276984150"` and nothing ran.
  - Play after >2 s idle on the page: launched.
  - Rich Game Info page intact (HLTB rows, ACTIVITY/YOUR STUFF/COMMUNITY/GAME
    INFO sections) — render spoof unaffected.
  - Unmatched shortcut (Ludusavi): still launches.
  - Test games terminated; tracer removed from device.

## Notes

- `BHasRecentlyLaunched` exists and fires on *render*, not launch — useless as
  a launch armer; left in place (harmless) but no longer load-bearing.
- The release hold on `dev → main` was for this bug; with it verified fixed,
  promotion is unblocked pending the usual human gate.
- The quick-links idle-decay investigation remains open and separate
  (`docs/research/2026-07-10_matched-game-quicklinks-idle-decay.md`).
