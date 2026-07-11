# Research: Non-Steam games fail to launch while the plugin is installed

**Status:** OPEN — **release-blocking, top priority.** Hard hold on `dev → main`
until fixed. Distinct from (but same root fragility as) the matched-game
quick-links idle-decay — see `[[quicklinks-idle-decay-open]]` /
`docs/research/2026-07-10_matched-game-quicklinks-idle-decay.md`.

**Date opened:** 2026-07-11. Diagnosed from device logs + user report.

---

## Symptom

With the plugin **installed**, non-Steam library games (shortcuts) **fail to
start** when the user presses Play. **Uninstalling the plugin** makes them launch
normally. Reported across several games.

## Why it appears now

The already-merged `cold-boot-patch-install` fix made the Steam patches actually
run again (they were dead in prior sessions due to the install-recursion crash).
Before that fix, `BIsModOrShortcut` was native → launches worked. Now that the
spoof is live, it breaks launches. So this is a **consequence of the patches
being active**, not a change in the launch code itself.

---

## Root cause (high confidence)

The `BIsModOrShortcut` afterPatch (`src/steam/metadataPatch.ts:447-491`) returns
**`false` ("not a shortcut") by default** for a cached non-Steam app. Return
logic:

```ts
if (shieldHit) return false;                 // render-shield: spoof ON (quick links)   (line ~470)
if (path === "/library/home") return false;  // spoof ON
if (bypassCounter > 0) bypassCounter -= 1;
const shouldBypass = bypassCounter === -1 || bypassCounter > 0;   // line 483
return shouldBypass;   // truth-window -> true (TRUTH); normal-shortcut -> FALSE (spoof)  (line 490)
```

- `truth-window` (returns `true`, the truth) only when `bypassCounter` is `-1`
  (set in-call by `GetGameID`/`GetPrimaryAppID`, `:506-513`) or `>0` (armed to `4`
  by `GetPerClientData` `:530-536` or `BHasRecentlyLaunched` `:495-503`).
- `normal-shortcut` (the default, `bypassCounter === 0`) returns **`false`** =
  spoof ON.

Steam's **launch path checks `BIsModOrShortcut`** to decide whether to run the
shortcut's executable vs. launch a real Steam app. When that check hits the
`normal-shortcut` default and gets `false`, Steam treats the shortcut appid as a
real Steam app, finds nothing to run, and the game never starts.

### Log evidence (all rotations, device)

- `BIsModOrShortcut` reason distribution for non-Steam apps:
  - `normal-shortcut` (spoof `false`): **15,034**
  - `truth-window` (truth `true`): **2,839**
  - `render-shield` (spoof `false`): 432
  So ~84% of non-Steam `BIsModOrShortcut` checks return the spoofed `false`.
- **`BHasRecentlyLaunched` appears 0 times in every log.** The launch-intended
  truth-window armer **never fires** — either the method doesn't exist on this
  Steam build (so the `if (detailsProto?.BHasRecentlyLaunched)` patch at `:495`
  was skipped) or Steam doesn't call it at launch. The only armer that ever fires
  is `GetPerClientData` (340×) — timing luck, not launch-correlated.
- User: uninstall → launches work (definitive that the plugin/spoof is the cause).

---

## The core tension (why this is architectural, not a tweak)

**Play is pressed while the user is on the game detail page.** So both:
- *rendering the page* (needs `BIsModOrShortcut === false` to make Steam draw the
  rich Game Info + quick links), and
- *launching* (needs `BIsModOrShortcut === true` so Steam runs the shortcut exe)

happen on the **same route** (`/library/app/<appid>`). Route/context alone cannot
distinguish them — the only reliable discriminator is the **caller** (Steam's
render code vs. Steam's launch code). The current design tries to detect the
launch caller via `GetPerClientData`/`BHasRecentlyLaunched` arming a short
truth-window, but `BHasRecentlyLaunched` is dead and `GetPerClientData` timing is
unreliable, so launches routinely see the `normal-shortcut` spoof.

The current default is **spoof-on (favor quick links), truth only in fragile
windows** — which is backwards from launch-safe. And note: the spoof-on default
doesn't even reliably keep the quick links (they decay while idle for *other*
reasons — see the idle-decay research), so defaulting to spoof-on costs launch
safety while barely buying link persistence.

