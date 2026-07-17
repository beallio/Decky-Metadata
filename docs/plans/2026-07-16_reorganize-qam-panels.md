# Plan: Reorganize QAM Panels and Add Log Viewer (reorganize-qam-panels)

## Context

Decky Metadata's current Quick Access Menu is implemented as one large
`src/ContentPanel.tsx` component. It mixes summary data, metadata scanning,
Activity refresh, cache management, the delisted index, diagnostics, and version
details into loosely grouped sections. The hierarchy is difficult to scan, the
initial controller target is not explicit, the delisted-index action is nested
under metadata-cache controls, and users cannot inspect the rotating plugin log
from Gaming Mode.

Reorganize the QAM using the approved prototype at
`/tmp/Decky-Metadata/decky-metadata-ui-sample.html`. Its QAM view is the visual and
content reference; do not copy its raw HTML controls into React. Follow the
composition pattern observed in SDH-PlayTime's `DeckyPanelPage` (a thin top-level
page composed from focused sections) and the native Logs/Versions presentation
observed in SDH-Ludusavi's `VersionAndLogsSection.tsx` and `LogModal.tsx`. Use
Decky's `PanelSection`, `PanelSectionRow`, `Field`, `ButtonItem`, `ToggleField`,
`ConfirmModal`, and `showModal` so controller navigation and Steam focus styling
remain native.

The resulting panel order and content are:

1. **Metadata** — first and initially selected, containing the current detected
   non-Steam game, saved metadata, and missing metadata counts; explanatory copy
   and a `Refresh metadata` button backed by the existing missing-metadata scan;
   then a nested `Metadata cache` subsection with explanatory copy and `Clear
   cache`.
2. **Delisted Index** — the cached count/date and `Refresh delisted index` action,
   broken out as its own panel immediately below Metadata.
3. **Logs** — a `View Logs` button and the existing Debug Logging toggle with a
   short troubleshooting description.
4. **Versions** — one SDH-Ludusavi-style line showing `Decky Metadata:` and the
   complete packaged plugin version. Do not add dependency rows, and remove the
   existing duplicate Commit, Delisted index, and Metadata diagnostic rows.

Match the approved separator contract exactly: there is no horizontal rule below
`Refresh metadata`; there is a horizontal rule below `Clear cache`; and there is
a horizontal rule below `Refresh delisted index`. Preserve the existing Steam/
Decky spacing, typography, scroll behavior, and focus affordances rather than
introducing a custom visual system.

Deprecate Activity refresh only in the frontend: remove the QAM button, copy,
state, polling handler, imports, and activity-specific event dispatches from
`ContentPanel.tsx`, but retain `start_refresh_steam_activities`,
`get_activity_refresh_progress`, their TypeScript callable exports, and all
backend implementation/tests for possible future use. The QAM is the sole
dispatcher of `decky-metadata:activity-refreshed`; remove its now-unreachable
`installActivityRefreshedListener` frontend listener and install wiring from
`src/steam/activity.ts` and `src/steam/install.ts`. Do not change per-app activity
refresh: `refreshSteamActivityForApp` and `refreshDeckyNativeActivityForApp`
remain active and do not depend on that bulk-refresh event.

The backend already installs a 2 MiB rotating file handler at
`decky-metadata.log`. Add a small read-only RPC that returns a bounded recent tail
of that existing log; do not add a second logging system or a dependency. Display
the returned text in a Decky `ConfirmModal` with a scrollable, selectable,
monospace body and `No recent logs` fallback. Log reading must tolerate a missing
or unavailable file, invalid UTF-8, and rotation without blocking or returning an
unbounded payload.

Primary implementation surfaces are `src/ContentPanel.tsx`, new presentational
components under `src/components/qam/`, `src/backend.ts`, the narrowly scoped
bulk-refresh listener removal in `src/steam/activity.ts` and
`src/steam/install.ts`, `main.py`, focused frontend/backend tests, `README.md`,
the committed `dist/index.js`, and a new session summary under
`docs/agent_conversations/`. The metadata editor and all other Steam patches are
out of scope.

**Slug used throughout this plan:** `reorganize-qam-panels`

---

## Orchestration Contract

**Slug:** `reorganize-qam-panels`

**Plan file:**

```text
docs/plans/2026-07-16_reorganize-qam-panels.md
```

**Implementation branch:**

```text
feat/reorganize-qam-panels
```

**Round-complete marker:**

```text
/tmp/Decky-Metadata/reorganize-qam-panels_finished
```

**Finalized marker:**

```text
/tmp/Decky-Metadata/reorganize-qam-panels_finalized
```

**Review notes:**

