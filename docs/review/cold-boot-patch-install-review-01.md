# Review — cold-boot-patch-install (round 01)

Branch: `feat/cold-boot-patch-install`
Reviewed against: `docs/plans/2026-07-10_cold-boot-patch-install.md`
HEAD reviewed: `99080ec`

## Verdict

Core fix (Tasks 1–2) is correct, complete, and to spec. One in-scope
correctness issue in the Task 3 instrumentation must be fixed, and one
plan-level limitation must be recorded honestly. CHANGES_REQUESTED.

## What is correct (no change needed)

- **Task 1** — `steamPatchTargetsReady()` added in `core.ts` next to
  `hasSteamInternals()`: checks `hasSteamInternals()` + `allApps[0].__proto__`
  + `appDetailsStore.__proto__`, wrapped in try/catch returning false on throw.
  `hasSteamInternals()` itself is unchanged. Correct.
- **Task 2** — recursion is structurally eliminated: `installSteamPatches` no
  longer calls itself. The retry branch is replaced by a flat `tick` poller
  (`window.setTimeout(tick, 500)`), bounded at 240 attempts, that runs the
  `install()` body exactly once (guarded by `installStarted` + `patchesCancelled`).
  All pre-check installers (`unmatchedAppLinksHider`, `nativeActivityStorePatch`,
  `nativePartnerEventStorePatch`, `activityRefreshedListener`) are moved behind
  the readiness gate; `configureActivityMetadataLoader` correctly stays as
  idempotent top-level config. `safeInstallStep` isolation and the
  `getDebugLogging()` trace wiring are preserved unchanged. The returned
  `Unpatch` clears a pending `retryId` and runs all unpatchers. Correct.
- **Tasks 4–5** — `dist/index.js` + `.map` rebuilt (new log strings present in
  bundle), session log at
  `docs/agent_conversations/2026-07-10_cold-boot-patch-install.md` present.
  `tsc --noEmit` passes.

## Required changes

### 1. `frontendLog` first argument must be an `area` tag, not a pseudo-level

`frontendLog`'s first parameter is `area: string` (`src/backend.ts:34-37`), a
category label — every existing call site passes a semantic category
(`"nav"`, `"trace"`, `"community"`, `"applinks"`, `"shortcuts"`, …). The new
calls pass `"info"` / `"warn"` there, which was taken verbatim from this plan's
Task 3 text but is wrong against the codebase API: the backend renders that
value in the log's category column, so lines will read `[info] steam patches
installed` where `info` masquerades as a level while actually displacing the
real category. For instrumentation whose entire purpose is a trustworthy
diagnostic signal, this is misleading.

Change the first argument to a real area tag — use `"patch"` — at all four new
call sites:

- `src/steam/install.ts` — `"steam patches installed"` (info intent)
- `src/steam/install.ts` — `"installSteamPatches failed"` (tick catch)
- `src/steam/install.ts` — `"steam patches NOT installed"` (poll exhaustion)
- `src/index.tsx` — `"installSteamPatches failed"` (top-level catch)

Severity is already unambiguous from the message text ("NOT installed",
"failed"), so no level needs to be encoded; if you want it explicit, add
`level: "warn"` inside the `fields` object rather than in the `area` slot. Do
not otherwise change the message strings, the `fields` payloads, or the
fire-and-forget `.catch(() => undefined)` pattern.

Rebuild `dist/` after the change and re-run the quality gates.

## Known limitation to record (no code change — out of scope)

`backend.frontend_log` emits every line at `logging.DEBUG` (`main.py:375`), and
`decky.logger` runs at `INFO` whenever debug logging is disabled
(`main.py:321/334` — the default on-device state). Therefore the new
`steam patches installed` / `steam patches NOT installed` lines only reach
`~/homebrew/logs/Decky-Metadata/decky-metadata.log` when **debug logging is
enabled**. This means Task 3.4's aim ("the only signal that distinguishes a
dead-patch session from a healthy one" in the default config) is not fully met,
and it cannot be fixed inside this plan's scope (which forbids `main.py`
changes) — the only frontend→file logging channel available is the fixed-DEBUG
`frontend_log` callable.

Record this in the session log as a known limitation, and note the follow-up:
a separate plan should add an INFO-capable backend logging channel (or make
`frontend_log` honor a level argument) so cold-boot patch status is visible
without enabling debug logging. Do NOT change `main.py`/`backend/` in this
plan.

Consequence for the deferred on-device verification: step 2 ("confirm the file
log contains one `steam patches installed` line") must be performed with debug
logging enabled on the Deck; otherwise the absence of the line is expected and
does not indicate failure. This caveat will be carried into the human handoff.

## Gate status

- `npx tsc --noEmit`: pass (re-run after the fix).
- `npm run build`: dist rebuilt; re-run after the fix.
- `py_compile` / `pytest`: no Python touched by this plan; re-run gates to
  confirm green before re-marking the round.

STATUS: CHANGES_REQUESTED
