# Review — compatibility-status-defaults (round 21)

Branch: `feat/compatibility-status-defaults`
Reviewed candidate: `9d901da`, installed full ZIP `0.3.14+9d901da` (live verified with plugin debug tracing enabled)

## Verdict

The routed-editor identity fix is correct and is now confirmed active on-device, but it does not fix the failure. The device trace shows the real cause: the render shield's hit budget is exhausted during the editor-return render flood, and the next call falls through to the `GetPerClientData` truth window, which returns native shortcut identity while that app's own Game Info is rendering.

Correction to review 19: the "changed packed value" characterization was overfit. The failure is a load-dependent race. Four consecutive trials on this candidate produced three correct rich returns and one placeholder, and a same-value save also failed once.

## Device trace evidence

Full excerpt: `/tmp/Decky-Metadata/round21-editor-return-trace.log` (plugin debug logging enabled, `scripts/deck/logs.sh tail`).

Failing sequence for `2312439508`, all with `path='/routes/library/app/2312439508/tab/GameInfo …'` and `isCurrentMatchedRenderRoute='True'`:

1. `23:20:46,460` shield armed, `trigger='route-render'`, budget 64.
2. `23:20:46,506` `reason='render-shield'`, `finalRet=''` (spoofed, correct). Shield `remaining` already down to 35, then 34.
3. `23:20:46,539` `reason='truth-window'`, `finalRet='True'`, shield `before.remaining=0` then `after=None`. The budget was consumed inside about 80 ms, so this render call returned native shortcut identity.
4. Steam then renders and caches the non-Steam placeholder; later calls at `23:20:48,041` and `23:20:50,018` report `normal-shortcut` with `finalRet=''`, so identity is spoofed again but the cached placeholder subtree remains.

`src/steam/core.ts` documents the intent explicitly: "The hit budget is only a runaway backstop; the 2000 ms TTL is the real expiry required by launch flows." `ROUTE_SHIELD_MAX_HITS = 64` is therefore load-bearing for correctness today, which contradicts that intent.

## Required change

For a `BIsModOrShortcut` call whose route context is the exact current matched render route for that app (its Library detail route or its `/decky-metadata/<appid>` editor route), a truth window armed by `GetPerClientData` or `BHasRecentlyLaunched` must not yield native shortcut identity. Only real in-call truth, meaning `bypassCounter === -1` set by `withInCallTruth` inside `GetGameID` / `GetPrimaryAppID`, may outrank the render path. That keeps the documented launch protection intact while removing the shield hit budget from the correctness path for the app's own render.

Do not simply raise `ROUTE_SHIELD_MAX_HITS`; that leaves the same exhaustion class one flood larger. Keep native identity for other apps, unmatched shortcuts, Home, collections, and controller routes. Keep in-call truth first in precedence.

## Required regressions

1. Truth window armed (`bypassCounter > 0`) plus the app's own current matched render route plus an exhausted or absent shield: the decision spoofs (returns `false`), and the reason distinguishes it from a shield hit.
2. `bypassCounter === -1` still returns native identity on the same route, so launch identity is unchanged.
3. Truth window armed for a different app, an unmatched shortcut, or a Home/controller/collection route still returns native identity.
4. Existing deferral, editor precedence, and cross-game isolation tests stay green.

Run the local gates, record actual results and the packaged version, commit, package locally, mark the round complete, and exit. Main owns the device and will run the editor-return trials plus the launch smoke on the resulting candidate. Do not make device calls in this round.

STATUS: CHANGES_REQUESTED
