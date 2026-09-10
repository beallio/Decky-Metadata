# Plan: Scope the compatibility default to matched games (compat-default-matched-only)

## Context

The QAM **Default compatibility status** currently applies to every native
non-Steam shortcut, including entries Decky Metadata has no metadata record
for (raw Heroic, Lutris, emulator, and launcher shortcuts). The maintainer
wants an opt-in scope so the default only decorates shortcuts the plugin
actually manages.

Add a persisted boolean setting and one QAM toggle, **Apply only to matched
games**, placed directly below the existing `Default compatibility status`
dropdown in `src/components/qam/MetadataSection.tsx`. When the toggle is on,
a numeric global default applies only to native shortcuts that have a saved
metadata record; a shortcut with no record keeps Steam's original status. A
fixed per-game category and **Follow Valve** are stored inside a record, so
they are unaffected. The toggle is meaningless while the default is
Automatic, so it must be disabled in that state (its stored value is kept).

Decided semantics (maintainer, this request):

- "Matched" means a saved metadata record exists for that shortcut, matching
  the existing meaning in the codebase (`metadataCache` membership drives the
  matched-game render path in `src/steam/spoofDecision.ts`). A record without
  `steam_appid` still counts as matched.
- The control is a `ToggleField`, not extra dropdown options.

Relevant files:

- `backend/storage.py` — settings defaults and sanitizing merge
  (`deck_compat_default` handling is the pattern to follow).
- `main.py` — `get_compatibility_default` / `set_compatibility_default`
  RPC pair and its `_data_guard()` save/rollback pattern.
- `src/backend.ts` — `callable` bridge declarations.
- `src/steam/metadataPatch.ts` — `effectiveCompatibilityCategory`,
  `applyCompatibilityToOverview`, `applyCompatibilityDefault`,
  `setConfirmedCompatibilityDefault`, `ensureCompatibilityDefault`,
  `flushDeferredCompatibilityPublications`, and the
  `metadataState.compatibilityDefault*` fields in `src/steam/core.ts`.
- `src/ContentPanel.tsx` — panel load/save wiring for the existing default.
- `src/components/qam/MetadataSection.tsx` — the QAM control.
- Docs: `README.md` ("Set the compatibility status"),
  `docs/specs/compatibility-status.md` (user behavior, scenario table,
  technical contract), `CHANGELOG.md` (`## [Unreleased]`),
  `docs/runbooks/on-device-verification.md` (compatibility defaults section).
- Tests: `tests/test_deck_compat.py`, `src/steam/metadataPatch.test.ts`,
  `src/ContentPanel.updateSettings.test.tsx`, and the QAM section tests.

**Slug used throughout this plan:** `compat-default-matched-only`

### Execution status — 2026-09-10

The external launch failed before implementation because the Codex account
reached its usage limit. That lifecycle was explicitly abandoned after
confirming there was no implementer session or feature branch. Implementation
continued in OMP-native mode on `feat/compat-default-matched-only`. Do not
resume the external lifecycle against these native changes.

Local review, quality gates, and live device validation pass for `c80575f`.
The full ZIP was installed through Decky Loader; its installed bundle matches
the candidate. Native filter membership, controller operation, scope and
record transitions, reload persistence, and the authorized launch smoke were
verified. Device settings and test records were restored. The candidate is
accepted for local integration into `dev` in OMP-native mode; `main` promotion
and any remote push remain outside this task.

The initial implementation tests were added after the source change, not
red-first. The subsequent mutation control removed the scope condition and
produced five failing scope tests before restoration. The save-ordering
correction was separately reproduced red-first: repeated activation submitted
two requests instead of one. Both compatibility controls now share an
immediate in-flight guard and are disabled until the request finishes.

---

## Orchestration Contract

**Slug:** `compat-default-matched-only`

**Plan file:**

```text
docs/plans/2026-09-09_compat-default-matched-only.md
```

**Implementation branch:**

```text
feat/compat-default-matched-only
```

**Round-complete marker:**

```text
/tmp/Decky-Metadata/compat-default-matched-only_finished
```

**Finalized marker:**

```text
/tmp/Decky-Metadata/compat-default-matched-only_finalized
```

**Review notes:**

```text
docs/review/compat-default-matched-only-review-*.md
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
git checkout -b feat/compat-default-matched-only
```

Commit this plan first:

```bash
git add docs/plans/2026-09-09_compat-default-matched-only.md
git commit -m "docs(plan): add compat-default-matched-only implementation plan"
```

---

## Implementation Tasks

Work in this order. Each task must build and pass its own tests before the
next one starts.

### 1. Backend setting

In `backend/storage.py`, add `"deck_compat_default_matched_only": False` to
the default settings block. In the sanitizing merge, mirror the existing
`deck_compat_default` treatment exactly: when the incoming payload contains
the key, coerce it with a strict boolean check; when it is absent, `pop` it so
a legacy settings file is not rewritten merely because the key was
introduced. A non-boolean persisted value (string, number, `null`) must load
as `False`.

