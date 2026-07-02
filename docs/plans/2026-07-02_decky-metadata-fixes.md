# Plan: Decky Metadata QAM fixes, matching reliability, and identifier/tooling rename (decky-metadata-fixes)

## Context

Decky Metadata (formerly Playhub Metadata) is a Decky Loader plugin: a TypeScript/React
frontend in `src/*` bundled by rollup to `dist/index.js`, plus a single-file Python backend
`main.py`. The QAM panel and per-game metadata page live in `src/components.tsx`; Steam
client patching in `src/steam.ts`; the plugin entry/route in `src/index.tsx`; the library
context-menu entry in `src/contextMenuPatch.tsx`. The plugin was just rebranded to
"Decky Metadata" and shipped to `dev`.

This plan bundles **seven fixes/updates** reported after on-device testing of the rebranded
build. They are largely independent; implement them as separate task groups but in one round.
All are `bugfix`/`polish`/`refactor` — none changes the plugin's feature set.

1. **Spinner buttons render broken while running.** The **Scan metadata** and **Refresh
   delisted index** buttons wrap a Decky `<Spinner />` in a 1rem box using
   `transform: scale(0.5)` + `overflow: hidden` (`src/components.tsx` `scanSpinnerStyle` /
   `scanSpinnerInnerStyle`, ~145–162). The scale-and-clip hack renders the spinner
   clipped/misaligned. Replace it with a robust fixed-size spinner wrapper.
2. **Internal `playhub*` identifiers are inconsistent with the rebrand.** The rebrand
   deliberately kept them; the decision is now reversed — rename them all to `decky*` for
   consistency (route, context-menu entry key, backend log-area bracket prefix, and window
   event names). None are persisted on-device, so no data migration is required.
3. **Tooling path strings still say "Playhub".** The repo working directory has **already been
   renamed** to `Decky-Metadata` (the human moved it, along with the Claude session/config,
   before this plan runs), so the implementer already operates from the new path. What remains
   is that in-repo tooling still hard-codes the old `/tmp/Playhub-Metadata-local` cache root and
   "Playhub" name strings. This plan updates those strings to the new `/tmp/Decky-Metadata` root
   and `Decky-Metadata` name. The only physical move still outstanding is the `/tmp` cache dir,
   which stays a human step **after** merge (this run's live markers still live under
   `/tmp/Playhub-Metadata-local`) — see the Verification section's deferred/human steps.