```text
docs/review/reorganize-qam-panels-review-*.md
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
git checkout -b feat/reorganize-qam-panels
```

Commit this plan first:

```bash
git add docs/plans/2026-07-16_reorganize-qam-panels.md
git commit -m "docs(plan): add reorganize-qam-panels implementation plan"
```

---

## Implementation Tasks

1. **Establish the implementation baseline and record the approved contract.**
   - From the repository root, output the protocol handshake, run
     `./run.sh scripts/decky doctor`, and run
     `./run.sh scripts/decky verify-change dev --explain` before modifying runtime
     files. Capture and diagnose any pre-existing failure rather than retrying it
     blindly.
   - Re-read `src/ContentPanel.tsx`, `src/styles.tsx`, `src/backend.ts`, the file
     logging helpers in `main.py`, the installed `@decky/ui` types for `Field`,
     `ButtonItem`, `ToggleField`, `ConfirmModal`, and `showModal`, and the QAM
     portion of `/tmp/Decky-Metadata/decky-metadata-ui-sample.html`.
   - Treat the approved prototype as the content/order/spacing reference. Preserve
     its exact panel order, labels, helper text, nested cache grouping, and
     separator placement. Do not modify the metadata editor while implementing
     this plan.

2. **Add failing regression coverage before production changes.**
   - Add focused Python tests in `tests/test_plugin_logs.py` for a
     pure bounded-tail helper and the new plugin RPC. Cover a missing file, a
     normal short file, a file larger than the cap, a tail that starts mid-line,
     a cap-sized tail containing no newline, invalid UTF-8 decoded with
     replacement, rotation/truncation that returns safely rather than raising,
     and an installed handler that is flushed before reading.
   - Add `tests/test_qam_frontend_contract.py`, a small QAM source contract that
     runs outside Steam's runtime. Assert only stable requirements: the four
     section components and order, the Metadata summary's preferred focus, the
     approved labels/separators, and absence of Activity refresh imports/state/
     control from `ContentPanel.tsx`. Also assert the bulk-only
     `installActivityRefreshedListener` export/import/install call is gone while
     `refreshSteamActivityForApp` and `refreshDeckyNativeActivityForApp` remain.
     Do not snapshot the whole component or generated Steam class names.
   - Run the targeted tests first and save the expected red output below
     `/tmp/Decky-Metadata/`. Implement only after the failures demonstrate the
     missing behavior, then rerun the same targeted tests to green. Treat source
     contracts as documentation fences, not proof of rendered layout or
     controller behavior.

3. **Expose a bounded tail of the existing plugin log.**
   - In `main.py`, add a pure helper that reads at most 128 KiB from the end of a
     supplied log path. Open in binary mode, seek from the end when necessary,
     and discard an initial partial line only when the read starts mid-file and a
     newline exists in the bounded chunk. If a cap-sized chunk has no newline,
     return that bounded partial line instead of incorrectly reporting an empty
     log. Decode with UTF-8 replacement and return an empty string for missing/
     unreadable files. Treat concurrent rotation or truncation as a safe short or
     empty result rather than propagating an exception. Never read the full 2 MiB
     rotating file into memory and never traverse paths supplied by the frontend.
   - Add `Plugin.get_plugin_logs()` with no arguments. Resolve the current log only
     from the existing `_LOG_FILE_HANDLER`/`_install_file_logging()` contract,
     flush the installed handler best-effort, and return the bounded tail. Do not
     expose a path, token, settings payload, or arbitrary filesystem access.
   - Export `getPluginLogs = callable<[], string>("get_plugin_logs")` from
     `src/backend.ts`. Leave every Activity refresh callable and Python method in
     place even though the QAM no longer imports them.
   - Add a presentational `PluginLogModal` under `src/components/qam/` modeled on
     SDH-Ludusavi's log modal: `ConfirmModal`, title `Plugin Logs`, a maximum-height
     scroll area, monospace `pre-wrap` text, selectable content, and the exact
     empty fallback `No recent logs`. Set `bAlertDialog={true}` and wire OK,
     Cancel/Escape, and `closeModal` so the modal presents one dismiss action like
     the prototype and returns controller focus without trapping navigation.