In `main.py`, add:

- `async def get_compatibility_default_matched_only(self) -> bool` — reload
  data and return the sanitized boolean.
- `async def set_compatibility_default_matched_only(self, enabled: Any) -> bool`
  — accept only real `bool` input; raise
  `ValueError("invalid compatibility default scope")` for anything else
  (including `0`, `1`, `"true"`, `None`) without touching the saved or
  in-memory value. Use the same `_data_guard()` plus save/rollback shape as
  `set_compatibility_default`, so a failed `_save_data()` restores the prior
  in-memory value (including absence).

Declare both in `src/backend.ts` with `callable`, following the existing
`getCompatibilityDefault` / `setCompatibilityDefault` declarations.

### 2. Frontend state and resolution

In `src/steam/core.ts`, add `compatibilityDefaultMatchedOnly: boolean` to
`metadataState` (initial `false`). Reset it with the other compatibility
fields in `beginCompatibilityLifecycle` and `cancelCompatibilityDefaultLoad`.

In `src/steam/metadataPatch.ts`:

- Extend `effectiveCompatibilityCategory(metadata, globalDefault, matchedOnly
  = metadataState.compatibilityDefaultMatchedOnly)`. Explicit numeric
  overrides and `"valve"` keep absolute precedence. The numeric
  `globalDefault` branch applies only when `matchedOnly` is `false` or a
  metadata record exists for that shortcut. "A record exists" means the
  `metadata` argument is a defined record object, which is what
  `metadataCache[String(appId)]` yields. When the default is skipped, keep
  falling through to `metadata?.deck_compat_category` and then `null`, so a
  skipped shortcut restores its captured native baseline through the existing
  `applyCompatibilityCategory(null)` path.
- Extend `ensureCompatibilityDefault` to load the numeric default and the new
  boolean together (one `Promise.all`) and to publish both before setting
  `compatibilityDefaultLoaded = true`. The single-flag invariant used by
  `flushDeferredCompatibilityPublications` must keep holding: no policy may
  be applied to an inheriting shortcut until both values are confirmed.
- Add `setConfirmedCompatibilityDefaultMatchedOnly(enabled,
  lifecycleGeneration = metadataState.compatibilityLifecycleGeneration)` that
  mirrors `setConfirmedCompatibilityDefault`: ignore a stale lifecycle
  generation, bump `compatibilityDefaultGeneration`, store the value, run one
  `applyCompatibilityDefault()` pass, and notify a revision when the policy
  or any packed value changed. Export it through `src/steam.ts` next to the
  existing export.
- Add a `compatibilityDefaultMatchedOnlySnapshot()` accessor beside
  `compatibilityDefaultSnapshot` so the panel can re-read confirmed state
  from a revision notification.

Do not add a second traversal: the existing single linear
`applyCompatibilityDefault` pass must serve the scope change, and the
active-Game-Info deferral, editor precedence, and reload retention behavior
in `docs/specs/compatibility-status.md` must not change.

### 3. QAM control

In `src/components/qam/MetadataSection.tsx`, add a `ToggleField` immediately
below the `Default compatibility status` dropdown, inside the same
`PanelSection`:

- label `Apply only to matched games`;
- description `Shortcuts without saved metadata keep their original Steam status.`;
- `checked` from the new prop;
- `disabled` when the settings are still loading, a save is in flight, or the
  current default is `null` (Automatic);
- `onChange` calls the new handler prop.

In `src/ContentPanel.tsx`, add state, load, and save wiring that mirrors
`saveCompatibilityDefault`: optimistic UI value, `setCompatibilityDefaultBusy`
style guard, lifecycle-generation checks around the await, publish the
backend-confirmed value through the new
`setConfirmedCompatibilityDefaultMatchedOnly`, success toast
`Compatibility` / `Matched-games-only default saved`, and on failure restore
the previous value, set the inline error, toast, and log. A stale load or a
dismounted panel must not reapply a value.

### 4. Tests

Backend (`tests/test_deck_compat.py`), following the existing compatibility
default tests:

- a persisted non-boolean value loads as `False` and other settings survive;
- `set_compatibility_default_matched_only(True)` persists, survives a fresh
  plugin instance, and rejects `1`, `"true"`, and `None` with
  `ValueError` without mutating stored state;
- a simulated `_save_data` failure keeps the previously confirmed value.

Frontend (`src/steam/metadataPatch.test.ts`):

- with the scope on and a numeric default, a native shortcut with a record
  receives the default while a shortcut with no record is restored to its
  captured native baseline in the same pass;
- a fixed per-game category and `"valve"` still win with the scope on;
- turning the scope on and back off moves a no-record shortcut from its
  native baseline to the default and back, publishing through the observable
  map both times;
