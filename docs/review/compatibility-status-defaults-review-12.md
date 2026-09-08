# Review — compatibility-status-defaults (round 12)

Branch: `feat/compatibility-status-defaults`
Reviewed against: `docs/plans/2026-09-07_compatibility-status-defaults.md`

## Verdict

Ordinary mounted compatibility updates now pass on the full installed
`0.3.14+3824a3a` candidate (HEAD
`3824a3a1f4409e3913c3059d8380e87bfc27707b`). A repeatable in-place reload
failure remains: reloading the plugin with Game Info open, then changing
the global setting, freezes SteamUI. Fix the reload lifetime/retained-state
problem without weakening the successful native-frame handoff.

## Gate status

- Full installation and bundle equality are recorded at
  `/tmp/Decky-Metadata/diagnostics/20260908T205515Z/doctor.json`.
- Main verified ordinary Automatic -> Verified -> Automatic while rich
  matched Game Info remained selected and intact. Files under
  `/tmp/Decky-Metadata/compat-final-20260908-uj5zn3hd/` include:
  `permanent-frame-automatic-before.json`,
  `permanent-frame-verified-mounted.json`, and
  `permanent-frame-automatic-restored.json`.
- An unchanged Follow Valve exception stayed Playable with rich details
  after a global change; an unchanged fixed Unsupported exception also
  remained intact after the prior shield expired.
- The failure below was repeated after releasing ALL managed browser
  attachments and restarting Steam through the documented recovery.
  That isolated run used only committed `cdp.py`, `nav.js`, and
  `click_by_label.js` plus ordinary DOM activation over CDP. No debugger
  logpoint, private-scope inspection, or temporary listener wrapper was
  active during that reproduction.
- Main recovered SteamUI again using `ssh steamdeck steam -shutdown`.
  Global Automatic is restored, the original per-game choice is restored,
  and the native shortcut count is 18. No game was launched in these tests.

## Required changes

### R1 — Make the in-place reload lifetime safe

Reproduce this exact sequence on the installed code:

1. From a freshly restarted SteamUI, open matched shortcut 2312439508 and
   activate Game Info with the committed label probe.
2. Set global Automatic and confirm rich Game Info with PLAYABLE.
3. In SharedJSContext, use Loader's existing API without navigation:

   ```text
   const loader = window.DeckyPluginLoader;
   const plugin = loader.plugins.find(p => p.name === "Decky Metadata");
   await loader.importPlugin(plugin.name, plugin.version, plugin.loadType);
   ```

4. Game Info remains selected and initially recovers its description and
   PLAYABLE category. Main also observed its quick-link row disappear
   during this reload; record and resolve retained-wrapper effects rather
   than treating them as a successful reload.
5. Open QAM on the real main window, open Decky Metadata, and select global
   Verified through the visible native dropdown.
6. SteamUI becomes unresponsive. `cdp.py eval` requests no longer return;
   even `Page.enable`/the normal reload command time out. SSH and the
   debugger's HTTP `/json` target listing still work.

This occurred again in the CDP-only isolated run. It is not merely a stale
Puppeteer handle or a debugger-attach wait. The failure occurred while
waiting for the QAM combobox to show the confirmed Verified value, after
the actual option selection.

Investigate retained render wrappers, lifecycle patches, subscriptions,
and frame dispatch across unload/reimport. In particular, inspect how
cached/mutated React element types and wrapper caches are handled by
`installNonSteamQuickLinkPolicy` across reload and repeated render.
That is a diagnostic lead, not permission to guess the cause.

Do not fix this by disabling reload, requiring a restart after every
setting change, extending render TTLs, hiding missing links, or skipping
the final request. Preserve cold-start behavior, native filter
invalidation, per-game exceptions, and 64-bit launch truth.

Add a meaningful regression for the actual lifetime/wrapper failure found.
Do not add callback-count assertions or literal unchanged “rich” objects
that bypass the failing behavior.

### Exclusive device ownership and verification

The implementer owns the Deck for this focused round after Main releases
its handles/tunnel. Full validation authorization remains current.
Use `CDP_PORT=18088` and `DECKY_DECK_HOST=steamdeck`.
Frontend-only deploy iterations are allowed because backend files already
match the candidate. Use the committed tooling and actual visible controls.

For recovery, the runbook explicitly specifies:
`ssh steamdeck steam -shutdown`; Gaming Mode restarts Steam automatically.
Do not kill arbitrary PIDs. Avoid debugger instrumentation during the
acceptance run so it cannot contaminate the result.

After fixing the cause, pass TWO consecutive plugin-reload/global-change
cycles in the same SteamUI session. Game Info content, compatibility,
quick links, and selected tab must remain correct; basic CDP evaluation
and controller interaction must remain responsive. Then run the required
local gate and relevant full/no-launch device checks with explicit safe
launch fixture 2312439508.

Restore global Automatic and unchanged per-game values, do not create
fixtures or modify unrelated plugins/settings, close the dedicated tunnel,
record actual evidence and the full ZIP version, commit, mark the round
complete, and exit. Do not merge or rewrite history.

The matched-games-only toggle remains queued separately. Do not expand
this correction into that feature. Main will fold the validated fixes
back into the organized commit history before integration.

STATUS: CHANGES_REQUESTED