4. **Split the QAM into typed native section components.**
   - Keep `src/ContentPanel.tsx` as the data/operation coordinator, but move QAM
     markup into typed presentational components under `src/components/qam/`:
     `MetadataSection`, `DelistedIndexSection`, `LogsSection`, and
     `VersionsSection` (plus the log modal). Each receives values, busy states,
     status text, and callbacks through explicit props; it must not call the
     backend directly.
   - Compose those components in exactly the approved order. Do not insert a
     wrapper panel above Metadata or a diagnostics panel between them.
   - Implement the Metadata summary with a native focusable/highlighted `Field`
     and `preferredFocus={true}` as Decky's initial-focus hint. The three current
     counts remain visible inside that one selected summary. Because
     `preferredFocus` is not runtime proof, the acceptance criterion is that the
     summary is visibly selected on a fresh live QAM entry. If the hint does not
     achieve that on-device, inspect the live focus tree and use a stable native
     Decky focus mechanism; do not add a timer-driven raw DOM `.focus()` hack.
     Preserve the existing initial data loading and missing-count reconciliation.
   - Present the existing `startScanMissing` action as `Refresh metadata`. Put the
     approved sentence above it: `Find and save metadata for detected non-Steam
     games that do not have a match yet.` Preserve the current busy guard,
     progress polling, completion/error status, refresh, and toasts; update only
     user-facing Scan labels needed to match the approved design.
   - Give scan progress an explicit rendering home after moving to `ButtonItem`:
     render the current `scanMessage` with its `scanStatusKind` in a dedicated,
     non-focusable inline status block directly below `Refresh metadata` whenever
     the operation is active or a message exists. This transient feedback must
     continue to show current/completed/total text and final success/warning/error
     state, must not introduce a horizontal separator below the button, and must
     not be reduced to toast-only feedback.
   - Nest `Metadata cache` inside the Metadata panel. Use the approved copy `Clear
     saved matches and metadata so games can be matched again.` Preserve
     `clearCache` behavior, including its busy guards and best-effort rescan after
     clearing. Render no separator after `Refresh metadata` and one standard
     separator after `Clear cache`.
   - Render Delisted Index as the second standalone `PanelSection`, with the
     existing count/date fallback and refresh behavior. Render one standard
     separator after `Refresh delisted index`.
   - Use `ButtonItem` for full-width QAM actions unless a verified native Decky
     limitation requires the existing focusable `DialogButton`; do not replace
     Decky controls with raw HTML buttons or couple CSS to generated Steam class
     names.

5. **Remove bulk Activity refresh from the frontend without removing its backend.**
   - Delete `activityBusy`, `activityMessage`, `activityStatusKind`,
     `activityCompleteMessage`, and `refreshActivities` from
     `src/ContentPanel.tsx`, together with the `startRefreshSteamActivities` and
     `getActivityRefreshProgress` imports and the rendered Activity button/copy.
   - Remove QAM-only `decky-metadata:activity-refreshed` and
     `decky-metadata:updated` dispatches that lived inside that handler. Since the
     QAM is the only `decky-metadata:activity-refreshed` dispatcher, also remove
     `installActivityRefreshedListener` from `src/steam/activity.ts` and its import/
     install call from `src/steam/install.ts`; do not leave a permanently
     un-dispatched listener behind.
   - Confirm `src/backend.ts` still exports `startRefreshSteamActivities` and
     `getActivityRefreshProgress`, and `main.py` still contains the associated
     task/progress implementation. Confirm the per-app refresh path still imports
     and calls `refreshSteamActivityForApp`, and the router patch still receives
     `refreshDeckyNativeActivityForApp`. Existing Activity tests must continue to
     pass; do not change native activity stores, caches, feed patches, or per-app
     refresh semantics.

6. **Add Logs and simplify Versions.**
   - Implement `LogsSection` as the third panel. Its first native `ButtonItem` is
     `View Logs`. In `ContentPanel.tsx`, guard duplicate requests, fetch
     `getPluginLogs()`, open `PluginLogModal` through Decky's `showModal`, and show
     the existing error toast on failure. A transient `Loading...` label/disabled
     state is acceptable; do not cache log contents across button presses.
   - Keep Debug Logging in the Logs panel below the button, using the existing
     saved setting and `ToggleField`. Add the approved description `Enables
     verbose logging for troubleshooting.` and preserve current logging-level
     synchronization and controller interaction.
   - Implement `VersionsSection` as the final panel using the same simple native
     focusable field treatment as SDH-Ludusavi. Show one line only:
     `Decky Metadata: <full version>`, using the backend value including any
     packaged `+commit` suffix and `Unknown` while unavailable. A release/local
     package with only the base version is valid and renders that base unchanged;
     tests must not require a `+commit` suffix. Remove
     `splitVersion` and the old separate Plugin, Commit, Delisted index, and
     Metadata rows when no other code uses them. Do not add Decky, Python, npm, or
     provider version rows.
   - Remove QAM-only styles that become unused after the component split. Keep
     shared editor styles and all editor behavior unchanged.

