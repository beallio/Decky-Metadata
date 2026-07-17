# Plan: Reattribute authorship to beallio and acknowledge the fork (debrand-authorship)

## Context

Decky Metadata is a fork of the `LoZazaMastro/Playhub-Metadata` Decky plugin (original
author byline **"ZazaMastro"**). The code and product are fully rebranded to **Decky
Metadata**, but authorship metadata and a few stale `Playhub` strings still credit/name the
original project. The current maintainer is **beallio**.

**Intended outcome:**

1. Author fields identify **beallio** as the maintainer of this fork.
2. The `NOTICE` file gains an explicit, respectful **fork acknowledgment** crediting the
   upstream project (`LoZazaMastro/Playhub-Metadata`, author "ZazaMastro"), and stops calling
   this project by its old name.
3. `README.md` credits the fork origin in its License & Credits section.
4. **Windows packaging is removed entirely** — this is a Linux/SteamOS-focused plugin. Delete
   the PowerShell packaging script and the `package:win` npm script, and remove Windows
   platform claims from the docs.
5. Remaining stale `Playhub` strings in dev tooling are updated to `Decky Metadata` /
   `Decky-Metadata`.

This is a **docs/metadata/tooling-only** change. No TypeScript or Python **runtime** code
changes; `dist/` is unaffected (do not rebuild — nothing in `src/` changes). The packaged
plugin's *displayed* author changes only because the manifests change.

### Exact changes (surveyed)

| File | What | Change |
| --- | --- | --- |
| `plugin.json` | `"author"` | `"ZazaMastro"` → `"beallio"` |
| `package.json` | `"author"` | `"ZazaMastro"` → `"beallio"` |
| `package.json` | `"package:win"` script | **remove the line** |
| `package-win.ps1` | whole file | **`git rm` (delete)** |
| `NOTICE` | project-name sentence | "the entire **Playhub Metadata** project" → "the entire **Decky Metadata** project" + new fork-acknowledgment block |
| `README.md` | License & Credits | add fork-acknowledgment paragraph |
| `README.md` | "Supported platforms" line | drop "Windows Steam Big Picture and " → "**Supported platforms**: SteamOS / Steam Deck via Decky Loader." |
| `AGENTS.md` | line ~11 | "a **Decky Loader plugin** for Steam Big Picture on Windows" → "a **Decky Loader plugin** for SteamOS / Steam Deck (Steam Gaming Mode)" |
| `.envrc` | 1–4 | `/tmp/Playhub-Metadata-local` → `/tmp/Decky-Metadata` |
| `scripts/orchestration-hooks/finalize-release` | comments (8–9, 19) | drop `Playhub` + all `package-win.ps1`/Windows mentions |

Locate each by its surrounding text/symbol, not by absolute line number.

**Out of scope (do NOT change) — and why:**
- **`main.py` Windows runtime code** (`_read_windows_steam_path`, `_windows_powershell_executable`,
  `_http_text_powershell`, `is_windows`, Windows `User-Agent` strings) and its tests
  (`tests/test_platform_capabilities.py`, `tests/test_shortcuts_vdf.py`,
  `tests/fixtures/shortcuts/windows.json`). Removing functional platform-compat code is a
  behavior change with test impact — a **separate plan**, not this reference/packaging cleanup.
  Note it in the session log as recommended follow-up; do NOT touch it here.
- `src/types.ts` (`is_windows` field) and `src/steam.ts` (`WindowStore` — that is Steam's
  internal window store, unrelated to the OS). Leave untouched.
- `LICENSE` — GPL-3.0 boilerplate, no author/copyright line.
- Archival docs: `docs/plans/playhub-metadata-steamos-native-spec.md`,
  `docs/specs/steamos-native-gap-analysis.md`, and everything under `docs/review/` — historical
  provenance/audit records; leave as-is.
- `dist/` — build artifact; nothing in `src/` changes, so do not rebuild or restage it.

**Slug used throughout this plan:** `debrand-authorship`

---

## Orchestration Contract

**Slug:** `debrand-authorship`

**Plan file:**

```text
docs/plans/2026-07-03_debrand-authorship.md
```

**Implementation branch:**

