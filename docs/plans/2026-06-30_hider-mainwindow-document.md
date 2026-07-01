# Plan: Inject the app-links hider into the main window document (hider-mainwindow-document)

## Context

The unmatched-app-links hider STILL shows the Store/Community/Discussions/Guides/Market row on
non-Steam games with no Steam match — despite now resolving the **correct** class
(`GameInfoQuickLinks`, `_2GqvVM-UeNGM7ptNftUVn_`) and correctly deciding `decision=true` on
unmatched pages. Live CEF DOM inspection (Steam remote debugger, port 8080) revealed the true
root cause, which every prior hider fix missed: **the plugin injects its `<style>` and toggles
the body class in the WRONG document.**

There are two separate documents:

| | SharedJSContext (the plugin's `document`) | Main window (`Steam Big Picture Mode`) |
|---|---|---|
| URL | `.../library/app/<id>/tab/GameInfo` | `index.html` |
| Plugin style node present | yes | **no** |
| `playhub-hide-applinks` body class | applied | **not applied** |
| `.GameInfoQuickLinks` buttons present | **0** | **1** |

So the hider's CSS (`body.playhub-hide-applinks .GameInfoQuickLinks{display:none}`) is injected
into the plugin's own SharedJSContext document, but the buttons render in the **main window's
document**, which never receives the style or the body class. The class resolution, the
route/app decision, and the toggle are all correct — they just act on the wrong DOM. (This is
why the button *redirect* works — it patches shared JS via `MainWindowInstance.m_history` — but
the CSS hide never has.)

Confirmed accessor (same `MainWindowInstance` the redirect already uses):
`SteamUIStore.m_WindowStore.MainWindowInstance.m_BrowserWindow.document` — verified to contain
`.GameInfoQuickLinks` (title "Steam Big Picture Mode") and to be writable (`createElement` +
`head` available). `g_PopupManager.m_mapPopups` iteration reaches the same window.

**Fix:** the hider must inject/maintain its `<style>` node in the **main window document's
head** and toggle the `playhub-hide-applinks` class on the **main window document's body** — not
the plugin's `document`. Because that window can appear after plugin init or be recreated, the
existing 400ms poller must resolve the target document each tick and (re)inject the style if
it's missing. The class resolver (`resolveAppDetailsQuickLinksClasses`, JS-shared via
`findModuleChild`) and `shouldHideUnmatchedAppLinks` stay unchanged.

Relevant code (all `src/steam.ts`): `installUnmatchedAppLinksHider` (~3976), `updateStyle`/
`update` inside it, `appLinksDomClassPresent` (~3921), `logUnmatchedAppLinksDecision` (~3943),
`PLAYHUB_HIDE_APP_LINKS_CLASS`/`_STYLE_ID` constants (~3856), and the existing
`MainWindowInstance` access used by the redirect (`installMainWindowHistoryRedirect`) as the
pattern for reaching the main window object.

**Intended outcome:** on an unmatched non-Steam game's page the `GameInfoQuickLinks` row is
actually hidden (the style + body class now live in the main window document); matched games and
real Steam apps are unaffected; the `[playhub:applinks]` diagnostic reports
`classPresentInDom=true` (now probing the main window document). Verifiable live via CEF:
`MainWindowInstance.m_BrowserWindow.document` gains the style node and its body gains the class.

**Out of scope:** the class target (already correct); the route/app decision (already correct);
the Steam App ID override; removing diagnostics (later cleanup). No `main.py` change.

**Slug used throughout this plan:** `hider-mainwindow-document`

---

## Orchestration Contract

**Slug:** `hider-mainwindow-document`

**Plan file:**

```text
docs/plans/2026-06-30_hider-mainwindow-document.md
```

**Implementation branch:**

```text
feat/hider-mainwindow-document
```

**Round-complete marker:**

```text
/tmp/Playhub-Metadata-local/hider-mainwindow-document_finished
```

**Finalized marker:**

```text
/tmp/Playhub-Metadata-local/hider-mainwindow-document_finalized
```

**Review notes:**

```text
docs/review/hider-mainwindow-document-review-*.md
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
git checkout -b feat/hider-mainwindow-document
```

Commit this plan first:

```bash
git add docs/plans/2026-06-30_hider-mainwindow-document.md
git commit -m "docs(plan): add hider-mainwindow-document implementation plan"
```

---

## Implementation Tasks

Frontend-only, `src/steam.ts`, in/around `installUnmatchedAppLinksHider`. No TS test runner
(gate = `tsc --noEmit` + build + py_compile + pytest). **Never throw**; passive; if the main
window document can't be resolved, degrade gracefully (do nothing that tick).