7. **Update documentation and committed artifacts.**
   - Update README's Metadata Cache and Diagnostics/QAM descriptions to match the
     four panels: `Refresh metadata`, nested Clear cache, standalone Delisted
     Index, View Logs plus Debug Logging, and the single full plugin-version row.
     State that Activity refresh is no longer exposed in the QAM; do not claim its
     backend was removed.
   - Rebuild `dist/index.js` through the repository wrapper and commit the updated
     bundle with its source changes.
   - Add `docs/agent_conversations/2026-07-16_reorganize-qam-panels.md` recording
     the objective, files changed, SDH-PlayTime/SDH-Ludusavi patterns adopted,
     log-tail safety choices, Activity backend compatibility boundary, tests, and
     live-Deck verification evidence.

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

1. Run focused tests through the wrapper while iterating:

   ```bash
   ./run.sh uv run --with pytest -- pytest -q tests/test_plugin_logs.py tests/test_qam_frontend_contract.py
   ```

2. Run the project change classifier and complete quality gate:

   ```bash
   ./run.sh scripts/decky verify-change dev --explain
   ./run.sh ./scripts/orchestration-hooks/quality-gates
   ./run.sh scripts/orchestration/run-quality-gates
   ./run.sh scripts/orchestration/check-review-notes-not-deleted
   git diff --check
   git status --short
   ```

   Confirm TypeScript type-checking, Rollup, all Vitest tests, Python byte-compile,
   and all Pytest tests pass; `dist/index.js` is regenerated; review notes remain
   intact; and the final working tree is clean after commits.

3. Inspect the built/source contract before live deployment:
   - `ContentPanel.tsx` composes Metadata, Delisted Index, Logs, and Versions in
     that order.
   - Metadata's summary has preferred focus and contains all three counts.
   - `Refresh metadata` has helper copy above it and retains a dedicated visible
     inline progress/completion/error status below it plus the existing toasts.
   - Metadata cache is nested; there is no divider after Refresh metadata; there
     are dividers after Clear cache and Refresh delisted index.
   - No QAM-rendered `Refresh Activity` label/control or associated state/import
     remains; the unreachable bulk event listener is removed; both backend
     Activity callables/Python methods and the per-app frontend refresh path remain.
   - View Logs fetches fresh bounded text and opens the modal; Debug Logging is in
     the same panel; Versions has only the full Decky Metadata version.

4. Live Gaming Mode verification is a hard round-completion gate because static
   tests cannot prove initial focus, native separators, D-pad order, or modal
   focus return. Use the committed workflow rather than ad hoc scripts:

   ```bash
   ./run.sh scripts/decky doctor --deck
   ./run.sh scripts/deck/deploy.sh
   ./run.sh scripts/deck/verify/run_all.sh
   ./run.sh scripts/decky steamui snapshot
   ```

   Open Decky Metadata from a fresh QAM entry and verify the Metadata summary is
   initially selected; D-pad navigation reaches every button/toggle in visual
   order; A activates actions and opens/closes Plugin Logs; long logs scroll;
   returning to QAM does not leave focus trapped in the modal; separators and
   panel order match `/tmp/Decky-Metadata/decky-metadata-ui-sample.html`; busy,
   in-progress scan plus open-modal, success, empty-log, base-only version, and
   error states do not clip at the QAM width. Exercise a long log and confirm it
   scrolls, and confirm modal OK/Cancel/Escape all dismiss without exposing a
   second visible action.

5. If deploy permission is not present or the Deck is unreachable, stop without
   running deployment and without creating the round-complete marker. Report the
   exact blocker to the orchestrator/user; do not claim completion or allow the
   plan to merge into `dev` on static evidence alone. Static tests and the
   standalone prototype are not substitutes for SteamUI focus/modal verification.
   Because this plan now removes one dead listener from `src/steam/`, the committed
   `scripts/deck/verify/run_all.sh` suite is required even though no remaining
   Steam patch behavior should change.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished reorganize-qam-panels
```

This writes:

```text
/tmp/Decky-Metadata/reorganize-qam-panels_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer reorganize-qam-panels`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/reorganize-qam-panels-review-*.md
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
   scripts/orchestration/clear-finished reorganize-qam-panels
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
   git add docs/review/reorganize-qam-panels-review-*.md
   git commit -m "docs(review): record reorganize-qam-panels review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished reorganize-qam-panels
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer reorganize-qam-panels` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed reorganize-qam-panels
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize reorganize-qam-panels
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Decky-Metadata/reorganize-qam-panels_finalized
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
scripts/orchestration/finalize reorganize-qam-panels
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Decky-Metadata/reorganize-qam-panels_finished
/tmp/Decky-Metadata/reorganize-qam-panels_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