```text
feat/debrand-authorship
```

**Round-complete marker:**

```text
/tmp/Decky-Metadata/debrand-authorship_finished
```

**Finalized marker:**

```text
/tmp/Decky-Metadata/debrand-authorship_finalized
```

**Review notes:**

```text
docs/review/debrand-authorship-review-*.md
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
git checkout -b feat/debrand-authorship
```

Commit this plan first:

```bash
git add docs/plans/2026-07-03_debrand-authorship.md
git commit -m "docs(plan): add debrand-authorship implementation plan"
```

---

## Implementation Tasks

Work in order. This is a text-edit task — no `./run.sh`, no build, no tests to add.

### Task 1 — Author fields → beallio

- `plugin.json`: set `"author": "beallio"`.
- `package.json`: set `"author": "beallio"`.
- Change nothing else in either file **except** the `package:win` script removal in Task 4.
  Keep JSON valid (no trailing commas). Verify with
  `node -e "JSON.parse(require('fs').readFileSync('plugin.json'))"` and the same for `package.json`.

### Task 2 — NOTICE: rename + fork acknowledgment

- In `NOTICE`, change the sentence "Because that file is a derivative work, the entire
  **Playhub Metadata** project is distributed under…" to say **"the entire Decky Metadata
  project"**. Leave the surrounding GPL/BSD attribution wording intact.
- Add a new acknowledgment block to `NOTICE` (place it near the top, after the Decky Plugin
  Template block, or as its own clearly-titled section). Use this text verbatim:

  ```text
  Fork acknowledgment
  -------------------
  Decky Metadata is a fork of the Playhub Metadata plugin. Full credit and thanks to
  the original author (ZazaMastro) and contributors of the upstream project:

      Playhub Metadata
      https://github.com/LoZazaMastro/Playhub-Metadata

  This fork is maintained by beallio. It remains distributed under the GNU General
  Public License v3.0 or later; the upstream project's license terms are preserved.
  ```

### Task 3 — README License & Credits

- In `README.md`, under `## License & Credits`, add a paragraph acknowledging the fork.
  Place it as the first credit after the license sentence. Use this text:

  ```markdown
  Decky Metadata is a fork of [Playhub Metadata](https://github.com/LoZazaMastro/Playhub-Metadata)
  by ZazaMastro, and is maintained by beallio. Full credit and thanks to the original
  author and contributors.
  ```

- Do not remove the existing Decky Plugin Template or decky-steamgriddb credit paragraphs.

### Task 4 — Remove Windows packaging + de-brand tooling

Windows packaging is dropped — this is a Linux/SteamOS-focused plugin.

- **Delete `package-win.ps1`** with `git rm package-win.ps1`.
- **`package.json`**: remove the `"package:win"` script line entirely. Leave `build`, `watch`,
  `package`, and `package:linux` intact. Fix the preceding line's trailing comma so the JSON
  stays valid (the scripts object must not end with a dangling comma). Verify by parsing.
- **`README.md`** "Supported platforms" line → `**Supported platforms**: SteamOS / Steam Deck
  via Decky Loader.` (drop the Windows Big Picture claim). If any other README sentence markets
  Windows specifically, neutralize it to SteamOS / Steam Gaming Mode; keep generic "Steam Big
  Picture / Gaming Mode" UI wording.
- **`AGENTS.md`**: opening line "a **Decky Loader plugin** for Steam Big Picture on Windows" →
  "a **Decky Loader plugin** for SteamOS / Steam Deck (Steam Gaming Mode)". Only that platform
  phrasing; leave the rest of AGENTS.md unchanged.
- **`.envrc`**: replace the `/tmp/Playhub-Metadata-local` layout with the `/tmp/Decky-Metadata`
  layout used by `run.sh`: `TMPDIR=/tmp/Decky-Metadata`,
  `XDG_CACHE_HOME=/tmp/Decky-Metadata/.cache`, `npm_config_cache=/tmp/Decky-Metadata/.npm`,
  `PYTHONPYCACHEPREFIX=/tmp/Decky-Metadata/__pycache__`.
