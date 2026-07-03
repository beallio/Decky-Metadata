# Plan: Style QAM/editor toasts to match SDH-Ludusavi (decky-toast-styling)

## Context

Decky Metadata (Decky plugin: TS/React `src/*` → `dist/index.js`, Python `main.py`) fires
**16 toast notifications** from `src/components.tsx`, and every one is the same flat shape:

```ts
toaster.toast({ title: "Decky Metadata", body: "<message>" });
```

They all share one generic title, carry **no icon**, and have **no `duration`**. This does not
match SDH-Ludusavi (the user's reference plugin), whose toasts use a **descriptive per-event
title**, a **`duration: 3000`**, and a **`logo`/icon** (a `react-icons/fa` element) chosen to
reflect the event — e.g. `<FaExclamationTriangle />` on failure paths. Reference:
`/home/beallio/Dropbox/Scripts/SDH-ludusavi/src/index.tsx` (`notify(...)` helper builds
`{ title, body, duration: 3000, logo? }`) and
`/home/beallio/Dropbox/Scripts/SDH-ludusavi/src/controllers/pluginUpdateController.tsx`.

**Intended outcome:** every Decky Metadata toast carries a specific title, a consistent
`duration`, and a semantically appropriate icon (success / error / warning), delivered through
**one small local helper** so the 16 call sites stay short and consistent. Purely cosmetic —
no behavior, timing of *actions*, or copy-of-record changes beyond the toast title/body/icon.

`react-icons` (`^5.3.0`) is already a dependency (`package.json`), so no new install is needed.

### Toast inventory (current `src/components.tsx`, classify each)

| Line (approx) | Current body | Category | Icon |
| --- | --- | --- | --- |
| 470 | "Scan complete" | success | check |
| 477 | `String(error)` (scan) | error | triangle |
| 506 | "Activity refresh complete" | success | check |
| 513 | `String(error)` (activity) | error | triangle |
| 531 | "Metadata cache cleared" | success | check |
| 533 | `String(error)` (clear cache) | error | triangle |
| 547 | "Delisted index updated" | success | check |
| 551 | "Delisted index refresh failed" | error | triangle |
| 736 | "This plugin only changes non-Steam games." | warning | triangle (warn) |
| 742 | "Metadata saved" | success | check |
| 747 | "This plugin only changes non-Steam games." | warning | triangle (warn) |
| 774 | "Metadata saved" | success | check |
| 776 | `String(error)` (save) | error | triangle |
| 787 | `String(error)` (save appid) | error | triangle |
| 802 | "Metadata saved" | success | check |
| 812 | "Metadata removed" | success | check |

Line numbers are guidance; locate each by its surrounding call, not by absolute line.

### Relevant files

`src/tokens.ts` (semantic colors already live here — reuse `colors.success/warning/error`),
`src/components.tsx` (the 16 call sites + new helper, or a new tiny `src/toast.ts` module),
`dist/index.js` (rebuilt), `docs/agent_conversations/`.

**Out of scope:** backend/`main.py`, the QAM layout/scroll work, the metadata scan logic, the
`log.*` diagnostic logging calls (leave every `log.warn(...)` exactly as-is — only the
`toaster.toast(...)` calls change), notification-gating/settings (SDH-Ludusavi's `notify`
respects a per-category enable setting; **do not** port that — we have no such setting and it
is out of scope), and any copy change beyond adding a specific title. Do not touch `src/steam.ts`.

**Test infra note:** the frontend has no TS test runner (gate = `tsc` + rollup build). Keep
the change fully typed; do not add a JS test framework. Backend pytest is unaffected.

**Slug used throughout this plan:** `decky-toast-styling`

---

## Orchestration Contract

**Slug:** `decky-toast-styling`

**Plan file:**

```text
docs/plans/2026-07-03_decky-toast-styling.md
```

**Implementation branch:**

```text
feat/decky-toast-styling
```

**Round-complete marker:**

```text
/tmp/Decky-Metadata/decky-toast-styling_finished
```

**Finalized marker:**

```text
/tmp/Decky-Metadata/decky-toast-styling_finalized
```

**Review notes:**

```text
docs/review/decky-toast-styling-review-*.md
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
git checkout -b feat/decky-toast-styling
```

Commit this plan first:

```bash
git add docs/plans/2026-07-03_decky-toast-styling.md
git commit -m "docs(plan): add decky-toast-styling implementation plan"
```

---

## Implementation Tasks

Work in order via `./run.sh`. Locate code by symbol, not by absolute line number.

### Task 1 — Add a toast helper module (`src/toast.ts`)

Create `src/toast.ts` exporting a single helper plus three thin wrappers. It centralizes the
title, `duration`, and icon so call sites stay one-liners. Match SDH-Ludusavi's shape
(`{ title, body, duration, logo }`) — Decky's `toaster.toast` renders `logo` as the toast's
leading graphic.

```ts
import { toaster } from "@decky/api";
import { FaCheckCircle, FaExclamationTriangle } from "react-icons/fa";
import { colors } from "./tokens";

const TITLE = "Decky Metadata";
const DURATION = 3000;

type ToastKind = "success" | "warning" | "error";

// Keep the constant title as a prefix for brand consistency, but make the event specific
// via `heading` (mirrors SDH-Ludusavi's descriptive per-event titles).
export function notify(kind: ToastKind, heading: string, body: string): void {
  const logo =
    kind === "success" ? (
      <FaCheckCircle color={colors.success} />
    ) : kind === "error" ? (
      <FaExclamationTriangle color={colors.error} />
    ) : (
      <FaExclamationTriangle color={colors.warning} />
    );
  try {
    toaster.toast({ title: `${TITLE} · ${heading}`, body, duration: DURATION, logo });
  } catch {
    // toaster is unavailable outside the Decky runtime; never let a toast crash a handler.
  }
}

export const toastSuccess = (heading: string, body: string) => notify("success", heading, body);
export const toastWarn = (heading: string, body: string) => notify("warning", heading, body);
export const toastError = (heading: string, body: string) => notify("error", heading, body);
```

Notes for the implementer:
- Because this file uses JSX, name it `src/toast.tsx` (not `.ts`) so `tsc`/rollup compile the
  JSX — confirm against the repo's existing `.tsx` convention. Import React if the repo's JSX
  runtime requires it (check how `src/components.tsx` handles the React import and match it).
- `colors.success` / `colors.warning` / `colors.error` already exist in `src/tokens.ts`
  (`#4ade80` / `#f59e0b` / `#f87171`). Reuse them; do not hard-code new hex values.
- Verify the exact icon names exist in `react-icons/fa` (`FaCheckCircle`,
  `FaExclamationTriangle`). If a chosen name is absent, pick the nearest equivalent and note it
  in the session log.

### Task 2 — Replace all 16 call sites in `src/components.tsx`

Replace every `toaster.toast({ title: "Decky Metadata", body: ... })` with the matching wrapper
from the inventory table in Context. Use a specific `heading` per event:

- Scan complete → `toastSuccess("Scan", "Scan complete")`
- Scan error → `toastError("Scan failed", String(error))`
- Activity refresh complete → `toastSuccess("Activity", <existing body>)` (keep the dynamic
  count body from `activityCompleteMessage`/whatever currently builds it — do not flatten it)
- Activity error → `toastError("Activity failed", String(error))`
- Cache cleared → `toastSuccess("Cache", "Metadata cache cleared")`
- Cache clear error → `toastError("Cache clear failed", String(error))`
- Delisted updated → `toastSuccess("Delisted index", "Delisted index updated")`
- Delisted failed → `toastError("Delisted index", "Delisted index refresh failed")`
- "only changes non-Steam games" (both sites) → `toastWarn("Not applicable", "This plugin only changes non-Steam games.")`
- Metadata saved (all sites) → `toastSuccess("Saved", "Metadata saved")`
- Metadata removed → `toastSuccess("Removed", "Metadata removed")`
- Save errors → `toastError("Save failed", String(error))`

Then remove the now-unused `import { toaster } from "@decky/api";` from `src/components.tsx`
**iff** no direct `toaster.` reference remains there (grep to confirm). Add
`import { toastSuccess, toastWarn, toastError } from "./toast";` (adjust extension per Task 1).

Do **not** change any surrounding logic, ordering, `await refresh()` calls, or `log.*` calls —
only the toast invocation on each line changes. Preserve every dynamic body string exactly.

### Task 3 — Rebuild bundle + session log

- `./run.sh npm run build`; stage `dist/`.
- Record `docs/agent_conversations/2026-07-03_decky-toast-styling.md`: the flat-toast problem,
  the SDH-Ludusavi reference shape (`title`/`body`/`duration`/`logo`), the helper design, the
  success/warning/error → icon+color mapping, and the no-TS-runner note.

### Scope discipline

Only the toast presentation. Do NOT change backend, scan logic, QAM layout, `src/steam.ts`,
diagnostic `log.*` calls, or add a notification-gating setting. Preserve all other behavior and
every dynamic message string.

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

Automated (run via `./run.sh`):

```bash
./run.sh npx tsc --noEmit                       # no type errors (incl. new toast module + JSX)
./run.sh npm run build                          # dist/index.js regenerated
scripts/orchestration/run-quality-gates
git status --short                               # clean
```

Grep/scope gates:

```bash
grep -rn "toastSuccess\|toastWarn\|toastError" src/components.tsx   # all 16 sites converted
grep -rn 'title: "Decky Metadata"' src/components.tsx               # expect GONE (no flat toasts)
grep -c "toaster.toast" src/components.tsx || true                  # expect 0 in components
grep -rn "FaCheckCircle\|FaExclamationTriangle" src/toast.*         # icons wired in helper
grep -rn "colors.success\|colors.warning\|colors.error" src/toast.* # semantic colors reused
git diff --name-only dev..HEAD -- src/steam.ts main.py             # expect empty (untouched)
```

Static review:

- Task 1: helper builds `{ title, body, duration, logo }`; icon+color chosen by kind from
  `src/tokens.ts` colors; wrapped in try/catch so a missing runtime toaster can't crash a handler.
- Task 2: every former flat toast now routes through a wrapper with a specific heading; dynamic
  bodies (`String(error)`, activity count) preserved verbatim; unused `toaster` import removed
  from `components.tsx` only if no direct use remains.

### Deferred verification — on-device (cannot run here)

Sideload the rebuilt zip and trigger each path in the QAM and editor (scan, activity refresh,
clear cache, refresh delisted, save/remove metadata, and a save on a Steam game to hit the
warning). Confirm each toast shows the specific title, the correct icon (green check on success,
amber/red triangle on warning/error), and auto-dismisses (~3s). Compare side-by-side with an
SDH-Ludusavi toast for visual parity.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished decky-toast-styling
```

This writes:

```text
/tmp/Decky-Metadata/decky-toast-styling_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer decky-toast-styling`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/decky-toast-styling-review-*.md
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
   scripts/orchestration/clear-finished decky-toast-styling
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
   git add docs/review/decky-toast-styling-review-*.md
   git commit -m "docs(review): record decky-toast-styling review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished decky-toast-styling
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer decky-toast-styling` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed decky-toast-styling
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize decky-toast-styling
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Decky-Metadata/decky-toast-styling_finalized
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
scripts/orchestration/finalize decky-toast-styling
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Decky-Metadata/decky-toast-styling_finished
/tmp/Decky-Metadata/decky-toast-styling_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