4. **Clean-cache scan misses games that a rerun then matches.** On a fresh metadata cache the
   first **Scan metadata** pass fails to match some games, but running the scan again matches
   them (`_metadata_needs_scan` re-selects only the still-missing games, so the rerun succeeds
   where the first pass didn't). Root-cause and fix so the first pass is reliable.
5. **Controller can't scroll the whole QAM panel.** In Gaming Mode the QAM scrolls to keep
   the *focused* element visible, but the top stats block and the bottom Diagnostics/Versions
   block are non-focusable `<div>`s, so a controller can't move focus onto them and the panel
   won't scroll to reveal them. Make the top and bottom content focusable.
6. **Versions panel text is smooshed / not visually appealing.** The three Diagnostics
   "Versions" rows (`src/components.tsx` ~542–555, using `diagnosticsGridStyle` /
   `diagnosticsRowStyle` / `diagnosticsValueStyle`) are cramped and carry a redundant
   "Metadata saved:" prefix. Improve spacing/typography.
7. **Scan status sticks on the last per-game line after completion.** `scanMissing`
   (`src/components.tsx` ~339–363) sets `scanMessage` each poll tick but never clears/replaces
   it on completion, so the status row keeps showing the last processed game (often a
   non-match) after the scan finishes. Clear or replace it with a terminal summary.

### Relevant files

`src/components.tsx` (items 1, 5, 6, 7), `src/steam.ts` + `src/index.tsx` +
`src/contextMenuPatch.tsx` + `src/log.ts` (item 2), `main.py` (items 2, 4), `run.sh` +
`AGENTS.md` + `orchestration.conf` + `scripts/check_tdd.sh` (item 3), and `tests/` for new
regression coverage (items 2, 4, 7).

**Out of scope:** the native community-feed passthrough, the achievements teardown (already
done), matching *algorithm* redesign beyond fixing the first-pass reliability, and any change
to on-device persisted filenames (`playhub_metadata.json` data file, `playhub-metadata.log`
log file) — those are left as-is to avoid orphaning already-saved on-device data; only the
in-log **bracket prefix** `[playhub:…]` is rebranded, not the log filename.

**Slug used throughout this plan:** `decky-metadata-fixes`

---

## Orchestration Contract

**Slug:** `decky-metadata-fixes`

**Plan file:**

```text
docs/plans/2026-07-02_decky-metadata-fixes.md
```

**Implementation branch:**

```text
feat/decky-metadata-fixes
```

**Round-complete marker:**

```text
/tmp/Playhub-Metadata-local/decky-metadata-fixes_finished
```

**Finalized marker:**

```text
/tmp/Playhub-Metadata-local/decky-metadata-fixes_finalized
```

**Review notes:**

```text
docs/review/decky-metadata-fixes-review-*.md
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
git checkout -b feat/decky-metadata-fixes
```

Commit this plan first:

```bash
git add docs/plans/2026-07-02_decky-metadata-fixes.md
git commit -m "docs(plan): add decky-metadata-fixes implementation plan"
```

---

## Implementation Tasks

Work in order. Run all TypeScript/Python tooling through `./run.sh` so caches stay under the
tmp root. `tsconfig.json` has `strict: false` and no `noUnusedLocals`, so unused symbols will
NOT fail `tsc` — grep to prove a rename left no stragglers. Locate code by the named
symbols/strings, not line numbers (they drift).

### Task 1 — Fix the broken spinner buttons (`src/components.tsx`)

The **Scan metadata** button (`busy`) and **Refresh delisted index** button (`delistedBusy`)
render `<Spinner />` inside `scanSpinnerStyle` (a `1rem` box with `overflow: hidden`) wrapping
`scanSpinnerInnerStyle` (`transform: scale(0.5)`). This scale-and-clip approach renders the
Decky spinner clipped and misaligned.

- Replace the `scale()` + `overflow: hidden` approach with a fixed-size inline wrapper that
  sizes the spinner directly: a wrapper with an explicit small square size (start ~`14px`)
  and `display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto`,
  containing the `<Spinner />` sized to fill it (e.g. width/height `100%`), aligned inline
  with the button label with a small gap. Do not clip via `overflow: hidden`.
- Apply the same corrected wrapper to all three current spinner sites: the Scan button, the
  Refresh-delisted button, and the inline delisted status-line spinner (the `delistedBusy`
  block near the "Clear cached Steam matches…" text). Keep each button `disabled` while its
  busy flag is set (already the case) and keep the button width from jumping when it toggles.
- Remove the now-unused `scanSpinnerInnerStyle` (and `scanSpinnerStyle` if fully replaced) and
  any `activitySpinnerStyle` / `activitySpinnerInnerStyle` that are unreferenced after this
  change (grep first). The exact pixel size is tuned on-device (deferred verification) — pick
  a sensible default now.

### Task 2 — Rename internal `playhub*` identifiers to `decky*`

Rename these four identifier categories. **Each dispatch/registration and its matching
listener/target must change together** or navigation/events break.

- **Route** (`src/index.tsx`): `METADATA_ROUTE = "/playhub-metadata/:appid"` →
  `"/decky-metadata/:appid"`. **And** the navigate target in `src/contextMenuPatch.tsx`
  (`Navigation.Navigate(\`/playhub-metadata/${appId}\`)`) → `/decky-metadata/${appId}`. These
  two must stay identical.
- **Context-menu entry key** (`src/contextMenuPatch.tsx`): `ENTRY_KEY = "playhub-metadata-edit"`
  → `"decky-metadata-edit"`. Update the file-header comment references too.
- **Window events**: rename `"playhub-metadata:updated"` and
  `"playhub-metadata:activity-refreshed"` to `"decky-metadata:updated"` /
  `"decky-metadata:activity-refreshed"` at **every** `dispatchEvent`, `addEventListener`, and
  `removeEventListener` site. These span `src/components.tsx` and `src/steam.ts` — grep
  `playhub-metadata:` across `src/` and change all of them.
- **Backend log-area bracket prefix** (`main.py`, `_plog`): the line building
  `f"[playhub:{area}] {message}{detail}"` → `f"[decky:{area}]…"`. Rename only the bracket
  literal; keep the `area` argument values unchanged. Also update the `[playhub:…]` prefix in
  `src/log.ts` if it carries the same literal, and the stray `/* playhub: … */` comment string
  in `src/steam.ts` for consistency (cosmetic).

Do **not** rename the on-disk data file `playhub_metadata.json` or the log file
`playhub-metadata.log` in `main.py` — renaming the data file would orphan metadata already
saved under the shipped 0.1.0 build. Record this exclusion in the session log.

Verify no functional `playhub` identifier survives:

```bash
grep -rn "playhub-metadata:" src/                    # window events — expect none
grep -rn "/playhub-metadata/" src/                    # route — expect none
grep -rn "playhub-metadata-edit" src/                 # entry key — expect none
grep -rn "\[playhub:" main.py src/                     # log bracket — expect none
grep -rn "playhub_metadata.json\|playhub-metadata.log" main.py   # intentionally KEPT
```

Add/adjust a focused test asserting the backend log prefix is now `[decky:…]` (extend the
existing logging test, e.g. `tests/test_logging.py`, or add one) so the rename is covered.

### Task 3 — Rename tooling/cache-root path strings (repo dir already moved)

The repo working directory was already renamed to `Decky-Metadata` before this run, so you are
already operating from the new path — **do not** rename any directory. This task only updates
in-repo *string* references from the old name/tmp root to the new ones. Target names:
repo/name → `Decky-Metadata`; tmp/cache root → `/tmp/Decky-Metadata`.

- `run.sh`: `CACHE_ROOT=/tmp/Playhub-Metadata-local` → `/tmp/Decky-Metadata`; update the header
  comment text.
- `scripts/check_tdd.sh`: `UV_CACHE_DIR="/tmp/Playhub-Metadata-local/.uv"` →
  `/tmp/Decky-Metadata/.uv`.
- `orchestration.conf`: `ORCH_TMP_ROOT="/tmp/Playhub-Metadata-local"` → `"/tmp/Decky-Metadata"`.
- `AGENTS.md`: every `/tmp/Playhub-Metadata-local` occurrence and any "Playhub" product-name /
  cache-root references → the new name/root (grep `AGENTS.md` for `Playhub` and
  `Playhub-Metadata-local`).
- Sweep for any other non-generated references and update them:

  ```bash
  grep -rnI "Playhub-Metadata-local\|/tmp/Playhub" . \
    | grep -v node_modules | grep -v /dist/ \
    | grep -v docs/plans/ | grep -v docs/review/ | grep -v docs/agent_conversations/
  ```

  Leave historical `docs/plans/`, `docs/review/`, and `docs/agent_conversations/` records
  untouched (they are dated audit history).

**Do NOT** perform any `mv` — not on the (already-renamed) repo directory and not on
`/tmp/Playhub-Metadata-local` — and do NOT change this plan's own baked marker paths (they must
remain `/tmp/Playhub-Metadata-local/...` because this run's live markers still live there; the
`/tmp` dir is moved by the human after merge). Note in the session log that after these string
changes, `./run.sh` will create and use a fresh `/tmp/Decky-Metadata` cache root immediately,
which is expected and harmless.