---

## Fix directions to evaluate (not yet decided)

1. **Flip the default to truth.** Return the native `ret` (`true`) by default and
   spoof (`false`) **only** inside a reliably-maintained render context (the
   route-shield, kept armed for as long as the game-detail route is the current
   route — not just a 2000ms TTL). Launches (and any check outside active render)
   then get the truth. Risk: if the render context isn't kept alive, the rich page
   reverts to a bare shortcut after the shield lapses. Requires a robust
   "is-the-detail-page-currently-rendering" signal that survives idle.
2. **Arm a truth-window off a real launch hook.** Trace what Steam actually calls
   on a Play-press (below) and patch that method to arm `bypassCounter` so the
   launch check reliably sees the truth. Keeps the current spoof-on default. Risk:
   depends on finding a stable launch method; brittle across Steam updates.
3. **Caller-aware spoof.** Distinguish render vs. launch by inspecting the call
   stack / a Steam context flag at the `BIsModOrShortcut` call site. Most precise,
   hardest to make robust.

Any fix MUST be verified with the launch regression AND the quick-links UI
(don't fix launch by killing the Game Info page). Re-run the quick-links + launch
<2s/>2s checks together.

---

## Concrete next steps

1. **Trace the Play-press** (CDP). With debug logging on, patch/log the candidate
   launch entry points and see which fire, in what order, relative to the
   `BIsModOrShortcut` check for the target appid. Candidates to instrument on
   `SteamClient.Apps` (and friends): `RunGame`, `StartApp`/`StartGame`,
   `BLaunchApp`, `LaunchApp`, `ContinueGameAction`, `RunGameAndWaitForExitCode`,
   plus the play-button handler on the app-overview. Goal: find a method that
   fires **immediately before** the launch's `BIsModOrShortcut` check → use it as
   the reliable truth-window armer (fix direction 2), or confirm no such hook
   exists (pushing toward fix direction 1).
2. **Confirm whether the `BHasRecentlyLaunched` patch even installed** — over CDP,
   check `String(appDetailsStore.<detailsProto>.BHasRecentlyLaunched)` (is it the
   native fn or absent?). If the method is gone in this Steam build, the launch
   armer was never functional and must be replaced.
3. **Prototype fix direction 1** on-device: temporarily make the afterPatch return
   the truth by default and only `false` when the route-shield is live; measure
   (a) do launches work, (b) does the Game Info page stay rendered while viewing.
4. Decide fix + write an orchestration plan. This likely also informs / merges
   with the idle-decay work, since both stem from the spoof-timing design.

---

## Code map

- `src/steam/metadataPatch.ts`
  - `447-491` — `BIsModOrShortcut` afterPatch (the return logic above).
  - `495-503` — `BHasRecentlyLaunched` patch, arms `bypassCounter = 4` (NEVER
    fires per logs).
  - `506-513` — `GetGameID`/`GetPrimaryAppID`: set `bypassCounter = -1` during the
    original call, then back to `0`.
  - `530-536` — `GetPerClientData` patch, arms `bypassCounter = 4`.
- `metadataState.bypassCounter` / `metadataState.routeShield` in `src/steam/core.ts`.
- Route shield arming: `src/steam/routerPatches.ts` (`armRouteShield`,
  `ROUTE_SHIELD_TTL_MS = 2000`, `ROUTE_SHIELD_MAX_HITS = 64`).

(Line numbers are as of dev `~4165a75`, 2026-07-11 — re-grep before editing;
`gameinfo-focus-reset` shifted nearby code.)

## CDP how-to

See `[[deck-cdp-debug-loop]]` and the embedded `cdp_eval.py` in
`docs/research/2026-07-10_matched-game-quicklinks-idle-decay.md`. Enable plugin
debug logging so `BIsModOrShortcut decision` / `bypass armed` traces land in
`~/homebrew/logs/Decky-Metadata/decky-metadata.log`. Tunnel:
`ssh -f -N -L 18081:localhost:8080 steamdeck`; eval against `SharedJSContext`
(stores) or `"Steam Big Picture Mode"` (DOM/fibers).