- an active Game Info shortcut still holds its visible value when the scope
  changes, and applies the new policy only after the route exits;
- removing a record while the scope is on returns that shortcut to its native
  baseline.

Panel/QAM tests: the toggle is disabled while the default is Automatic,
reflects the loaded value, and a failed save restores the previous value and
shows the inline error.

Every new test must fail against the pre-change behavior. Record the observed
red output before implementing each behavior, and state in the session log
which assertion produced it.

### 5. Documentation

- `docs/specs/compatibility-status.md`: describe the scope in **User
  behavior**, add scenario rows continuing the existing numbering for: scope
  on with a no-record shortcut, scope on with an unmatched-but-recorded
  shortcut, scope on with a fixed per-game category, scope toggled off again,
  scope on plus Automatic (no visible change), scope change while a Game Info
  tab is active, and record removal under the scope. Add the persisted key,
  its sanitizing rules, and the combined-load requirement to **Technical
  contract**.
- `README.md`: document the toggle in "Set the compatibility status".
- `CHANGELOG.md`: add a bullet under the existing `## [Unreleased]`
  `### Added` list. Do not create a dated release section.
- `docs/runbooks/on-device-verification.md`: extend the compatibility
  defaults and Follow Valve check with the toggle steps a device run must
  perform.
- Record the round in `docs/agent_conversations/2026-09-09_compat-default-matched-only.md`.

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

Report actual command output and tallies, not conclusions.

1. **Prove the new tests fail first.** Before implementing each behavior, run
   the new backend and frontend tests against the unchanged code and record
   the exact failure lines to
   `/tmp/Decky-Metadata/compat-default-matched-only-red.log`. A new test that
   passes before its implementation is not evidence; replace it.

2. **Backend behavior.** Run
   `./run.sh uv run --with pytest -- pytest -q tests/test_deck_compat.py` and
   record the pass/fail tally. Then, in a scratch `python3 -` session under
   `/tmp/Decky-Metadata`, load a settings file that has no
   `deck_compat_default_matched_only` key through `backend/storage.py` and
   print the merged settings dict; assert in the output that the key is absent
   (legacy files are not rewritten) and that
   `get_compatibility_default_matched_only()` still returns `False`. Paste the
   printed dict into the session log.

3. **Frontend behavior.** Run
   `./run.sh npm test -- src/steam/metadataPatch.test.ts` plus the panel/QAM
   test files you touched, and record the file and test counts.

4. **Mutation control.** After the suite is green, temporarily change the new
   scope branch in `effectiveCompatibilityCategory` so it ignores
   `matchedOnly` and always applies the numeric default. Re-run
   `./run.sh npm test -- src/steam/metadataPatch.test.ts`, confirm the
   scope tests go red, record the failing test names, then revert the mutation
   and re-run to green. If the suite stays green under the mutation, the tests
   do not cover the feature and must be rewritten.

5. **Full gate.** Run `./run.sh scripts/orchestration/run-quality-gates` and
   record TypeScript, Rollup, Vitest file/test counts, `py_compile`, pytest,
   version-drift, and review-note-retention results.

6. **Package handoff.** Run `./run.sh npm run package` and record the produced
   version string and SHA-256 from the command output.

Deferred, and explicitly not covered by this plan's local steps:

- All Steam Deck verification. Do not connect to the Deck, deploy, install,
  reload Steam, change a real setting, or navigate the live UI in any round.
  The orchestrator owns device work and will install the packaged ZIP through
  Decky's **Install Plugin from ZIP File** dialog and run the toggle scenarios
  from `docs/runbooks/on-device-verification.md`, including: scope on with a
  no-record shortcut staying native, a recorded shortcut still following the
  default, toggling the scope back off, a scope change while a Game Info tab
  is active, record removal under the scope, Steam's own compatibility filter
  membership, and `scripts/deck/verify/run_all.sh --no-launch`.
- Whether Steam's mounted Home/grid badges refresh for a scope change is a
  device observation; state it as unverified locally.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished compat-default-matched-only
```

This writes:

```text
/tmp/Decky-Metadata/compat-default-matched-only_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer compat-default-matched-only`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/compat-default-matched-only-review-*.md
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
   scripts/orchestration/clear-finished compat-default-matched-only
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
   git add docs/review/compat-default-matched-only-review-*.md
   git commit -m "docs(review): record compat-default-matched-only review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished compat-default-matched-only
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer compat-default-matched-only` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed compat-default-matched-only
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize compat-default-matched-only
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Decky-Metadata/compat-default-matched-only_finalized
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
scripts/orchestration/finalize compat-default-matched-only
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Decky-Metadata/compat-default-matched-only_finished
/tmp/Decky-Metadata/compat-default-matched-only_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
