# Review — compatibility-status-defaults (round 19)

Branch: `feat/compatibility-status-defaults`
Reviewed candidate: `279fb6c`, installed full ZIP `0.3.14+279fb6c` (live verified)

## Verdict

The deferred publication is not the cause, and the failure is now isolated deterministically. Keep the ordered-publication work only if it stays correct, but fix the real cause: a packed compatibility write performed while the plugin's own editor route is current breaks the app's still-mounted Game Info tree.

## Decisive live evidence

Fixture: native shortcut `2312439508`, matched Steam ID `15100`. Probe: the live native overview in `appStore.m_mapApps` was tagged with `__deckyProbeTag = "T1"` before each case; the tag survived every case, so no observable-map replacement was published at any point.

1. Open Game Info from Library Home: rich matched content. Tag `T1`, packed `10`.
2. Editor Save whose effective category does not change the packed value (explicit choice equal to the current effective one, or a global change that a fixed per-game choice outranks): return renders rich matched content. Packed unchanged, tag `T1`. PASS.
3. Editor Save whose effective category changes the packed value (`5` -> `15`, and separately `10` -> `5`): the packed write is correct, but the returned Game Info renders Steam's non-Steam placeholder with no description, developer, or compatibility panel. Tag still `T1`, so nothing was published. FAIL.
4. Leaving to Library Home and entering Game Info again renders rich content correctly. The placeholder is a stale mounted tree, not persistent corruption.

The editor route observed during these cases is `/decky-metadata/2312439508`.

## Diagnosis to act on

While the plugin editor route is current, the app's Game Info tree is still mounted underneath. Writing the observable packed compatibility field on that overview re-renders that mounted tree while `currentRoutePath()` is the editor route. `decideBIsModOrShortcut` then classifies the call as `outside-current-detail` and returns Steam's native shortcut identity, so Steam renders and caches the placeholder subtree for that view. No map publication is involved.

Fix the route semantics rather than the symptom. The plugin's own editor route `/decky-metadata/<appid>` identifies exactly one app, and for render-identity purposes it belongs to that app's mounted detail tree. It must remain an exit for the compatibility deferral policy, because the approved contract says opening `Decky metadata...` releases a held update and a later editor Save wins. Those two questions are currently conflated in one route check; separate them.

Constraints: keep in-call truth outranking every render path so native launch identity is unchanged; do not spoof any other app or any unmatched shortcut; do not widen a TTL or hit budget as the fix; no per-app special cases; no render-phase walk over MobX store instances; no second general refresh system.

## Required regressions

1. A packed-changing write while the plugin editor route for that app is current keeps the matched identity for that app's render, and the returned Game Info renders rich matched content with the saved category.
2. The same write for a different app, or for an unmatched shortcut, still returns native shortcut identity.
3. The deferral contract still holds: opening the editor releases the held update, and a later editor Save wins over a previously queued global default.

Run the local gates, record actual results and the packaged version, commit, package locally, mark the round complete, and exit. Main owns the device; the fixture and global setting are restored to the captured baseline. Do not make device calls in this round.

STATUS: CHANGES_REQUESTED
