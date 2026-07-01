# Plan: Fail-safe wrappers so Steam UI changes cannot crash via patches (harden-steam-patches)

## Context

The plugin patches many Steam client internals (method interception via the local
`patchMethod` helper and `@decky/ui`'s `afterPatch`). Today the realistic failure mode on a
Steam frontend update is graceful (resolvers return empty → features no-op; installs are gated
on the target existing; the history redirect already falls through to the original). But there
is a residual **crash** vector: a patch **callback** that throws is not universally caught, and
since these callbacks run inside Steam's own call path (e.g. `BIsModOrShortcut`,
`GetPerClientData`, route `renderFunc`), a throw could propagate into Steam's code and break a
render/navigation. Additionally, the top-level `installSteamPatches()` call and the individual
`install*` steps inside it are not all wrapped, so a synchronous throw during install could
abort the remaining patches (partial init).

This plan adds fail-safe wrappers so **no patch callback or install step can ever propagate a
throw into Steam** — converting the residual crash risk into a clean no-op — without changing
any patch's normal behavior.

Key facts:
- `patchMethod` is a **local** helper (src/steam.ts:3827) used by **18** call sites. Hardening
  it in one place makes every `patchMethod` interception fall through to the original method on
  a callback throw.
- `afterPatch` (from `@decky/ui`, imported at src/steam.ts:2) is used by **6** call sites
  (src/steam.ts:5536 `BIsModOrShortcut`, 5552 `BHasRecentlyLaunched`, 5585 `GetPerClientData`,
  5608 (multi-line), 5735 & 5764 route `renderFunc`). A local `safeAfterPatch` wrapper makes
  each return the original `ret` on a callback throw.
- `installSteamPatches` (src/steam.ts:5227) calls many `install*(unpatchers)` steps; the call
  site is `src/index.tsx:27` (`const unpatchSteam = installSteamPatches();`).
- The `installMainWindowHistoryRedirect` wrapper already try/catches and returns
  `original(...args)`; hardening `patchMethod` makes that pattern universal (its explicit
  try/catch can stay — harmless redundancy).

**Intended outcome:** a future Steam UI change that makes a patched method's callback throw (or
makes an install step throw) results in the patched method behaving like the **original**
(or that step being skipped) instead of crashing the Steam UI; all current behavior is
unchanged when nothing throws. No user-visible change today.

**Relevant files:** `src/steam.ts` (`patchMethod` at 3827; a new `safeAfterPatch`; the 6
`afterPatch` sites; the `install*` calls inside `installSteamPatches` at ~5227-5340) and
`src/index.tsx` (wrap the `installSteamPatches()` call, line 27).

**Out of scope:** removing diagnostics (kept intentionally during active development); the
steam-tracker delisted integration; any behavior change to what the patches do; `main.py`.

**Slug used throughout this plan:** `harden-steam-patches`

---

## Orchestration Contract

**Slug:** `harden-steam-patches`

**Plan file:**

```text
docs/plans/2026-07-01_harden-steam-patches.md
```

**Implementation branch:**

```text
feat/harden-steam-patches
```

**Round-complete marker:**

```text
/tmp/Playhub-Metadata-local/harden-steam-patches_finished
```

**Finalized marker:**

```text
/tmp/Playhub-Metadata-local/harden-steam-patches_finalized
```

**Review notes:**

```text
docs/review/harden-steam-patches-review-*.md
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
git checkout -b feat/harden-steam-patches
```

Commit this plan first:

```bash
git add docs/plans/2026-07-01_harden-steam-patches.md
git commit -m "docs(plan): add harden-steam-patches implementation plan"
```

---

## Implementation Tasks

Frontend-only (`src/steam.ts`, `src/index.tsx`). No TS test runner (gate = `tsc --noEmit` +
build + py_compile + pytest). The goal is pure defense-in-depth: **behavior must be identical
when nothing throws.** Do not change what any patch does; only guarantee throws can't escape.

1. **Harden `patchMethod`** (src/steam.ts:3827). Wrap the `replacement(...)` invocation so a
   throwing callback falls through to the original method:
   ```ts
   target[methodName] = function patchedMethod(...args: any[]) {
     const boundOriginal = original.bind(this);
     try {
       return replacement(this, boundOriginal, args);
     } catch (_error) {
       // A patch replacement must never break the Steam method it wraps.
       try {
         return boundOriginal(...args);
       } catch (_originalError) {
         return undefined;
       }
     }
   };
   ```
   Keep the `if (!target?.[methodName]) return () => undefined;` guard and the unpatch closure
   unchanged. (This preserves every callback's normal return value; the catch only fires on a
   thrown exception.)

