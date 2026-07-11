# Plan: Fix Cold-Boot Steam Patch Installation Death (cold-boot-patch-install)

## Context

**User-visible problem.** After a cold Steam boot on the Deck, every Steam-side
patch of this plugin (metadata spoofing, Game Info quick links, route shield,
navigation rewrites) is silently dead for the whole session, while the plugin
still appears loaded in the QAM. Live CDP inspection on-device (2026-07-10,
session started 2026-07-08 23:46) confirmed `BIsModOrShortcut`,
`GetDescriptions`, and `m_history.goBack` were all native/unpatched, while the
activity-store patch (installed earlier in the sequence) was present. This is
why both open UI bug reports (delisted Market button, disappearing quick-link
buttons) currently reproduce as "the plugin does nothing".

**Root cause (diagnosed, code-pinned).** `installSteamPatches`
(`src/steam/install.ts:30-109`) computes `overviewProto` from
`appStore?.allApps?.[0]?.__proto__` and enters a retry branch (lines 49-67) when
it is missing. The retry gate is `hasSteamInternals()` (`src/steam/core.ts:19`),
which only checks that the `SteamClient` / `appStore` / `appDetailsStore`
globals exist — **not** that `appStore.allApps` is populated. On a cold boot the
globals exist while the library is still empty, so `retry()` sees
`hasSteamInternals() === true` and synchronously calls `installSteamPatches()`
again, which re-enters the same branch and recurses **infinitely within a single
tick** until the stack overflows. The `RangeError` propagates to the caller in
`src/index.tsx:24-27`, whose catch only does `log.warn` → `console.warn`
(`src/log.ts:17-18`), so nothing reaches the backend file log. Every recursion
level also re-runs the pre-check installers (`install.ts:41-45`) before
recursing. Mid-session (re)installs work because `allApps` is already populated,
which is why the bug looks like "works right after installing, broken after
reboot".

**Intended outcome.** Patch installation must succeed on cold boot: wait
(bounded, async, non-recursive) until Steam internals *and* the app/detail
prototypes are available, install exactly once, and log success/failure to the
backend file log so a dead-patch session is visible in
`~/homebrew/logs/Decky-Metadata/decky-metadata.log`.

**Relevant files:** `src/steam/install.ts`, `src/steam/core.ts`,
`src/index.tsx`, `src/log.ts` (read-only reference), `src/backend.ts`
(`frontendLog`, read-only reference), `dist/index.js` + `dist/index.js.map`
(committed build artifacts).

**Slug used throughout this plan:** `cold-boot-patch-install`

---

## Orchestration Contract

**Slug:** `cold-boot-patch-install`

**Plan file:**

```text
docs/plans/2026-07-10_cold-boot-patch-install.md
```

**Implementation branch:**

```text
feat/cold-boot-patch-install
```

**Round-complete marker:**

```text
/tmp/Decky-Metadata/cold-boot-patch-install_finished
```

**Finalized marker:**

```text
/tmp/Decky-Metadata/cold-boot-patch-install_finalized
```

**Review notes:**

```text
docs/review/cold-boot-patch-install-review-*.md
```

Each review note ends with exactly one status trailer:

```text
STATUS: CHANGES_REQUESTED
```

or:

```text
STATUS: APPROVED
```

---

## Required Agent Protocol

1. Use the **implementer** skill.
2. Work from the repository root.
3. Branch from `dev`.
4. Commit this plan as the first commit on the implementation branch.
5. Follow TDD where behavior changes are testable.
6. Run quality gates before marking any round complete.
7. Do not write your own review.
8. Do not create files under `docs/review/`.
9. Do not delete files under `docs/review/`.
10. Review notes are durable audit records and must be committed.
11. Resolving a review note means:
    - implement the requested changes;
    - run quality gates;
    - commit the code/docs changes;
    - commit the review note itself if it is not already committed;
    - recreate the round-complete marker.
12. After finalization, stop polling and exit cleanly.

---

## Scope discipline

- Implement only the units the plan lists. Do not modify files outside the plan's scope.
- Do not change runtime behavior beyond what the plan specifies. A `refactor` or
  `cleanup` commit must preserve observable behavior.
- Never edit a test's expected value to make a behavior change pass. If a test
  legitimately must change, that change must be required by the plan or a review
  note, and you must record the rationale in the session log.
- If you spot an unrelated improvement, do not make it here — note it in the
  session log for a separate plan.

---

## Setup

Start from `dev`:

```bash
git checkout dev
# ORCH_LOCAL_ONLY: local trial branch, skipping origin pull
git checkout -b feat/cold-boot-patch-install
```

Commit this plan first:

```bash
git add docs/plans/2026-07-10_cold-boot-patch-install.md
git commit -m "docs(plan): add cold-boot-patch-install implementation plan"
```

---

## Implementation Tasks

Frontend-only (TypeScript). There is no JS unit-test runner in this repo — the
quality gate is `tsc --noEmit` + rollup build + Python `py_compile`/`pytest`.
Do **not** add a JS test framework. Every change must keep the plugin invariant:
never throw into Steam's call path — wrap new logic in try/catch like the
surrounding code.

### Task 1 — readiness predicate (`src/steam/core.ts`)

Add an exported `steamPatchTargetsReady()` next to `hasSteamInternals()`
(`core.ts:19`) that returns true only when ALL of the following hold, inside a
try/catch returning false on any throw:

1. `hasSteamInternals()` is true;
2. `appStore?.allApps?.[0]?.__proto__` is truthy;
3. `appDetailsStore?.__proto__` is truthy.

Do not change `hasSteamInternals()` itself — other call sites
(`hasActivityStore`, activity installers) rely on its current meaning.

### Task 2 — non-recursive bounded install retry (`src/steam/install.ts`)

Rework `installSteamPatches` (lines 30-109) so that:

1. The function never calls itself, directly or indirectly. Replace the retry
   branch (lines 49-67) with a single flat poller: if
   `steamPatchTargetsReady()` is false, schedule `window.setTimeout(tick, 500)`
   where `tick` re-checks the predicate and, when it becomes true, runs the
   install body **once**. Bound the poll at 240 attempts (~2 minutes); on
   exhaustion, log a warning (see Task 3) and give up for the session.
2. The install body (everything from line 46 through line 95 today, i.e. proto
   resolution and all installer calls) runs only after the readiness predicate
   passes — move the pre-check installers currently at lines 41-45
   (`installUnmatchedAppLinksHider`, `installNativeActivityStorePatch`,
   `installNativePartnerEventStorePatch`, `installActivityRefreshedListener`)
   behind the same gate so no installer can run more than once per session.
   `configureActivityMetadataLoader(ensureMetadataCache)` (line 31) is
   idempotent configuration and may stay where it is.
3. The returned `Unpatch` must cancel a pending poll timer and run all
   registered unpatchers exactly as today (lines 97-108), regardless of whether
   install completed, is still polling, or gave up.
4. Preserve the existing `safeInstallStep` per-step isolation and the
   `getDebugLogging()` trace wiring (lines 71-83) unchanged in behavior.

### Task 3 — make install failures visible in the backend file log

1. In `src/steam/install.ts`, after the install body completes, emit one
   info-level line through the backend logger (`frontendLog` from
   `../backend`, fire-and-forget with `.catch(() => undefined)` like existing
   call sites): `"steam patches installed"` with `{ attempts, unpatcherCount }`.
2. On poll exhaustion (Task 2.1), emit `"steam patches NOT installed"` with
   `{ attempts }` at warn level via the same channel.
3. In `src/index.tsx:24-27`, extend the existing catch so that in addition to
   `log.warn`, it sends `frontendLog("warn", "installSteamPatches failed", ...)`
   (fire-and-forget, wrapped so a backend failure cannot throw). Do not remove
   the console path.
4. Keep these lines unconditional (not debug-gated): they fire at most once per
   session and are the only signal that distinguishes a dead-patch session from
   a healthy one in `~/homebrew/logs/Decky-Metadata/decky-metadata.log`.

### Task 4 — rebuild dist and commit

```bash
./run.sh npm run build
git add dist/ src/
git status --short   # must be clean after the commit
```

### Task 5 — session log

Record a session summary at
`docs/agent_conversations/2026-07-10_cold-boot-patch-install.md` per
`AGENTS.md`, covering: the recursion mechanism, why the failure was invisible
(console-only warn), the new readiness predicate, and the deferred on-device
verification below.

### Scope discipline (exact allowed change list)

May change:

- `src/steam/core.ts` — add `steamPatchTargetsReady()` only.
- `src/steam/install.ts` — Tasks 2 and 3 only.
- `src/index.tsx` — Task 3.3 only.
- `dist/index.js`, `dist/index.js.map` — rebuild output.
- `docs/plans/2026-07-10_cold-boot-patch-install.md` (first commit),
  `docs/agent_conversations/` session log, committed review notes.

