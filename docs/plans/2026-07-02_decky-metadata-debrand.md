# Plan: Decky Metadata full de-brand and Ludusavi-style spinner (decky-metadata-debrand)

## Context

Decky Metadata (a Decky Loader plugin: TypeScript/React `src/*` bundled by rollup to
`dist/index.js`, plus a single-file Python backend `main.py`) was rebranded from "Playhub
Metadata". A prior round (`decky-metadata-fixes`, already merged to `dev`) renamed the
**functional** identifiers (route, context-menu entry key, window events, `[decky:]` log
prefix) but **deliberately left** ~270 internal `playhub*` symbols in `src/steam.ts`, the two
persisted on-disk filenames, and the outbound User-Agent. The product owner has now decided
those remaining references must go: **the codebase must contain zero `playhub` references.**

This plan does two things:

1. **Full de-brand** — rename every remaining `playhub*` identifier to the `decky*`
   equivalent: all internal symbols in `src/steam.ts` (function names, CSS class names, DOM
   element IDs, `data-playhub-*` attributes, `__playhubNative*`/`PLAYHUB_*` window-global keys
   and constants, and the `"playhub_metadata"` activity-type tag strings), the persisted data
   file `playhub_metadata.json` and log file `playhub-metadata.log` in `main.py`, and the
   `PlayhubMetadata/0.1` outbound `User-Agent`. **Clean break** on the persisted files: no
   migration of existing on-device 0.1.0 data — the product owner accepts that devices running
   0.1.0 lose their saved matches and re-scan to repopulate.
2. **Match the SDH-Ludusavi spinner styling** — the current Scan / Refresh-delisted buttons
   use a from-scratch fixed-size Decky `<Spinner>` wrapper. Replace it with SDH-Ludusavi's
   pattern: a **rotating react-icons icon** (a CSS `@keyframes` rotation applied to the icon
   while busy), laid out in a flex row (`display:flex; align-items:center; gap`) with the
   label — no Decky `<Spinner>` component.

### Relevant files

`src/steam.ts` (the bulk of the rename), `main.py` (data/log filenames + User-Agent),
`src/components.tsx` (spinner rework), `dist/index.js` (rebuilt artifact), and `tests/` for
adjusted/added coverage (backend filename assertions).

**Out of scope:** matching *algorithm*/scoring, the community-feed passthrough *behavior*
(only its internal identifier names change — the passthrough must keep working), and any
change to the *functional* identifiers already renamed last round (route, entry key, window
events, log bracket) beyond leaving them as `decky*`.

**Critical constraint — paired producer/consumer.** Most `playhub*` symbols in `steam.ts`
come in matched pairs that MUST rename together or the community-feed overlay / activity
passthrough silently breaks: a CSS class string in an injected `<style>` ↔ the `className`
that uses it; a DOM `id`/`data-*` string ↔ every `getElementById`/`querySelector`/
`setAttribute`/`removeAttribute`/`closest` that reads it; a `PLAYHUB_*_WINDOW_KEY` constant ↔
the `globalThis[...]` accesses; the `"playhub_metadata"` tag ↔ any consumer that matches it.
Rename by symbol, not by line, and grep to prove every pair moved.

**Slug used throughout this plan:** `decky-metadata-debrand`

---

## Orchestration Contract

**Slug:** `decky-metadata-debrand`

**Plan file:**

```text
docs/plans/2026-07-02_decky-metadata-debrand.md
```

**Implementation branch:**

```text
feat/decky-metadata-debrand
```

**Round-complete marker:**

```text
/tmp/Decky-Metadata/decky-metadata-debrand_finished
```

**Finalized marker:**

```text
/tmp/Decky-Metadata/decky-metadata-debrand_finalized
```

**Review notes:**

```text
docs/review/decky-metadata-debrand-review-*.md
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
git checkout -b feat/decky-metadata-debrand
```

Commit this plan first:

```bash
git add docs/plans/2026-07-02_decky-metadata-debrand.md
git commit -m "docs(plan): add decky-metadata-debrand implementation plan"
```

---

## Implementation Tasks

Work in order. Run all TS/Python tooling through `./run.sh` so caches stay under the tmp
root. `tsconfig.json` has `strict:false` and no `noUnusedLocals`, so unused/renamed symbols
will NOT fail `tsc` — you must **grep** to prove a rename left no stragglers and broke no
producer/consumer pair. Locate code by symbol/string, not line numbers.