2. **Add `safeAfterPatch`** near `patchMethod`:
   ```ts
   const safeAfterPatch = (
     target: any,
     methodName: string,
     handler: (args: any[], ret: any) => any
   ) =>
     afterPatch(target, methodName, function patchedAfter(this: any, args: any[], ret: any) {
       try {
         return handler.call(this, args, ret);
       } catch (_error) {
         // An afterPatch handler must never break the Steam method it augments.
         return ret;
       }
     });
   ```
   Then replace `afterPatch(` with `safeAfterPatch(` at the **6** call sites (5536, 5552, 5585,
   5608, 5735, 5764). Preserve each existing handler body verbatim (including the
   `function (this: any, ...)` form at 5536 which relies on `this` — `handler.call(this, …)`
   keeps it working; arrow handlers are unaffected). For the two `renderPatch = afterPatch(...)`
   sites (5735, 5764), the returned unpatch handle is used later — `safeAfterPatch` returns the
   same `afterPatch(...)` result, so keep `const renderPatch = safeAfterPatch(...)` and the rest
   as-is. Do **not** change the handler logic.

3. **Isolate install steps.** Add a small helper used inside `installSteamPatches`:
   ```ts
   const safeInstallStep = (label: string, run: () => void) => {
     try {
       run();
     } catch (error) {
       log.warn("patch", `install step failed: ${label}`, error);
     }
   };
   ```
   (use the module's existing logger — match however other `log.warn`/`log.*` calls are made in
   this file; if the logger is named differently, use that.) Wrap **each** top-level
   `install*(unpatchers)` call in `installSteamPatches` with it, e.g.
   `safeInstallStep("unmatchedAppLinksHider", () => installUnmatchedAppLinksHider(unpatchers));`
   Apply to all the `installAchievementImageCoverPatch`, `installUnmatchedAppLinksHider`,
   `installNativeActivityStorePatch`, `installNativePartnerEventStorePatch`,
   `installSteamNavigationRedirect`, `installMainWindowHistoryRedirect`, `installNavigationTrace`,
   `installHistoryInstanceTrace`, `installClickTrace` calls (and any sibling `install*` calls in
   that function). Leave the existing internal `try { … } catch` blocks in `installSteamPatches`
   as they are (do not remove working guards); just ensure the bare `install*` calls are wrapped.
   Do not reorder installs.

4. **Wrap the top-level install** in `src/index.tsx` (line 27). Replace
   `const unpatchSteam = installSteamPatches();` with a guarded form so a throw during install
   can't abort plugin init, preserving the returned unpatcher when it succeeds:
   ```ts
   let unpatchSteam: (() => void) | undefined;
   try {
     unpatchSteam = installSteamPatches();
   } catch (error) {
     log.warn("bridge", "installSteamPatches failed", error);
   }
   ```
   Update the later teardown/`return` usage of `unpatchSteam` to call it only if defined
   (`unpatchSteam?.()`). Match the file's existing logger name.

5. **Scope discipline:** only the `patchMethod` hardening, the `safeAfterPatch` helper + the 6
   call-site renames, the `safeInstallStep` wrapping, and the `index.tsx` guard. Do **not**
   change any handler/callback logic, matching, redirects, the hider target, diagnostics, or
   `main.py`. No npm deps.

6. Record a session log under `docs/agent_conversations/` per `AGENTS.md` §9.

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

Run and confirm:

```bash
export UV_CACHE_DIR=/tmp/Playhub-Metadata-local/.uv
scripts/orchestration/run-quality-gates    # tsc --noEmit + rollup build + py_compile + pytest
git status --short                          # clean
```

Expected: `tsc`/build pass; pytest unchanged-green; tree clean. Confirm by inspection that the 6
`afterPatch` sites now read `safeAfterPatch`, `patchMethod` has the try/catch fall-through, each
`install*` call in `installSteamPatches` is wrapped in `safeInstallStep`, and `index.tsx` guards
`installSteamPatches()`.

Deferred verification (requires hardware — performed by the human/orchestrator):

1. Rebuild from `dev`, sideload. Everything works exactly as before (matching, Steam info,
   hider on unmatched games, native button redirect, diagnostics) — no behavior change.
2. Sanity: normal navigation, opening matched/unmatched game pages, and the metadata editor all
   behave identically to the previous build. (The hardening only changes what happens on an
   exception, which shouldn't occur on the current Steam build.)

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished harden-steam-patches
```

This writes:

```text
/tmp/Playhub-Metadata-local/harden-steam-patches_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer harden-steam-patches`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/harden-steam-patches-review-*.md
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
   scripts/orchestration/clear-finished harden-steam-patches
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
   git add docs/review/harden-steam-patches-review-*.md
   git commit -m "docs(review): record harden-steam-patches review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished harden-steam-patches
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer harden-steam-patches` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed harden-steam-patches
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize harden-steam-patches
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Playhub-Metadata-local/harden-steam-patches_finalized
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
scripts/orchestration/finalize harden-steam-patches
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Playhub-Metadata-local/harden-steam-patches_finished
/tmp/Playhub-Metadata-local/harden-steam-patches_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
