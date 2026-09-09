# Review — compatibility-status-defaults (round 22)

Branch: `feat/compatibility-status-defaults`
Reviewed candidate: `9224499` (`c1e3bbc` plus its session record), installed full ZIP `0.3.14+9224499`

## Verdict

The editor-return failure is fixed and the approved behavior is verified on the Steam Deck, including the launch smoke. Approving for integration into the configured base.

## Device evidence (`0.3.14+9224499`)

Fixture: native shortcut `2312439508` (matched Steam ID `15100`), plus the suite's `3497159354` and `3462906031`.

- Editor return: six consecutive trials, alternating Unsupported and Playable, each entering Game Info fresh, saving in `Decky metadata...`, then `Done`. All six returned rich matched content with the saved status and the correct packed value. Before this candidate the same loop failed intermittently, including a `truth-window` native identity mid-render.
- Held active view: with Automatic and Playable, setting global Verified kept the active Game Info at Playable with rich content and links, while other eligible shortcuts moved to packed `15`.
- Overlay cancellation: opening the native `Manage` menu and cancelling it with a controller `escape` kept the held Playable value.
- Editor precedence: opening `Decky metadata...` released the hold and applied Verified (packed `15`); saving Unsupported then won (packed `5`) with a rich return.
- Inheritance: returning the per-game choice to Use global default showed Verified, and restoring global Automatic returned the shortcut to its captured native baseline (packed `10`).
- Publication: verified by holding a direct object reference to `appStore.m_mapApps.get(appid)`. A global default change and an editor Save both replaced that map entry, so Steam's collections observe both paths.
- In-place plugin reload with a held update (`DeckyPluginLoader.importPlugin("Decky Metadata")` while Game Info stayed selected): the view stayed responsive at Playable with links, and the pending Verified applied only after leaving Game Info.
- `scripts/deck/verify/run_all.sh --no-launch`: quick-links, re-render (0 cache writes over 3 subsection round-trips), community fallback, and controller layouts all passed.
- `scripts/deck/verify/smoke_launch.sh 2312439508`: PASS, game started with a 64-bit gameid, then terminated. This was authorized for this run.

Device state: the fixture, its per-game choice, the global default, and the `debug_logging` setting used for tracing are all restored to their captured baseline values.

## Record correction

Reviews 19 and 20 claimed "no replacement was published" based on a probe property left on the native overview. `createCompatibilityReplacement` copies own enumerable keys onto the replacement, so that probe could not detect a replacement and produced a false negative. The placeholder failures and the round 21 plugin-log trace are unaffected; publication works on both paths, as re-verified above with an identity reference.

## Remaining scope, intentionally not in this branch

The matched-games-only default toggle stays queued as separate work at the maintainer's request.

STATUS: APPROVED