- **`scripts/orchestration-hooks/finalize-release`**: in the **comments only**, drop the
  `Playhub` name and every `package-win.ps1` / Windows / pwsh mention — e.g. the line-8 comment
  becomes "Decky Metadata has no automated release pipeline: a release is a manual rollup build
  + Decky package zip." and the `# npm run package …` comment becomes
  "# npm run package        # -> Decky plugin zip (scripts/package.mjs)". Do not change any
  executable command in the hook.

### Task 5 — Session log

- Record `docs/agent_conversations/2026-07-03_debrand-authorship.md`: the reattribution to
  beallio, the NOTICE/README fork acknowledgment, the **removal of Windows packaging**
  (Linux/SteamOS-focused plugin), the tooling cleanup, and the explicitly-preserved items —
  LICENSE, archival spec/gap-analysis/review docs, and the **`main.py` Windows runtime code
  left for a separate future plan**.

### Scope discipline

Docs/metadata/tooling only. Do NOT touch `src/`, **`main.py` (including its Windows runtime
code)**, `dist/`, `LICENSE`, the archival `docs/plans/playhub-metadata-steamos-native-spec.md`
/ `docs/specs/steamos-native-gap-analysis.md`, or anything under `docs/review/`. No build, no
rebuild of `dist/`. The only source-tree deletion is `package-win.ps1`.

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

Text/JSON checks (no build):

```bash
# Author fields updated, JSON still valid:
node -e "const p=require('./plugin.json'); if(p.author!=='beallio') throw 'plugin.json author'; console.log('plugin.json OK')"
node -e "const p=require('./package.json'); if(p.author!=='beallio') throw 'package.json author'; console.log('package.json OK')"

# No stale author/brand references remain in the in-scope files:
grep -rniI "ZazaMastro" plugin.json package.json                       # expect NONE
grep -niI "Playhub" NOTICE README.md .envrc scripts/orchestration-hooks/finalize-release  # expect NONE

# Windows packaging removed:
test ! -e package-win.ps1 && echo "package-win.ps1 gone"              # deleted
grep -niI "package:win\|package-win" package.json                      # expect NONE
grep -niI "Windows" README.md AGENTS.md scripts/orchestration-hooks/finalize-release  # expect NONE

# Fork acknowledgment landed:
grep -niI "fork" NOTICE README.md                                       # present in both
grep -niI "beallio" NOTICE README.md plugin.json package.json       # present

# Scope guard — untouched files (main.py Windows runtime code deliberately NOT changed here):
git diff --name-only dev..HEAD -- src main.py dist LICENSE docs/review docs/plans/playhub-metadata-steamos-native-spec.md docs/specs/steamos-native-gap-analysis.md  # expect EMPTY

scripts/orchestration/run-quality-gates                                 # still green (no src change)
git status --short                                                      # clean
```

Static review:

- Author is `beallio` in both manifests; JSON valid.
- `NOTICE` no longer says "Playhub Metadata" as this project's name and carries the fork
  acknowledgment crediting ZazaMastro / the upstream repo; GPL/BSD attribution intact.
- `README.md` credits the fork origin without dropping template/steamgriddb credits.
- Tooling strings de-branded; `.envrc` paths match `run.sh`'s `/tmp/Decky-Metadata`.
- `src/`, `main.py`, `dist/`, `LICENSE`, and the archival spec are untouched.

### Deferred verification — none

Docs/metadata only; nothing to test on-device. The next `dev`/`main` commit's post-commit
hook will package a zip whose `plugin.json` shows `author: beallio`.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished debrand-authorship
```

This writes:

```text
/tmp/Decky-Metadata/debrand-authorship_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer debrand-authorship`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/debrand-authorship-review-*.md
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
   scripts/orchestration/clear-finished debrand-authorship
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
   git add docs/review/debrand-authorship-review-*.md
   git commit -m "docs(review): record debrand-authorship review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished debrand-authorship
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer debrand-authorship` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed debrand-authorship
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize debrand-authorship
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Decky-Metadata/debrand-authorship_finalized
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
scripts/orchestration/finalize debrand-authorship
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Decky-Metadata/debrand-authorship_finished
/tmp/Decky-Metadata/debrand-authorship_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