### Task 1 — Rename every internal `playhub*` identifier in `src/steam.ts` to `decky*`

`src/steam.ts` contains ~270 `playhub`/`Playhub`/`PLAYHUB` references. Rename **all** of them
to the corresponding `decky`/`Decky`/`DECKY` form, preserving casing style and word
boundaries. Do it in these grouped passes, and after each pass grep to confirm both sides moved:

- **Function / const / variable names** (identifiers, no string impact): e.g.
  `PlayhubActivityNewsOverlay`→`DeckyActivityNewsOverlay`,
  `makePlayhubNativeActivity`→`makeDeckyNativeActivity`,
  `refreshPlayhubNativeActivityForApp`→`refreshDeckyNativeActivityForApp`,
  `playhubNativeActivityCache`→`deckyNativeActivityCache`,
  `isPlayhubPatchNoteActivity`, `normalizePlayhubSteamActivityType`,
  `playhubSteamActivityType{Label,Tags}`, `isPlayhubCommunityId`, `playhubActivityId`,
  `registerPlayhubNativePartnerEventInSteamStore`, `clonePlayhubNativePartnerEventForRoute`,
  `playhubNativePartnerEvent*`, `shouldReplacePlayhubNativeNewsPush`,
  `isPlayhubNativeNewsRouteState`, the `PlayhubNativeActivityDay` type, and every other
  `*Playhub*` identifier. Rename the declaration and all references together.
- **`PLAYHUB_*` constants** — rename the identifier (`PLAYHUB_HIDE_APP_LINKS_CLASS`,
  `PLAYHUB_HIDE_APP_LINKS_STYLE_ID`, `PLAYHUB_SUPPORTED_STEAM_ACTIVITY_TYPES`,
  `PLAYHUB_STEAM_ACTIVITY_TYPE_{LABELS,TAGS}`, `PLAYHUB_NATIVE_ACTIVITY_WINDOW_KEY`,
  `PLAYHUB_NATIVE_PARTNER_EVENTS_WINDOW_KEY`, `PLAYHUB_NATIVE_PARTNER_STORE_WINDOW_KEY`) to
  `DECKY_*` **and** change their **string values** (see next two bullets).
- **CSS class names, DOM ids, and `data-*` attribute strings** (paired!): rename the literal
  `playhub-...`/`__playhub...`/`data-playhub-...` strings and EVERY consumer. Concretely:
  - `playhub-activity-news-*` class/id strings (`-root`, `-overlay`, `-style`, `-day`,
    `-card`, `-card-focused`, `-content`, `-kind`, `-title`, `-summary`, `-image`,
    `-image-fallback`, `-update-icon`, `-debug`, `-react-image-fallback`) →
    `decky-activity-news-*`. Update the injected `<style>` CSS text, all `className`/`id`
    assignments, `getElementById(...)`, `document.querySelector*`, and `.closest("#..., [data-...]")`.
  - `data-playhub-activity-news`, `data-playhub-activity-empty-hidden`, `data-playhub-appid`,
    `data-playhub-mount`, `data-playhub-source`, `data-playhub-integrated`,
    `data-playhub-activity-news-card` → `data-decky-*`. Update every `setAttribute`,
    `removeAttribute`, `getAttribute`, `[data-...]` selector, and JSX prop.
  - CSS custom properties `--playhub-activity-news-*` → `--decky-activity-news-*` (both the
    `setProperty(...)` calls and the `var(--playhub-...)` references in the `<style>` text).
  - `playhub-hide-applinks` / `playhub-hide-applinks-style` string values → `decky-hide-applinks*`.
- **Window-global key VALUES**: the string values assigned to the `*_WINDOW_KEY` constants
  and the ad-hoc `__playhub*` globals (`__playhubNativeActivityCache`,
  `__playhubNativePartnerEvents`, `__playhubNativePartnerEventStore`,
  `__playhubActivityOverlayOwner`, `__playhubNativeActivityPatched`,
  `__playhubNativePartnerEventsPatched`, `__playhubActivityPatched`,
  `__playhubActivityOriginal`, `__playhubAppLinksHider`, `__playhubNavRedirect`,
  `__playhubMainWindowHistoryRedirect`, `__playhubClickTrace`, `__playhubNavTrace`,
  `__playhubHistoryInstanceTrace`, `__playhubNativeNewsOpenedWithReplaceAt`) → `__deckyNative...`
  etc. Because these are read back via the same string/identifier, changing both sides keeps
  them consistent; there is no persistence, so no migration is needed.
