# Review — compatibility-status-defaults (round 20)

Branch: `feat/compatibility-status-defaults`
Reviewed candidate: `b49d284`, installed full ZIP `0.3.14+b49d284` (live verified)

## Verdict

The round 19 diagnosis is right and the chosen approach is right, but `isCurrentMetadataEditorRoute` never matches on-device because its pattern omits Steam's `/routes/` prefix. The failure reproduces unchanged.

## Live evidence

Fixture `2312439508`, tag probe `T2` on the live native overview.

1. Game Info from Library Home: rich content, packed `10`, tag `T2`.
2. Editor Save of Unsupported: packed becomes `5` correctly, tag still `T2`, and Game Info renders the non-Steam placeholder. FAIL, identical to round 19.

Captured route tokens while the editor is open (the same sources `currentRoutePath()` joins):

- `m_history.location.pathname`: `/decky-metadata/2312439508`
- `window.location.pathname`: `/routes/decky-metadata/2312439508`
- `window.location.href`: `https://steamloopback.host/routes/decky-metadata/2312439508`

For comparison, Game Info reports `/library/app/2312439508/tab/GameInfo` and `/routes/library/app/2312439508/tab/GameInfo`.

## Required change

`isCurrentMetadataEditorRoute` matches `^\/decky-metadata\/(\d+)\/?$`, so the `/routes/decky-metadata/2312439508` token (and the pathname parsed from the `href` token) fails the match and the function returns `false` for the whole context. Accept the optional `routes/` prefix exactly like `isCurrentGameDetailRoute` does, so every token that names this app's editor route is recognized.

Keep the rest of the round 19 design: editor-route render identity stays separate from Game Info deferral, entering the editor still releases a held update, in-call truth still outranks render paths, and no other app or unmatched shortcut is spoofed.

## Required regressions

Assert against the real joined context, not just the bare router pathname. Use a context containing all three token forms above:

1. The editor route context for the app returns matched render identity, and a packed-changing editor write keeps the matched Game Info render.
2. A `/routes/`-prefixed editor route for a different app, and for an unmatched shortcut, still returns native shortcut identity.
3. The existing deferral, launch identity, and cross-game isolation tests stay green.

Add the token-form coverage to the existing route-predicate tests so this class of prefix mismatch cannot pass again.

Run the local gates, record actual results and the packaged version, commit, package locally, mark the round complete, and exit. The device fixture and global setting are at the captured baseline; Main owns the device. Do not make device calls in this round.

STATUS: CHANGES_REQUESTED
