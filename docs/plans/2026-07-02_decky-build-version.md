# Plan: Embed git short-hash in the QAM plugin version (SDH-Ludusavi style) (decky-build-version)

## Context

Decky Metadata (Decky Loader plugin: TS/React `src/*` bundled by rollup to `dist/index.js`,
single-file Python backend `main.py`, packaged by `scripts/package.mjs`) currently shows a
**hard-coded** plugin version in the QAM: `export const PLUGIN_VERSION = "0.1.0"` in
`src/components.tsx`, rendered in the Diagnostics "Versions" → **Plugin** row. Because it is a
literal baked into the bundle, there is no way to tell *which build* is installed on the Deck
from the panel.

We want to replicate how the reference plugin **`beallio/SDH-Ludusavi`** tracks build identity
locally, so the **short git commit hash** appears in the QAM Versions panel.

### How SDH-Ludusavi does it (studied from its source — mirror this design)

1. `package.json` and `plugin.json` each hold a **base version** (e.g. `1.5.0`) and must match
   (`scripts/package_plugin.py` → `validate_package_versions`).
2. At **package time**, for a **local/dev build** it runs `git rev-parse --short HEAD` and
   forms `version = f"{base}+{hash}"` (e.g. `1.5.0+a1b2c3d`); a `--release`/no-hash build uses
   just `base`. See `package_plugin.py` `_get_git_hash` + `build_plugin_zip`.
3. It writes that combined `version` **into the copies of `plugin.json`/`package.json` placed
   in the zip** (`archive.writestr(...)`) — **the working-tree files are never modified**.
4. At **runtime** the backend reads its own `plugin.json` version
   (`py_modules/sdh_ludusavi/_version.py` searches upward for `plugin.json`), exposes it via a
   `get_versions` callable, and the QAM **Versions** panel displays it
   (`VersionsSection` → `SDH-Ludusavi: {versions.sdh_ludusavi}`).

So the hash flows: packager writes `base+hash` into the zip's JSON → backend reads that JSON at
runtime → callable returns it → QAM renders it. No bundle rebuild is needed to change the hash,
and unpackaged dev checkouts simply show the base version (no hash), which is expected.

### What this plan implements (the same, adapted to Decky Metadata's stack)

- **Backend** (`main.py`): a runtime version reader (locate `plugin.json` beside `main.py`,
  read its `version`, fall back to `package.json` then a literal) exposed as a new
  `get_plugin_version` callable — mirroring `_version.py` + `get_versions`.
- **Frontend** (`src/backend.ts`, `src/components.tsx`): call it and render the runtime version
  in the **Plugin** Versions row instead of the hard-coded `PLUGIN_VERSION` const.
- **Packager** (`scripts/package.mjs`): compute the short hash and inject `base+hash` into the
  zip's `plugin.json` + `package.json` (dev), with a `--release`/`--no-hash` flag for a clean
  base version — replacing the current verbatim `copyFileSync` of those two files. This builds
  on the just-landed change where `npm run package` builds first, so the bundle is always fresh.

### Relevant files

`main.py` (version reader + callable), `src/backend.ts` (callable binding), `src/components.tsx`
(runtime version in the Plugin row), `scripts/package.mjs` (hash injection + version-match
validation), `tests/` (packager version-injection coverage), `dist/index.js` (rebuilt),
`README.md` + `docs/agent_conversations/`.

**Out of scope:** bumping the base version, an update-checker/auto-update, and any styling
change beyond the two Versions rows described below. Do not modify `src/steam.ts`. (The zip
filename **is** in scope for this revision — it gains the hash; see Task 3.)

**Slug used throughout this plan:** `decky-build-version`

---

## Orchestration Contract

**Slug:** `decky-build-version`

**Plan file:**

```text
docs/plans/2026-07-02_decky-build-version.md
```

**Implementation branch:**

```text
feat/decky-build-version
```

**Round-complete marker:**

```text
/tmp/Decky-Metadata/decky-build-version_finished
```

**Finalized marker:**

```text
/tmp/Decky-Metadata/decky-build-version_finalized
```

**Review notes:**

```text
docs/review/decky-build-version-review-*.md
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
git checkout -b feat/decky-build-version
```

Commit this plan first:

```bash
git add docs/plans/2026-07-02_decky-build-version.md
git commit -m "docs(plan): add decky-build-version implementation plan"
```

---

## Implementation Tasks

Work in order. Run TS/Python tooling through `./run.sh`. Locate code by symbol, not line
number. Follow TDD where testable (the packager change is testable via pytest — see Task 4).

### Task 1 — Backend: runtime plugin-version reader + `get_plugin_version` callable (`main.py`)

Mirror SDH-Ludusavi's `_version.py` + `get_versions`, adapted to this single-file backend.