- **Activity-type tag strings**: in `PLAYHUB_STEAM_ACTIVITY_TYPE_TAGS` (renamed to
  `DECKY_...`), the tag literal `"playhub_metadata"` → `"decky_metadata"`. Grep `steam.ts`
  (and the rest of `src/`) for any consumer that matches that tag literal and rename it too.
- **Comment strings** mentioning "Playhub" → "Decky Metadata" (cosmetic, but part of "zero
  references").

The i18n label `"Notizie"` and other non-`playhub` strings are unrelated — do not touch them.

After the rename, prove completeness:

```bash
grep -rniI "playhub" src/          # expect ZERO matches
```

### Task 2 — Rename persisted filenames and User-Agent in `main.py` (clean break)

- `self._data_file = self._settings_dir / "playhub_metadata.json"` → `"decky_metadata.json"`.
- `log_path = log_dir / "playhub-metadata.log"` → `"decky-metadata.log"`.
- `"User-Agent": "PlayhubMetadata/0.1 (+Decky Loader)"` → `"DeckyMetadata/0.1 (+Decky Loader)"`.

**Clean break, no migration** (product-owner decision): do NOT add code to detect/rename an
existing `playhub_metadata.json`/`playhub-metadata.log`. Devices on the shipped 0.1.0 build
will simply start a fresh `decky_metadata.json` and re-scan. Record this explicit decision and
its data-loss implication in the session log.

Update any test that asserts the old filenames/User-Agent to the new values (grep `tests/` for
`playhub_metadata.json`, `playhub-metadata.log`, `PlayhubMetadata`). If no test currently
asserts the data-file name, add a focused backend test asserting `_data_file` ends with
`decky_metadata.json` so the clean-break rename is covered.

Prove completeness:

```bash
grep -rniI "playhub" main.py       # expect ZERO matches
```

### Task 3 — Match the SDH-Ludusavi spinner styling (`src/components.tsx`)

Reference pattern (from `GedasFX/decky-ludusavi`): a **rotating icon**, not Decky's
`<Spinner>`. Ludusavi injects a keyframe and toggles a class on the icon element while busy:

```css
.dls-rotate { animation: dlsrotate 1s infinite cubic-bezier(0.46, 0.03, 0.52, 0.96); }
@keyframes dlsrotate { from { transform: rotate(0deg); } to { transform: rotate(359deg); } }
```

and lays out icon + label in a flex row (`display:flex; align-items:center; gap:0.5em`).

Apply the same approach here (adapted to this plugin's `FocusableButton` — keep the existing
button component and its `disabled`-while-busy behavior; do NOT switch to `ButtonItem` or
change tab order):

- `react-icons@^5.3.0` is already a dependency and already used in `src/index.tsx`
  (`FaDatabase`). Import a suitable spinner-ish icon from `react-icons/fa`
  (e.g. `FaSyncAlt` / `FaCircleNotch`) for the rotating indicator, and any static leading icon
  you want when idle (optional; matching Ludusavi, the same icon can spin only while busy).
- Add a rotation keyframe + class once (a module-level injected `<style>` in the component
  tree, or a small style element rendered inside `Content` — keep it injected exactly once,
  guard by id like Ludusavi's `.dls-rotate`). Name the class/keyframe with a `decky-` prefix
  (e.g. `.decky-spin` / `@keyframes decky-spin`) — no `playhub`.
- Replace the current `<Spinner>`-based helpers (`InlineSpinner`, `SpinnerLabel`,
  `smallSpinnerStyle`, `spinnerIconStyle`, `spinnerLabelStyle`, `ButtonLabel`) with the
  rotating-icon approach: a flex row (`align-items:center; gap`) containing the rotating icon
  (spins only while the busy flag is set) + label. Apply to all three current spinner sites:
  the **Scan** button, the **Refresh delisted index** button, and the inline `delistedBusy`
  status-line indicator. Keep button width stable when toggling busy↔idle (retain a min-width
  or equivalent so the label swap doesn't jump).
- Remove the now-unused `Spinner` import from `@decky/ui` if nothing else uses it (grep first),
  and remove any now-dead style constants (grep to confirm unreferenced before deleting).

The exact icon choice and pixel size are on-device deferred verification; pick sensible
defaults (icon ~`14–16px`, `gap:0.5em`) consistent with Ludusavi.

### Task 4 — Rebuild the bundle and record the session log

- `./run.sh npm run build` to regenerate `dist/index.js`; stage `dist/` (tracked). Confirm the
  built bundle also contains zero functional `playhub` strings for the renamed identifiers
  (`grep -c "playhub" dist/index.js` should be 0, or only inside unrelated vendored text — aim
  for 0).
- Record a session summary under `docs/agent_conversations/2026-07-02_decky-metadata-debrand.md`
  per `AGENTS.md` §9: the full-de-brand scope, the **clean-break / no-migration** decision and
  its data-loss implication (Task 2), the Ludusavi spinner approach adopted (Task 3), and the
  deferred on-device checks.

### Scope discipline

Rename + spinner-restyle only. Preserve all observable behavior except the two intended
changes: (a) new on-disk filenames (clean break) and (b) the spinner visual. Do not alter the
community-feed passthrough logic, matching/scoring, or the already-renamed functional
identifiers. If a `playhub*` symbol has a consumer you cannot see, rename both together or, if
truly unresolvable, keep it and record why in the session log rather than breaking a pair.

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
./run.sh uv run --with pytest -- pytest -q       # full backend suite incl. updated tests
scripts/orchestration/run-quality-gates
git status --short                               # clean
```

Grep gates — zero remaining `playhub` references, new filenames present:

```bash
grep -rniI "playhub" src/ main.py                # expect ZERO matches
grep -rn "decky_metadata.json\|decky-metadata.log" main.py   # expect present
grep -c "playhub" dist/index.js                  # expect 0
```

Static review of the built `Content` (Gaming Mode not available here — read the diff):

- Task 1: no `playhub` symbol/string survives in `src/steam.ts`; renamed CSS-class/id/`data-*`
  literals match their consumers (spot-check a few pairs, e.g. `decky-activity-news-root` id is
  both assigned and read back; each `*_WINDOW_KEY` value matches its `globalThis` access).
- Task 2: `_data_file` → `decky_metadata.json`, log → `decky-metadata.log`, User-Agent →
  `DeckyMetadata/0.1`; no migration code was added.
- Task 3: the three spinner sites use a rotating react-icons icon (keyframe class, no Decky
  `<Spinner>`), laid out in a flex row with the label; button width stays stable on toggle.

### Deferred verification — on-device (cannot run here)

Rebuild from `dev`, uninstall the old plugin, sideload, then confirm in Gaming Mode:

1. Task 3: the Scan metadata and Refresh delisted index buttons show a smoothly rotating icon
   while running (Ludusavi-style), correctly sized and aligned with the label.
2. Task 1: the community-feed / Steam Activity passthrough still works — the native activity
   overlay renders, and Activity refresh still updates the UI (all renamed CSS/DOM/window-key
   pairs still resolve). The context-menu entry still opens the metadata page.
3. Task 2: a fresh scan writes `decky_metadata.json`; a device previously on 0.1.0 shows an
   empty metadata set until re-scanned (expected clean-break consequence).

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished decky-metadata-debrand
```

This writes:

```text
/tmp/Decky-Metadata/decky-metadata-debrand_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer decky-metadata-debrand`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/decky-metadata-debrand-review-*.md
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
   scripts/orchestration/clear-finished decky-metadata-debrand
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
   git add docs/review/decky-metadata-debrand-review-*.md
   git commit -m "docs(review): record decky-metadata-debrand review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished decky-metadata-debrand
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer decky-metadata-debrand` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed decky-metadata-debrand
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize decky-metadata-debrand
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Decky-Metadata/decky-metadata-debrand_finalized
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
scripts/orchestration/finalize decky-metadata-debrand
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Decky-Metadata/decky-metadata-debrand_finished
/tmp/Decky-Metadata/decky-metadata-debrand_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
