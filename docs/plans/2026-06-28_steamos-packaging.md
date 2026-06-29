# Plan: SteamOS: cross-platform Node packager (steamos-packaging)

## Context

`npm run package` currently invokes PowerShell via `package-win.ps1`, so SteamOS/Linux
contributors cannot build a Decky-installable ZIP natively. This plan adds a Node-based
packager that runs on Windows, Linux, and SteamOS and produces the **same** Decky plugin
ZIP layout the PowerShell script produces, while keeping the PowerShell path available.

Key facts (verify before relying on them):

- `package-win.ps1` stages a folder literally named `Playhub Metadata/` containing
  `main.py`, `package.json`, `plugin.json`, `LICENSE`, optional `NOTICE`, `dist/index.js`,
  and optional `dist/index.js.map`, then `Compress-Archive`s it into
  `Playhub-Metadata_<version>_Installer.zip`. It also builds a separate `_Project.zip`.
- This repo builds with **npm** (not pnpm — pnpm is not installed). `node`, `npm`, `npx`
  are available. The bundle output is `dist/index.js` (committed) produced by `rollup -c`.
- `*.zip` is already in `.gitignore`.
- Node has no built-in ZIP writer. Do **not** add an npm dependency for packaging and do
  **not** rely on a system `zip` binary being present. Write the archive with a small,
  dependency-free ZIP writer built on `node:zlib` (deflate) — see tasks.
- This plan file is already committed on base branch `main`; if "commit this plan first"
  finds nothing to commit, that is expected — continue.

**Slug used throughout this plan:** `steamos-packaging`

---

## Orchestration Contract

**Slug:** `steamos-packaging`

**Plan file:**

```text
docs/plans/2026-06-28_steamos-packaging.md
```

**Implementation branch:**

```text
feat/steamos-packaging
```

**Round-complete marker:**

```text
/tmp/Playhub-Metadata-local/steamos-packaging_finished
```

**Finalized marker:**

```text
/tmp/Playhub-Metadata-local/steamos-packaging_finalized
```

**Review notes:**

```text
docs/review/steamos-packaging-review-*.md
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
3. Branch from `main`.
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

Start from `main`:

```bash
git checkout main
git pull --ff-only origin main
git checkout -b feat/steamos-packaging
```

Commit this plan first:

```bash
git add docs/plans/2026-06-28_steamos-packaging.md
git commit -m "docs(plan): add steamos-packaging implementation plan"
```

---

## Implementation Tasks

1. **Create `scripts/package.mjs`** — an ESM, dependency-free Node script (Node ≥18)
   that:
   - resolves the repo root from `import.meta.url`; reads `version` from `package.json`.
   - verifies `dist/index.js` exists; if missing, exit non-zero with a message telling
     the user to run `npm run build` first (the packager must not silently ship a stale
     or missing bundle).
   - creates a clean staging dir `build-package/` under the repo root. Before deleting it,
     assert the resolved staging path is inside the resolved repo root (replicate the
     `package-win.ps1` safety guard so it can never delete outside the repo).
   - creates `build-package/Playhub Metadata/` and a `dist/` subfolder, and copies, using
     only forward-slash archive paths:
     `main.py`, `package.json`, `plugin.json`, `LICENSE`, `dist/index.js`, plus
     `NOTICE` and `dist/index.js.map` **only if they exist**.
   - writes `Playhub-Metadata_<version>_Installer.zip` to the **repo root** (not the
     parent directory — keep all artifacts inside the repo; `*.zip` is gitignored).
   - implements a minimal ZIP writer using `node:zlib.deflateRawSync` with correct local
     file headers, a central directory, and an end-of-central-directory record; entry
     names must keep the `Playhub Metadata/...` prefix with forward slashes and store the
     uncompressed size and CRC-32 for each entry. (CRC-32: implement the standard table-based
     algorithm; do not pull a dependency.)
   - prints the absolute path of the ZIP it wrote.

2. **Update `package.json` scripts** to:
   ```json
   "package": "node ./scripts/package.mjs",
   "package:linux": "node ./scripts/package.mjs",
   "package:win": "powershell -NoProfile -ExecutionPolicy Bypass -File ./package-win.ps1"
   ```
   Keep `build` and `watch` unchanged. Do not remove `package-win.ps1`.

3. **Leave `package-win.ps1` unchanged** — it remains the Windows-parity path via
   `npm run package:win`.

4. **`.gitignore`**: add `build-package/` (the staging dir). `*.zip` is already ignored;
   do not duplicate it.

5. **README**: add a short "Building on Linux / SteamOS" subsection showing
   `npm install`, `npm run build`, `npm run package`, and noting the installer ZIP name
   and that `npm run package:win` preserves the PowerShell path.

6. Record a session summary under `docs/agent_conversations/` per `AGENTS.md` §9.

Scope note: do not modify `main.py` or `src/` in this plan.

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

Run on this Linux host and confirm:

```bash
npm ci                 # lockfile-exact; never `npm install` (respects pinned versions)
npm run build
npm run package
ls -1 Playhub-Metadata_*_Installer.zip
unzip -l Playhub-Metadata_*_Installer.zip
```

Expected `unzip -l` entries (all under the `Playhub Metadata/` prefix):

- `Playhub Metadata/plugin.json`
- `Playhub Metadata/main.py`
- `Playhub Metadata/package.json`
- `Playhub Metadata/dist/index.js`
- `Playhub Metadata/LICENSE`
- `Playhub Metadata/NOTICE` (present, since this repo has a NOTICE file)
- `Playhub Metadata/dist/index.js.map` (present if the build emitted a sourcemap)

Also confirm the quality gate passes:

```bash
scripts/orchestration/run-quality-gates
git status --short   # clean; no build-package/ or *.zip tracked
```

Deferred verification (state explicitly in the session log, do not attempt here):
installing the generated ZIP through Decky Loader sideload on real SteamOS / Steam Deck
hardware. This requires a device and is part of the SteamOS integration-testing phase.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished steamos-packaging
```

This writes:

```text
/tmp/Playhub-Metadata-local/steamos-packaging_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer steamos-packaging`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/steamos-packaging-review-*.md
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
   scripts/orchestration/clear-finished steamos-packaging
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
   git add docs/review/steamos-packaging-review-*.md
   git commit -m "docs(review): record steamos-packaging review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished steamos-packaging
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer steamos-packaging` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed steamos-packaging
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize steamos-packaging
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Playhub-Metadata-local/steamos-packaging_finalized
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
scripts/orchestration/finalize steamos-packaging
```

Do not manually merge into `main` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Playhub-Metadata-local/steamos-packaging_finished
/tmp/Playhub-Metadata-local/steamos-packaging_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