### Task 4 — Make the first clean-cache scan pass reliable (`main.py`)

**Root-cause first, then fix.** The scan loop is `_scan_missing` → per game:
`_metadata_with_steam_news_sync` (Steam store search) → on miss,
`_resolve_delisted_appid_for_title` (delisted index) → else `_auto_fetch_metadata_sync`. Two
mechanisms plausibly cause a first-pass miss that a rerun fixes; investigate both and fix the
one(s) that apply, recording findings in the session log:

- **Lazy delisted index racing the scan.** `_resolve_delisted_appid_for_title` calls
  `_ensure_delisted_index_sync(False)`, which downloads the index on first use. If that
  download is slow/fails during the first pass, delisted lookups return 0 for that whole pass;
  a later run finds the now-saved index on disk. **Fix:** ensure the delisted index is
  resolved **once up front** at the start of `_scan_missing` (call
  `_ensure_delisted_index_sync` before the loop) so it is not downloaded/raced per game.
- **Transient HTTP failures with no retry.** A single timeout / rate-limit during
  `_metadata_with_steam_news_sync` or the appdetails/store-search fetch marks that game
  failed for the pass (`failed += 1`), and only a rerun retries it. **Fix:** add a bounded
  retry with backoff around the transient network calls in the match path (do not retry a
  genuine "no match" — only network/exception failures), and/or do not count a transient
  network error as a terminal "no match".