1. **Add a main-window-document resolver.** Near the hider code, add:
   ```ts
   const appLinksHiderTargetDocument = (): Document | null => {
     try {
       const doc = (window as any)?.SteamUIStore?.m_WindowStore?.MainWindowInstance
         ?.m_BrowserWindow?.document;
       if (doc && typeof doc.createElement === "function" && doc.head && doc.body) {
         return doc as Document;
       }
     } catch (_error) {
       // fall through
     }
     return null;
   };
   ```
   (Do not fall back to the plugin's own `document` for injection — that is the wrong document
   and is exactly the bug. If the main window isn't ready, skip this tick; the poller retries.)

2. **Probe the correct document in the diagnostic.** Change `appLinksDomClassPresent` to accept
   a `Document` and query it: `appLinksDomClassPresent(className: string, doc: Document)` using
   `doc.querySelector(...)` (keep the `CSS.escape` guard and try/catch). Update
   `logUnmatchedAppLinksDecision` to accept and pass the resolved target document to
   `appLinksDomClassPresent` (when the doc is null, report `classPresentInDom: false`). Keep the
   throttle signature behavior.

3. **Rework `installUnmatchedAppLinksHider` to operate on the main window document.**
   - At install, DO NOT create/append the style node against the plugin `document`. Remove the
     install-time `document.getElementById(...)/createElement(...)/document.head.appendChild(...)`
     block. Keep the idempotency guard (`globalState.__playhubAppLinksHider`). The
     `typeof document === "undefined"` early-out can remain as a coarse environment guard, but
     the actual style/body operations must use the resolved target document.
   - Keep closure state: `resolvedQuickLinksClasses`, `appliedQuickLinksClasses`,
     `lastDecisionLogSignature`. Add `let injectedDoc: Document | null = null;` to track which
     document currently holds our style node.
   - Rewrite `update()` to, each tick (all inside the existing try/catch):
     1. `const doc = appLinksHiderTargetDocument();` if `!doc`, return early (retry next tick).
     2. Resolve classes lazily: if `resolvedQuickLinksClasses.length === 0`,
        `resolvedQuickLinksClasses = resolveAppDetailsQuickLinksClasses();`
     3. Ensure our style node exists in `doc.head`: look up
        `doc.getElementById(PLAYHUB_HIDE_APP_LINKS_STYLE_ID)`; if missing (or `injectedDoc !== doc`,
        i.e. the window changed), create a `<style>` in `doc`, set its id, append to `doc.head`,
        set `injectedDoc = doc`, and force a style-content refresh.
     4. Set the style `textContent` from `buildUnmatchedAppLinksHiderStyle(resolvedQuickLinksClasses)`
        only when the applied classes changed or the node was just (re)created (preserve the
        existing "skip if unchanged" optimization via `appliedQuickLinksClasses`).
     5. Compute `const decision = shouldHideUnmatchedAppLinks();` (unchanged logic).
     6. `lastDecisionLogSignature = logUnmatchedAppLinksDecision(decision, resolvedQuickLinksClasses,
        lastDecisionLogSignature, doc);`
     7. `doc.body.classList.toggle(PLAYHUB_HIDE_APP_LINKS_CLASS, decision);`
   - **Teardown** (`unpatchers.push`): clear the interval; if `injectedDoc` is set, remove the
     style node from `injectedDoc` (by id) and `injectedDoc.body.classList.remove(
     PLAYHUB_HIDE_APP_LINKS_CLASS)`; wrap in try/catch; `delete globalState.__playhubAppLinksHider`.
   - Keep the `window.setInterval(update, 400)` cadence and call `update()` once immediately.

4. **Scope discipline.** Only the target-document resolution + moving the style injection/body
   toggle/DOM probe to the main window document. Do NOT change `resolveAppDetailsQuickLinksClasses`,
   `buildUnmatchedAppLinksHiderStyle` (its output string is fine), `shouldHideUnmatchedAppLinks`,
   `onGameDetailRoute`, the redirect, matching, or `main.py`. No npm deps; `npm ci` if needed.

5. Record a session log under `docs/agent_conversations/` per `AGENTS.md` §9, noting the fix
   moves DOM injection from the plugin's SharedJSContext document to
   `SteamUIStore.m_WindowStore.MainWindowInstance.m_BrowserWindow.document` (derived from live CEF
   inspection), which is the document where `GameInfoQuickLinks` actually renders.

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

Expected: `tsc`/build pass; pytest unchanged-green; tree clean.

Deferred verification (requires hardware — performed by the human/orchestrator; CEF-verifiable):

1. Rebuild from `dev`, sideload.
2. Open an **unmatched** non-Steam game (e.g. *X-Men Origins: Wolverine*) — the
   Store/Community/Discussions/Guides/Market row is now **hidden**; page otherwise intact.
3. Open a **matched** game (Space Marine / Wobbly Life) — its quick-links stay **visible/working**.
4. CEF check (over SSH): in `MainWindowInstance.m_BrowserWindow.document` the
   `playhub-hide-applinks-style` node exists and `body` has the `playhub-hide-applinks` class on
   an unmatched page; `[playhub:applinks]` log shows `classPresentInDom=true`.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished hider-mainwindow-document
```

This writes:

```text
/tmp/Playhub-Metadata-local/hider-mainwindow-document_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer hider-mainwindow-document`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/hider-mainwindow-document-review-*.md
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
   scripts/orchestration/clear-finished hider-mainwindow-document
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
   git add docs/review/hider-mainwindow-document-review-*.md
   git commit -m "docs(review): record hider-mainwindow-document review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished hider-mainwindow-document
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer hider-mainwindow-document` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed hider-mainwindow-document
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize hider-mainwindow-document
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Playhub-Metadata-local/hider-mainwindow-document_finalized
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
scripts/orchestration/finalize hider-mainwindow-document
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Playhub-Metadata-local/hider-mainwindow-document_finished
/tmp/Playhub-Metadata-local/hider-mainwindow-document_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