- Add a module-level helper that resolves the plugin version **at runtime**:
  - Locate the plugin root by searching upward from `Path(__file__).resolve()` for a directory
    containing `plugin.json` (cap the walk at ~5 levels); `plugin.json` sits beside `main.py`
    at the plugin root, and in the packaged layout under `Decky Metadata/`.
  - Read `version` (a non-empty string) from `plugin.json`; if absent/unreadable, fall back to
    `package.json`'s `version`; if both fail, fall back to a literal base constant
    (define `PLUGIN_BASE_VERSION = "0.1.0"` in `main.py`, kept in sync with the JSON files).
  - Never raise — wrap file/JSON access in try/except and return the fallback on any error
    (use the existing `_plog`/logger to note a failure at debug level; do not log secrets).
- Expose it as `async def get_plugin_version(self) -> str:` on the `Plugin` class (place it near
  `get_platform_capabilities`/`get_state`). It returns the resolved version string
  (e.g. `"0.1.0+a1b2c3d"` for a packaged dev build, `"0.1.0"` for an unpackaged checkout or a
  release build).

### Task 2 — Frontend: show the runtime version in the QAM (`src/backend.ts`, `src/components.tsx`)

- In `src/backend.ts`, add the binding next to the other callables:
  `export const getPluginVersion = callable<[], string>("get_plugin_version");`
- In `src/components.tsx`:
  - Keep `PLUGIN_VERSION` as an initial fallback constant, but stop treating it as the source of
    truth for display. Add state `const [pluginVersion, setPluginVersion] = useState(PLUGIN_VERSION);`
    and load the real value once on mount (in a `useEffect`, call `getPluginVersion()` and
    `setPluginVersion(...)`; guard against errors — on failure keep the fallback).
  - **Show base and commit as two separate Versions rows** (the requested tweak). Parse the
    runtime version string on the first `"+"`: the part before it is the base, the part after is
    the short commit hash.
    - **Plugin** row → the base (e.g. `0.1.0`).
    - **Commit** row (new, placed directly under Plugin) → the short hash (e.g. `a1b2c3d`). When
      there is no `"+"` (unpackaged dev checkout or a `--release` build), show a clear
      placeholder such as `"local"` or `"—"` rather than an empty value.
  - Add a tiny pure helper (e.g. `splitVersion(v): { base: string; commit: string | null }`) so
    the parse is testable by `tsc`'s types and reusable. Keep the existing `diagnosticsRowStyle`/
    `diagnosticsValueStyle`; the new Commit row uses the same styles as the Plugin row. Do not
    alter the Delisted-index or Metadata rows.

### Task 3 — Packager: inject `base+shorthash` into the zip JSON (`scripts/package.mjs`)

Currently `package.mjs` copies `package.json` and `plugin.json` **verbatim** via
`copyFileSync` (the `files` array + `copyIntoStaging`). Change so those two files are
**read, version-rewritten, and written** into the staging/zip, leaving the working tree
untouched (mirror the fork's `archive.writestr` approach):

- Read the base version from `package.json`. **Validate** that `plugin.json`'s version equals
  `package.json`'s version; if they differ, throw with a clear message (mirror
  `validate_package_versions`). This keeps the two in sync.
- Compute the short hash with `child_process.execSync("git rev-parse --short HEAD")`
  (trim, ascii). Tolerate failure (not a git checkout / git missing) by treating the hash as
  absent.
- Determine the packaged version:
  - default (dev): `version = hash ? \`${base}+${hash}\` : base`;
  - if invoked with `--release` (or `--no-hash`) in `process.argv`: `version = base`.
- When staging `package.json` and `plugin.json`, instead of `copyFileSync`, parse the source
  JSON, set `data.version = version`, and write the serialized JSON to the staging path (so the
  zipped copies carry the combined version). All other files continue to copy verbatim.
- **Do not modify the working-tree `package.json`/`plugin.json`.** Only the staged/zipped copies
  get the combined version. After packaging, `git status` must be clean.
- **Put the version (with hash) in the zip filename** (the requested tweak):
  `Decky-Metadata_${version}_Installer.zip` — so a dev build is
  `Decky-Metadata_0.1.0+a1b2c3d_Installer.zip` and a `--release` build is
  `Decky-Metadata_0.1.0_Installer.zip`. This makes each build visibly distinct on disk (directly
  addressing the "is the zip actually new?" problem). `+` is a valid filename character on
  SteamOS/Linux. `fs.rmSync(zipPath, { force: true })` still clears a stale same-named build.
- Print the resolved version alongside the zip path so the dev sees the hash that was baked.

### Task 4 — Tests (TDD via pytest — it is in the quality gate)

The frontend gate is only `tsc` + build (no JS test runner), but the **packager is testable**
and the existing `tests/package_mjs_test.mjs` may not be wired into the pytest gate. Add
coverage that the gate actually runs:

- Add a **pytest** (e.g. `tests/test_package_version.py`) that, in a temp copy of the repo (or
  by invoking `node scripts/package.mjs` at the repo root into a temp output), runs the packager
  and asserts:
  - the zip's `Decky Metadata/plugin.json` and `.../package.json` `version` equals
    `"{base}+{shorthash}"` where `shorthash` matches `git rev-parse --short HEAD` (dev build);
  - the **zip filename** contains that combined version (dev build);
  - with `--release`/`--no-hash`, both the injected version and the zip filename use exactly
    `{base}` (no `+`);
  - the working-tree `plugin.json`/`package.json` are **unchanged** after packaging.
  Skip gracefully (pytest `skip`) if `node` or `git` is unavailable in the environment, and note
  that in the test.