Constraints: keep the scan sequential and gentle (no aggressive concurrency that could worsen
rate-limiting); do not change the match *scoring* logic; preserve existing behavior for genuine
non-matches. Add a **regression test** under `tests/` that reproduces the first-pass failure
deterministically (e.g. a fake `_http_json`/`_http_text` that fails the first call for a title
and succeeds on retry, or an unavailable-then-available delisted index) and asserts the game is
matched within a single `_scan_missing` pass. If a single-pass unit test is impractical for one
mechanism, document why in the session log and cover the pre-warm/retry helper directly.

### Task 5 — Make top/bottom QAM content focusable so a controller can scroll (`src/components.tsx`)

`Focusable` is already imported from `@decky/ui`. In the `Content` QAM render:

- Wrap the **top stats block** (the `PanelSectionRow` containing "Detected non-Steam games /
  Metadata saved / Missing metadata") so its content is reachable by gamepad focus — wrap the
  inner content in `<Focusable>` (or make the row focusable) so D-pad up can land on it and the
  panel scrolls to the top.
- Wrap the **bottom Diagnostics/Versions block** (the debug toggle already is focusable, but
  the versions grid below it is not) so D-pad down can focus it and scroll the panel to reveal
  the full versions panel.
- Do not disturb the existing `FocusableButton`s in between or change their tab order in a way
  that traps focus. Keep the visual layout unchanged (a `<Focusable>` wrapper is layout-neutral).
  On-device controller navigation is deferred verification.

### Task 6 — Improve the Versions panel styling (`src/components.tsx`)

Rework the three Diagnostics "Versions" rows (Plugin / Delisted index / Metadata) so they read
cleanly instead of cramped:

- Give the rows more vertical breathing room and clearer label/value separation (adjust
  `diagnosticsGridStyle` gap and `diagnosticsRowStyle`); for long values (the delisted status)
  prefer label-above-value stacking or a clear wrap rather than a tight right-aligned collision.
- Drop the redundant `"Metadata saved: "` prefix inside the row already labelled **Metadata**
  (show just the count). Keep the **Plugin** row showing `PLUGIN_VERSION` and the **Delisted
  index** row showing the delisted status text.
- Reuse existing style constants where possible; keep it consistent with the rest of the panel.
  Final visual polish is confirmed on-device (deferred verification).

### Task 7 — Clear the scan status on completion (`src/components.tsx`)

In `scanMissing`, the poll interval sets `setScanMessage(progress.current || progress.message
|| \`${completed}/${total}\`)` every tick but never resets it when `!progress.running`. Result:
after completion the status row keeps the last per-game line (often "No metadata match for
…"/a non-match).

- When the interval detects completion (`!progress.running`), after `refresh()` and
  `setBusy(false)`, set `scanMessage` to a terminal summary (e.g. a short "Scan complete"
  or an assigned/total summary from the final `progress`) or clear it — so the stale per-game
  line does not persist. Ensure the `{busy || scanMessage ? … : null}` status row reflects the
  terminal state, not the last mid-scan line.
- Apply the same terminal-state clear to `refreshActivities` (`activityMessage`) only if it has
  the identical sticky-status defect; otherwise leave it and note the decision in the session
  log. Add/adjust a frontend or logic-level assertion if practical; otherwise document why in
  the session log and rely on the on-device check.

### Task 8 — Rebuild the bundle and record the session log

- Rebuild the committed artifact: `./run.sh npm run build` (regenerates `dist/index.js`) and
  stage `dist/` (it is tracked).
- Record a session summary under `docs/agent_conversations/2026-07-02_decky-metadata-fixes.md`
  per `AGENTS.md` §9: per-item what changed, the Task 4 root-cause findings and which
  mechanism(s) were fixed, the intentionally-kept on-disk filenames (Task 2), and the deferred
  on-device checks.

### Scope discipline

Bugfix/polish/rename only. Do not touch the community-feed passthrough, the (already removed)
achievements code, matching *scoring*, or on-device persisted filenames. Do not perform the
physical directory `mv` (Task 3). If a symbol you expected to rename has a consumer you cannot
see, keep it and note it in the session log rather than breaking a listener/route pair.

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

Automated (run via `./run.sh` so caches stay under the tmp root):

```bash
./run.sh npx tsc --noEmit                       # no type errors
./run.sh npm run build                          # dist/index.js regenerated
./run.sh python3 -m py_compile main.py          # backend byte-compiles
./run.sh uv run --with pytest -- pytest -q       # full backend suite incl. new tests
scripts/orchestration/run-quality-gates
git status --short                               # clean
```

Grep gates — identifier rename complete, on-disk names intentionally kept, tooling repointed:

```bash
# Item 2 — no functional playhub identifier remains in code:
grep -rn "playhub-metadata:\|/playhub-metadata/\|playhub-metadata-edit" src/    # expect none
grep -rn "\[playhub:" main.py src/                                              # expect none
# Item 2 — persisted filenames intentionally still present:
grep -rn "playhub_metadata.json\|playhub-metadata.log" main.py                 # expect present
# Item 3 — tooling repointed, no stray old cache-root strings (excluding dated docs):
grep -rnI "/tmp/Playhub-Metadata-local" run.sh scripts/check_tdd.sh orchestration.conf AGENTS.md   # expect none
```

Static review of the built `Content` (Gaming Mode is not available in this environment — read
the diff):

- Item 1: Scan / Refresh-delisted spinners use a fixed-size wrapper (no `scale()` / clipping
  `overflow: hidden`); the removed `*SpinnerInnerStyle` constants are gone.
- Item 5: the top stats block and bottom Diagnostics/Versions block are wrapped in
  `<Focusable>`.
- Item 6: the Versions rows have clearer spacing and no redundant "Metadata saved:" prefix.
- Item 7: `scanMissing` sets a terminal status (or clears `scanMessage`) on completion.
- Item 4: `_scan_missing` resolves the delisted index once before the loop and/or retries
  transient network failures; the new regression test matches a first-pass-miss game within a
  single pass.

### Deferred verification — on-device (cannot run here)

Rebuild from `dev`, uninstall the old plugin if present, sideload, then confirm in Gaming Mode:

1. Item 1: the Scan metadata and Refresh delisted index buttons show a clean, correctly sized
   spinner while running (not clipped/misaligned).
2. Item 5: with a controller you can scroll from the top stats all the way to the bottom
   Versions panel — no content is unreachable.
3. Item 6: the Versions panel reads cleanly (not smooshed).
4. Item 7: after a metadata scan finishes, the status line shows a terminal state (e.g. "Scan
   complete"), not the last per-game non-match line.
5. Item 4: on a freshly cleared cache, a single Scan metadata pass matches the games that
   previously required a second run (spot-check a delisted title and a normal title).
6. Item 2: the context-menu entry ("Decky metadata…") still opens the metadata page (route
   rename applied on both ends), and Steam Activity refresh still updates the UI (window-event
   rename applied on dispatch + listeners); plugin logs now show `[decky:…]` prefixes.

### Deferred verification — human, AFTER this plan merges to `dev` (remaining `/tmp` move)

Already done before this run (do NOT redo): the repo working directory was renamed to
`Decky-Metadata` and the Claude session/history + `~/.claude.json` per-project config were
migrated to the new path. Only the `/tmp` cache root remains, performed by the human outside
the orchestration loop because this run's live markers still live under the old `/tmp` path:

1. Once no orchestration run is using it, retire the old cache root:
   `mv /tmp/Playhub-Metadata-local /tmp/Decky-Metadata` (or simply let `./run.sh` recreate a
   fresh `/tmp/Decky-Metadata` and delete `/tmp/Playhub-Metadata-local` when convenient).
2. If you keep an `orchestration.conf.local`, confirm it does not re-pin the old
   `ORCH_TMP_ROOT`. Future orchestration runs then use `/tmp/Decky-Metadata` from the updated
   `orchestration.conf`.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished decky-metadata-fixes
```

This writes:

```text
/tmp/Playhub-Metadata-local/decky-metadata-fixes_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer decky-metadata-fixes`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/decky-metadata-fixes-review-*.md
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
   scripts/orchestration/clear-finished decky-metadata-fixes
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
   git add docs/review/decky-metadata-fixes-review-*.md
   git commit -m "docs(review): record decky-metadata-fixes review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished decky-metadata-fixes
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer decky-metadata-fixes` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed decky-metadata-fixes
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize decky-metadata-fixes
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Playhub-Metadata-local/decky-metadata-fixes_finalized
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
scripts/orchestration/finalize decky-metadata-fixes
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Playhub-Metadata-local/decky-metadata-fixes_finished
/tmp/Playhub-Metadata-local/decky-metadata-fixes_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
