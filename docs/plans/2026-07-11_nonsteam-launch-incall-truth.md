# Plan: Fix Non-Steam Launch Regression via In-Call Truth Precedence (nonsteam-launch-incall-truth)

## Context

**User-visible problem.** With the plugin installed (and the Steam patches live
after `cold-boot-patch-install`), **matched** non-Steam games fail to launch:
pressing Play does nothing. Unmatched shortcuts (no metadata cache) launch fine.
Uninstalling the plugin restores launches. Release-blocking; `dev → main` held.
Research: `docs/research/2026-07-11_nonsteam-launch-regression.md`.

**Root cause (on-device trace, 2026-07-11, CDP).** Steam's Play handler derives
the launch gameid from `overview.gameid` → `GetGameID()`, which **internally
calls `BIsModOrShortcut`**. The plugin patches `GetGameID`/`GetPrimaryAppID`
(`src/steam/metadataPatch.ts:506-516`) to set `bypassCounter = -1` in-call so
that internal check sees the truth. But in the `BIsModOrShortcut` afterPatch,
`consumeRouteShield` and the `/library/home` special case short-circuit
**before** the `bypassCounter === -1` check. The render shield is armed on every
route render of a matched game's detail page (`src/steam/routerPatches.ts:80`,
plus the history `listen` armer), so it is effectively always live while the
user is on the page. Result: `GetGameID`'s internal check returns the spoofed
`false` → `GetGameID` returns a **plain-appid gameid** → `RunGame("3276984150",
…)` → the client silently drops the launch (no GameAction is ever created).

Verified side-by-side on device (Transformers Fall of Cybertron, matched):

- Play during shield: `RunGame("3276984150", "", -1, 100)` → nothing launches.
- Play after shield TTL lapse: `RunGame("14074539753793912832", …)` → launches.
- Ludusavi (unmatched, shield never arms): always launches.
- Plugin logs from the user's sessions show **150** `reason='render-shield'`
  decisions with `bypassCounterBefore='-1'` — real hijacked in-call truths.

**Fix.** In the `BIsModOrShortcut` afterPatch, honor the in-call truth window
(`bypassCounter === -1`) **before** consuming the route shield and before the
`/library/home` special case. Do not consume a shield hit on that path (shield
hits are budget for genuine render checks). Direct render-time checks
(`GetSections`, home rows, etc.) never run inside `GetGameID`/`GetPrimaryAppID`,
so the spoof — and the rich Game Info page — is unaffected.

**Slug used throughout this plan:** `nonsteam-launch-incall-truth`

## Changes

- `src/steam/metadataPatch.ts` — reorder the afterPatch: early-return `ret`
  (truth) when `metadataState.bypassCounter === -1`, traced with new reason
  `in-call-truth`; move `consumeRouteShield` after the early-returns so
  not-nonsteam / not-shortcut / in-call calls no longer consume shield budget;
  simplify `shouldBypass` to `bypassCounter > 0` (the `-1` case returns above).
- `dist/index.js`(+map) — rebuilt committed artifact.

## Validation Strategy

1. `./scripts/orchestration-hooks/quality-gates` (tsc, rollup build,
   py_compile, pytest).
2. On-device (CDP, tracer wrapping `SteamClient.Apps.RunGame`):
   - Play press on matched game **inside** the shield window must call
     `RunGame` with the 64-bit shortcut gameid and the game must start.
   - Play press **after** idling >2 s on the page must also launch.
   - Game Info page must still render rich (quick links present) for matched
     games — the render spoof must survive the reorder.
   - Unmatched shortcut (Ludusavi) still launches.