- **Update `tests/package_mjs_test.mjs`** (it currently asserts the fixed name
  `Decky-Metadata_${version}_Installer.zip`): with the versioned filename a dev build now
  includes `+<hash>`, so adjust its expectation accordingly (match the `+<hash>` form, or run the
  packager with `--release` for the fixed-name assertion). Do not leave it asserting a name the
  new scheme never produces. The authoritative coverage must still be the pytest so the quality
  gate enforces it.
- Optionally add a focused backend test that `get_plugin_version` returns the `plugin.json`
  version (point the reader at a temp plugin root) — reuse the existing conftest `FakeDecky`
  pattern if practical; otherwise note why in the session log.

### Task 5 — Rebuild bundle, docs, session log

- `./run.sh npm run build` to regenerate `dist/index.js` (frontend changed); stage `dist/`.
- Update `README.md` where it documents packaging/version (note that local `npm run package`
  builds now include `+<shorthash>` in the plugin version shown in the QAM, and `--release`
  omits it).
- Record `docs/agent_conversations/2026-07-02_decky-build-version.md` per `AGENTS.md` §9: the
  SDH-Ludusavi mechanism mirrored, the runtime-read design, the packager injection + version
  validation, the stable zip filename decision, and any deferred on-device check.

### Scope discipline

Feature = version fingerprint only. Do NOT bump the base version, add an update checker, touch
`src/steam.ts`, or restyle the panel beyond adding the single Commit row. The zip filename and
the two Versions rows are the intended changes. The working tree must stay clean after packaging
(hash injection is zip-only).

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
./run.sh npx tsc --noEmit                       # no type errors
./run.sh npm run build                          # dist/index.js regenerated
./run.sh python3 -m py_compile main.py          # backend byte-compiles
./run.sh uv run --with pytest -- pytest -q       # full suite incl. new packager/version tests
scripts/orchestration/run-quality-gates
git status --short                               # clean (before AND after packaging)
```

Packager behaviour (manual sanity):

```bash
npm run package                                  # dev build
# -> prints version 0.1.0+<shorthash>; zip name is Decky-Metadata_0.1.0+<shorthash>_Installer.zip
zip=$(ls Decky-Metadata_0.1.0+*_Installer.zip)   # the versioned dev zip
unzip -p "$zip" "Decky Metadata/plugin.json"  | grep '"version"'   # 0.1.0+<shorthash>
unzip -p "$zip" "Decky Metadata/package.json" | grep '"version"'   # 0.1.0+<shorthash>
git status --short                               # expect clean (no working-tree version change)
node scripts/package.mjs --release               # release -> version + name use exactly 0.1.0
```

Grep/scope gates:

```bash
grep -nE "get_plugin_version" main.py src/backend.ts            # backend method + binding present
grep -nE "getPluginVersion|pluginVersion" src/components.tsx    # runtime version wired into panel
git diff --name-only dev..HEAD -- src/steam.ts                  # expect empty (untouched)
```

Static review of the diff:

- Task 1: `main.py` has a never-raising version reader (plugin.json → package.json → base
  literal) and a `get_plugin_version` callable.
- Task 2: the QAM shows two rows — **Plugin** = base, **Commit** = short hash (or `local`/`—`
  when absent) — loaded via `getPluginVersion` on mount, not the hard-coded const.
- Task 3: `package.mjs` computes `git rev-parse --short HEAD`, validates plugin.json ==
  package.json version, writes `base+hash` (dev) / `base` (`--release`) into the zip's JSON only,
  and names the zip with that version — working tree unchanged.
- Task 4: a pytest asserts the injected version, the versioned zip filename, and the untouched
  working tree; `package_mjs_test.mjs` updated for the new filename.

### Deferred verification — on-device (cannot run here)

Rebuild from `dev`, `npm run package`, uninstall the old plugin, install the fresh zip via
Decky **Developer Mode** (the zip is now named `Decky-Metadata_0.1.0+<shorthash>_Installer.zip`),
then in the QAM Versions panel confirm the **Plugin** row reads `0.1.0` and the new **Commit**
row reads `<shorthash>` matching `git rev-parse --short HEAD` of the packaged commit — so the
installed build is positively identifiable.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished decky-build-version
```

This writes:

```text
/tmp/Decky-Metadata/decky-build-version_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer decky-build-version`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/decky-build-version-review-*.md
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
   scripts/orchestration/clear-finished decky-build-version
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
   git add docs/review/decky-build-version-review-*.md
   git commit -m "docs(review): record decky-build-version review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished decky-build-version
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer decky-build-version` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed decky-build-version
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize decky-build-version
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Decky-Metadata/decky-build-version_finalized
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
scripts/orchestration/finalize decky-build-version
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Decky-Metadata/decky-build-version_finished
/tmp/Decky-Metadata/decky-build-version_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