Must NOT change: `src/steam/metadataPatch.ts`, `src/steam/routerPatches.ts`,
`src/steam/navigationRedirect.ts`, `src/steam/activity.ts`,
`src/steam/appLinks.ts`, `src/contextMenuPatch.tsx`, `main.py`, `backend/`,
`tests/`, `package.json` dependencies. No new npm packages, no JS test
framework, no behavior changes to any installed patch itself.

---

## Quality Gates

Run before marking any round complete:

```bash
scripts/orchestration/run-quality-gates
scripts/orchestration/check-review-notes-not-deleted
git status --short
```

The round is not complete unless:

1. all requested implementation work is done;
2. all relevant tests pass;
3. build/typecheck gates pass;
4. review notes have not been deleted;
5. the working tree is clean;
6. all code/docs changes are committed.

---

## Verification

Automated (runs in quality gates): `npx tsc --noEmit`, `npm run build`,
`py_compile`, `pytest -q`. These prove type/build integrity only — the cold-boot
race is not covered by automated tests (no JS test runner in this repo).

Source-inspection checks the reviewer must be able to confirm from the diff:

1. No code path in `src/steam/install.ts` calls `installSteamPatches` from
   inside itself (the recursion is structurally impossible, not just guarded).
2. All installers run only after `steamPatchTargetsReady()` passes, and at most
   once per session.
3. The poll is bounded and its timer is cancelled by the returned unpatcher.

**Deferred on-device verification (required before dev→main; performed by the
human/orchestrator on the Steam Deck, not by the implementer):**

1. Install the built plugin on the Deck, then fully restart Steam (or reboot
   the Deck) so the plugin loads during a cold boot with an empty library
   store.
2. Confirm the file log (`~/homebrew/logs/Decky-Metadata/decky-metadata.log`)
   contains one `steam patches installed` line for the new session.
3. Over CDP (`ssh steamdeck` + CEF on `:8080`, SharedJSContext target), confirm
   `String(appStore.allApps[0].__proto__.BIsModOrShortcut)` shows the patched
   wrapper (not the native
   `BIsModOrShortcut(){return this.third_party_mod||...}` source), and the
   main-window `m_history.goBack` is wrapped.
4. Open a matched non-Steam game page: metadata (description, developers)
   must render, proving `GetDescriptions` is patched in the same session.
5. Repeat the cold boot once more to confirm the result is stable across
   boots, not timing luck.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished cold-boot-patch-install
```

This writes:

```text
/tmp/Decky-Metadata/cold-boot-patch-install_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer cold-boot-patch-install`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/cold-boot-patch-install-review-*.md
```

When a review note exists or a new review note appears:

1. Read the full review note.
2. If the note ends with:

   ```text
   STATUS: CHANGES_REQUESTED
   ```

   then resume work.

3. Clear the round-complete marker:

   ```bash
   scripts/orchestration/clear-finished cold-boot-patch-install
   ```

4. Address every requested change.
5. Run quality gates:

   ```bash
   scripts/orchestration/run-quality-gates
   scripts/orchestration/check-review-notes-not-deleted
   ```

6. Commit code/docs fixes.
7. Commit the review-note file itself if it is not already committed:

   ```bash
   git add docs/review/cold-boot-patch-install-review-*.md
   git commit -m "docs(review): record cold-boot-patch-install review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished cold-boot-patch-install
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer cold-boot-patch-install` after the next review note is created.

---

## Approval Handling

If the latest review note ends with:

```text
STATUS: APPROVED
```

then:

1. Confirm every previous review item has been addressed.
2. Confirm all review notes are committed:

   ```bash
   scripts/orchestration/check-review-notes-committed cold-boot-patch-install
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize cold-boot-patch-install
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Decky-Metadata/cold-boot-patch-install_finalized
   ```

6. Stop polling and exit cleanly.

---

## Review Rules

Do not write your own review.

Do not create files under:

```text
docs/review/
```

Do not delete files under:

```text
docs/review/
```

Only the orchestrator writes review notes. Your job is to read them, resolve them, commit them as audit records, and continue the loop.

---

## Finalization Rules

Only finalize after a review note with:

```text
STATUS: APPROVED
```

Finalization is performed with:

```bash
scripts/orchestration/finalize cold-boot-patch-install
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Decky-Metadata/cold-boot-patch-install_finished
/tmp/Decky-Metadata/cold-boot-patch-install_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
