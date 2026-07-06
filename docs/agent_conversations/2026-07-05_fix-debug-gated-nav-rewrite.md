# 2026-07-05 Fix Debug-Gated Nav Rewrite

## Objective

Implement `docs/plans/2026-07-05_fix-debug-gated-nav-rewrite.md`.

## Source

Thermo-nuclear review (`docs/reviews/2026-07-05_thermo-nuclear-fable.md`), BLOCKER 2: the
functional `window.history.pushState`/`replaceState` steamweb URL rewrite lived exclusively in
`installNavigationTrace` (`src/steam/diagnostics.ts`), which `install.ts` only installs when
`getDebugLogging()` resolves true. For the debug-off majority, a `store.steampowered.com/app/<id>`
link opened through `window.history` was never rewritten to the matched Steam appid.

## Task 1 — Unconditional `window.history` steamweb rewrite

`src/steam/activity.ts`, `installNativeNewsHistoryRedirects`: added the steamweb rewrite to the
existing unconditional `window.history.pushState`/`replaceState` wrapper, after the news
push→replace/back branches and before the final `return original.apply(this, args as any);`.
Reused the already-computed `target` string (no re-derivation), guarded with its own
`try { … } catch (_error) {}` matching the file's existing defensive style, and called
`rewriteSteamwebNavState(args[0])` — forwarding the rewritten state via
`original.apply(this, [newState, args[1], args[2]] as any)` only when `rewrote` is true. Added the
sibling `rewriteSteamwebNavState` import from `./core` next to the existing
`rewriteSteamLinkToMatchedApp` import. News push/replace/back branches untouched.

## Task 2 — `installNavigationTrace` made observation-only

`src/steam/diagnostics.ts`: removed the `rewriteSteamwebNavState(args[0])` call and the early
`return original.apply(this, [newState, args[1], args[2]] as any);` from the `steamweb` branch of
the history trace wrapper. Kept both `frontendLog("trace", "history", …)` and
`frontendLog("trace", "history-state", …)` calls; the wrapper now always falls through to the
unmodified `return original.apply(this, args);` at the end. Removed the now-unused
`rewriteSteamwebNavState` import (`grep -n rewriteSteamwebNavState src/steam/diagnostics.ts` — zero
matches post-edit besides the removed import line, confirmed before deleting it).

## Task 3 — Router `m_history` steamweb rewrite: kept both owners (not de-duplicated)

**Verification step, per plan requirement.** The plan's default expectation was to remove the
`activity.ts:1107-1118` copy and leave `navigationRedirect.ts` as sole owner, *unless* runtime
verification showed the two wrappers could target different history objects. No live Steam client
was available in this session, so verification relied on this repo's own prior on-device diagnostic
record rather than a fresh live probe:

- `docs/plans/2026-06-30_redirect-mainwindow-history.md` records an on-device trace showing the
  native app-detail-page Store/Community/Discussions/Guides buttons push through
  `SteamUIStore.m_WindowStore.MainWindowInstance.m_history` — and explicitly that
  `Router.WindowStore.GamepadUIMainWindowInstance.m_history` (the prior `redirect-router-history`
  attempt's target) **"never fired"** for that navigation.
- `navigationRedirect.ts:132-133` resolves
  `SteamUIStore.m_WindowStore.MainWindowInstance.m_history ?? Router.WindowStore.GamepadUIMainWindowInstance.m_history`
  — the `??` fallback exists precisely because the two are not guaranteed to be the same object;
  it was added after the plain-Router attempt failed to fire.
- `activity.ts`'s `installNativeNewsHistoryRedirects` resolves the Router path directly (no
  fallback) because that function's primary purpose (decky-native-news push→replace/back
  interception) is anchored to that specific instance.

Given documented evidence that these two paths can resolve to different live objects (and that a
Router-only patch previously failed to observe app-detail-button steamweb navigation at all), removing
the `activity.ts` copy risked silently dropping rewrite coverage for whatever navigation flow does
route through the Router instance carrying a `steamweb` path/`state.url` payload. Per the plan's
explicit fallback ("leave both, they are idempotent, record the finding"): **both copies were kept
unchanged.** `rewriteSteamLinkToMatchedApp` is idempotent (a second pass over an already-rewritten
appid returns `rewrote: false`), so double-application where the objects do coincide is a no-op.

Scope-gate note: the plan's grep gate for this task
(`grep -cn "rewriteSteamLinkToMatchedApp(state.url)" src/steam/activity.ts`) returns `1`, not the
default-expectation `0` — this is the plan-sanctioned "justified in session log" branch, not a
deviation.

## Task 4 — Rebuild

`./run.sh npm run build` — succeeded; `dist/index.js` + `dist/index.js.map` rebuilt and staged.

## Deferred (out of scope, per plan)

The larger `activity.ts` decomposition (1,283 lines; splitting event-construction from
history/store patching) — explicitly deferred to its own plan by this plan's scope note. Not
attempted here.

## Validation Results

- `./run.sh npx tsc --noEmit` — clean.
- `./run.sh npm run build` — succeeded.
- Grep/scope gates re-run post-edit:
  - `rewriteSteamwebNavState` present (imported + used) in `src/steam/activity.ts`.
  - `rewriteSteamwebNavState` — zero matches in `src/steam/diagnostics.ts`.
  - `return original.apply(this, [newState` — zero matches in `src/steam/diagnostics.ts`.
  - `frontendLog("trace", "history"` — still present in `src/steam/diagnostics.ts` (tracing kept).
  - `steamweb` — present in `src/steam/navigationRedirect.ts` (canonical rewrite).
  - `rewriteSteamLinkToMatchedApp(state.url)` count in `src/steam/activity.ts` — `1` (kept,
    justified above).
  - `debugLoggingEnabled` in `src/steam/install.ts` — gates only `navigationTrace`,
    `historyInstanceTrace`, `clickTrace`; `installNativeNewsHistoryRedirects` and
    `installMainWindowHistoryRedirect` remain unconditional.
- Diff scope: `src/steam/activity.ts`, `src/steam/diagnostics.ts`, `dist/index.js`,
  `dist/index.js.map`, `docs/agent_conversations/2026-07-05_fix-debug-gated-nav-rewrite.md` —
  matches the plan's "Relevant files" list (`navigationRedirect.ts` unchanged, as anticipated for
  the "keep both" branch).

## Deferred verification — on-device (not performed in this session)

Sideload with debug logging OFF, open a matched non-Steam game, trigger a store/community link
through `window.history`, and confirm it opens the matched Steam appid's page. Toggle debug logging
on and confirm navigation is unchanged and traces still log. Requires a physical/emulated Steam Deck
target; not available in this session.
