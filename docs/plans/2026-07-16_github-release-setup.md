# Plan: Prepare Repository for GitHub Publication and Release Automation (github-release-setup)

## Context

Decky Metadata is developed entirely locally and has **no git remote** (`git
remote -v` is empty) and no CI. Releases are a manual local flow: bump both
metadata files with `scripts/set_release_version.py`, commit, `git tag vX.Y.Z`,
build the hash-free zip with `node scripts/package.mjs --release`, then move the
dev base forward with `scripts/bump_next_patch.sh`. The README already documents
that flow and already embeds three screenshots, but they are hosted on
`github.com/user-attachments/...` CDN URLs (line-referenced in `README.md`) that
only exist because they were once drag-dropped into a GitHub issue/PR — they are
not reproducible from this checkout and break in forks.

Make the repository ready to publish to GitHub with an automated release path.
The confirmed decisions for this plan are:

- **Distribution:** GitHub Releases only. A tagged stable release publishes the
  hash-free `Decky-Metadata.zip` as a downloadable asset. No Decky-store
  (`decky-plugin-database`) submission in this plan.
- **Automation:** GitHub Actions. One CI workflow runs the existing quality gate
  on pull requests and branch pushes; one release workflow builds and publishes
  the zip — a **stable** channel on `v*.*.*` tags and a **dev/prerelease**
  channel for `dev`-branch builds.
- **Screenshots:** committed into the repo under `assets/`, referenced by
  relative paths. Capture is on-device via the Deck CDP tooling — which today has
  **no** pixel-screenshot command (`scripts/deck/cdp.py` exposes only
  list/eval/reload/wait-ready/input; `scripts/deck/steamui.sh snapshot` captures
  the DOM, not pixels), so a `Page.captureScreenshot` helper must be added first.
- **Remote:** the implementer creates the GitHub repository **private** and pushes.
  `gh` is authenticated (account `beallio`, ssh); resolve the owner from
  `gh api user --jq .login` so the remote is `<login>/Decky-Metadata`. The repo
  starts private so publication/visibility stays a later human decision.

Two steps depend on external state that may be unavailable in the implementer's
environment and are therefore **hard gates**, following the established on-device
pattern in `docs/plans/2026-07-16_reorganize-qam-panels.md`: capturing screenshots
requires a reachable Deck, and creating/pushing the remote requires working `gh`
auth. If either is unavailable, stop cleanly, report the exact blocker, and do
**not** mark the round complete or claim readiness on partial evidence.

### Execution permissions (explicit grant)

You have **explicit, standing permission** for this plan to run `gh` (GitHub CLI:
`gh auth status`, `gh api`, `gh repo view`, `gh repo create`, `gh release`) and to
reach the Steam Deck over SSH via the committed `scripts/deck/*` tooling (which
uses the `steamdeck` ssh host, an SSH tunnel to the CEF debugger on
`localhost:18081`, `scp`/`rsync` deploys, and `curl` to the tunnel). These commands
need network access and may need to write outside the repository workspace (e.g.
`~/.ssh/known_hosts` or an SSH control socket under `~/.ssh`, and `gh`/git state
under `~/.config`). **You are authorized to escalate these specific commands
outside the local sandbox as needed** — request escalated/elevated permissions for
them rather than treating a sandbox denial as a hard blocker. This grant is scoped
to `gh`, the `scripts/deck/*` SSH/deploy tooling, and the git push in Task 9; it is
**not** permission to push `dev`, promote to `main`, cut a public release, or flip
the repo to public — those remain out of scope per Tasks 8–9 and stay human gates.
A genuine environment failure (no Deck on the network, `gh` not authenticated) is
still a hard gate: stop and report it. Sandbox restriction alone is not — escalate
and proceed.

Primary surfaces: new `.github/workflows/ci.yml` and `.github/workflows/release.yml`;
a `Page.captureScreenshot` addition to `scripts/deck/cdp.py` (plus a thin
`scripts/deck/screenshot.sh` wrapper); new committed images under `assets/`; a new
`scripts/release.sh`; `README.md` (badges, install-from-Releases, relative image
links); light community-health files under `.github/`; a focused Python test file;
`AGENTS.md` (the now-obsolete `cacheBuster` guidance and the new remote/release
notes); and a session summary under `docs/agent_conversations/`. The existing local
release scripts (`set_release_version.py`, `bump_next_patch.sh`, `version_guard.py`,
`scripts/package.mjs`) keep working unchanged; the drift guard in
`scripts/orchestration-hooks/quality-gates` must stay green. The plugin's runtime
behavior (frontend `src/`, backend `main.py`/`backend/`, `dist/index.js`) is **out
of scope** — no product code changes.

**Slug used throughout this plan:** `github-release-setup`

---

## Orchestration Contract

**Slug:** `github-release-setup`

**Plan file:**

```text
docs/plans/2026-07-16_github-release-setup.md
```

**Implementation branch:**

```text
feat/github-release-setup
```

**Round-complete marker:**

```text
/tmp/Decky-Metadata/github-release-setup_finished
```

**Finalized marker:**

```text
/tmp/Decky-Metadata/github-release-setup_finalized
```

**Review notes:**

```text
docs/review/github-release-setup-review-*.md
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
git checkout -b feat/github-release-setup
```

Commit this plan first:

```bash
git add docs/plans/2026-07-16_github-release-setup.md
git commit -m "docs(plan): add github-release-setup implementation plan"
```

---

## Implementation Tasks

Do the tasks in order. Tasks 1–7 are fully automatable and must be committed
before the two gated tasks (8 screenshots, 9 remote). If a gate blocks, everything
in 1–7 is still committed and the round simply is not marked complete.

1. **Baseline and inventory.**
   - From the repository root, output the AGENTS.md protocol handshake, then run
     `./run.sh scripts/decky doctor` and
     `./run.sh scripts/orchestration/run-quality-gates` and confirm the tree is
     green before changing anything. Diagnose any pre-existing failure rather than
     retrying blindly.
   - Re-read `README.md`, `scripts/package.mjs`, `scripts/set_release_version.py`,
     `scripts/bump_next_patch.sh`, `scripts/version_guard.py`,
     `scripts/orchestration-hooks/quality-gates`, `scripts/deck/cdp.py`,
     `scripts/deck/steamui.sh`, and `plugin.json`/`package.json`. Note the current
     base version (`0.3.0`) and that `.gitignore` ignores `*.zip` (keep the
     packaged zip out of git) but does not ignore images.

2. **Add a real screenshot capability to the Deck CDP tooling.**
   - Add a `screenshot` subcommand to `scripts/deck/cdp.py` that calls the CDP
     `Page.captureScreenshot` method (reuse the existing
     `find_target`/`target_socket`/`rpc` machinery — do not add a new transport or
     dependency; stdlib only, consistent with the rest of the file). It takes an
     output path argument, requests `format: "png", fromSurface: true,
     captureBeyondViewport: false` explicitly, checks the RPC response for an
     `error` field and fails clearly on it, base64-decodes the
     `result.data` payload, and writes the PNG bytes to that path.
   - The default target **must be the visual composited page**
     `DEFAULT_INPUT_TARGET` = `"Steam Big Picture Mode"` (the same title the UI-
     driving subcommands and `scripts/deck/js/*` use), **not** `SharedJSContext`,
     which is the non-visual JS context and would capture nothing useful. Allow an
     explicit target-title override as the other subcommands do. Fail with a
     clear non-zero error if the target is not found or the RPC returns no data.
   - Add a thin `scripts/deck/screenshot.sh` wrapper (mirroring the style of
     `scripts/deck/steamui.sh`) that resolves the tunnel/host like the sibling
     scripts, takes an output PNG path, and shells into `cdp.py screenshot`. All
     captures write under the `/tmp/Decky-Metadata` cache root contract used by the
     other deck scripts; never write captures inside the Dropbox tree (the copy
     into `assets/` happens later, in Task 8, after visual approval).
   - Add a focused pytest for the pure, testable part only: extract the
     base64→bytes decode-and-validate step into a small pure helper in `cdp.py`
     and unit-test it in `tests/test_cdp_screenshot.py` (valid base64 → exact
     bytes; empty/`None` payload → raises a clear error). Do not attempt to test
     the live CDP socket. Write the test red first, save the red output under
     `/tmp/Decky-Metadata/`, then implement to green.

3. **Add the CI workflow (`.github/workflows/ci.yml`).**
   - Trigger on `pull_request` and on `push` to `dev` and `main`. Single job on
     `ubuntu-latest`. Set job-level `permissions: contents: read` (CI needs no
     write scope).
   - Checkout with **`fetch-depth: 0`** so `git tag -l` is populated — otherwise
     `scripts/version_guard.py check-drift` reads an empty tag list and passes
     vacuously.
   - Steps: checkout; set up Node with `actions/setup-node` pinned to **Node 22**
     (`package.json` declares no `engines`, and current Vitest requires a modern
     Node), `npm ci`; install `uv` via `astral-sh/setup-uv` and set up Python;
     then run the **same checks the local quality gate runs**, mirroring
     `scripts/orchestration-hooks/quality-gates` exactly: `npx tsc --noEmit`,
     `npm run build`, `npm test`, `python -m py_compile main.py`, the **recursive**
     backend compile `find backend -name "*.py" -print0 | xargs -0 python -m
     py_compile` (a `backend/*.py` glob misses `backend/providers/*.py` and any
     nested module — do not use a flat glob), `uv run --with pytest -- pytest -q`,
     and the drift guard `python scripts/version_guard.py check-drift "$(node -p
     "require('./package.json').version")"`.
   - Do **not** run any on-device / Deck script (`scripts/decky verify-change`,
     `scripts/deck/*`, `scripts/decky doctor --deck`) in CI — those require a
     physical Deck and must never run on a GitHub runner.
   - Assert `dist/index.js` is up to date: after `npm run build`, run
     `git diff --exit-code dist/index.js` so a stale committed bundle fails CI.

4. **Add the release workflow (`.github/workflows/release.yml`) with stable and dev channels.**
   Grant `contents: write` only on the release jobs (CI stays read-only). Add a
   top-of-file comment documenting the tag/branch contract. Keep the two channels
   in one file split by an `if:` on the trigger so the build logic is written once.
   - **Stable channel:** trigger on pushed tags matching `v[0-9]+.[0-9]+.[0-9]+`.
     Check out the tag, set up Node 22, `npm ci`, `npm run build`, `node
     scripts/package.mjs --release` (hash-free zip; the script already enforces
     that `package.json` and `plugin.json` versions match). Verify the built
     version equals the tag with the leading `v` stripped and fail on mismatch.
     Create a **non-prerelease** GitHub Release for the tag and upload
     `Decky-Metadata.zip` as its asset (`softprops/action-gh-release`, or
     `gh release create "$TAG" Decky-Metadata.zip` with the workflow
     `GITHUB_TOKEN`).
   - **Dev channel:** trigger on `push` to `dev` and on `workflow_dispatch`. This
     job must be correct about the rolling `dev` prerelease — the naive
     "delete release, `gh release create dev`" recreates the tag on the default
     branch and races concurrent runs. Specify precisely:
     1. Add a workflow `concurrency:` group (e.g. `group: dev-release`,
        `cancel-in-progress: true`) so overlapping `dev` pushes serialize.
     2. Build fully first: `npm ci`, `npm run build`, `node scripts/package.mjs`
        (no `--release`, so the zip carries the `+<shorthash>` version).
     3. Point the rolling `dev` tag at the triggering commit and publish the
        prerelease in one step by passing the target SHA explicitly, e.g.
        `gh release create dev Decky-Metadata.zip --prerelease --target
        "$GITHUB_SHA" --title "Dev build (<shorthash>)" --notes "..."` when the
        `dev` release does not yet exist, and when it does, move the tag to
        `$GITHUB_SHA` and refresh the asset (`gh release upload dev
        Decky-Metadata.zip --clobber`, and update the tag ref via `git push origin
        "$GITHUB_SHA:refs/tags/dev" --force` or `gh release edit dev --target
        "$GITHUB_SHA"`). Never create the `dev` tag without an explicit
        `--target`, or it will point at the wrong commit.
     4. Keep it marked `prerelease: true` and keep a single `Decky-Metadata.zip`
        asset. Note in a comment that `--clobber` deletes the previous asset before
        uploading the replacement (a brief window with no asset is acceptable for a
        prerelease channel).

5. **Add `scripts/release.sh` to drive push-based stable releases safely.**
   - `scripts/release.sh <X.Y.Z>` wraps the existing scripts and enforces this
     repo's established stable-release sequence (set version on the release
     branch, merge to `main` `--no-ff`, tag the merge, package `--release`, then
     `bump_next_patch.sh`) rather than inventing a new one. It must **guard**
     before doing anything irreversible:
     1. Validate the argument against the same `X.Y.Z` semver shape the other
        scripts enforce; refuse anything else.
     2. Require a **clean working tree** (`git status --porcelain` empty).
     3. Require that tag `vX.Y.Z` does **not** already exist.
     4. Run the full quality gate (`scripts/orchestration/run-quality-gates`) and
        abort on failure.
   - Then it runs `scripts/set_release_version.py <X.Y.Z>`, commits both metadata
     files (`release: vX.Y.Z`), and creates the **annotated** tag `vX.Y.Z` on the
     release commit. It must **not** auto-push — pushing a tag is an outward-facing
     action that triggers the stable release workflow, so the script instead
     **prints** the exact follow-up: the `git push origin main` + `git push origin
     vX.Y.Z` commands, and the reminder to run `scripts/bump_next_patch.sh`
     afterward so the drift guard stays green. Document (in the header/`--help`)
     that the tagged commit is expected to be on `main` per the established
     dev→main→tag→next-patch flow.
   - Make it executable (`chmod +x`) and consistent with the existing bash scripts
     (`set -euo pipefail`, repo-root resolution).
   - Document the dev channel in this script's header and in the README: dev builds
     publish automatically on every push to `dev` via the release workflow; no
     manual step is needed.

6. **Rehost screenshots as committed assets and rewrite the README.**
   - Create an `assets/` directory. It will hold the committed PNG screenshots
     produced in Task 8. Add a short `assets/README.md` (or a comment) naming each
     expected image and what it depicts so the set is self-documenting.
   - In `README.md`, replace the three `github.com/user-attachments/...` `<img>`
     tags with relative-path images under `assets/` (keep descriptive alt text).
     Remove the `?cacheBuster=` query approach — versioned committed files do not
     need it.
   - Add an **Install from Releases** subsection at the top of Installation:
     download the latest `Decky-Metadata.zip` from the repo's Releases page and
     sideload it via Decky; keep the existing build-from-source instructions
     below it. Reference the `dev` prerelease as the testing channel.
   - Add status badges at the top (License GPL-3.0, latest release, CI status)
     using shields.io URLs parameterized by the `<owner>/Decky-Metadata` slug;
     because the repo is private initially these may not render for anonymous
     viewers — that is acceptable and noted. Preserve all existing content,
     including the License & Credits section and all upstream attributions.

7. **Add lightweight community-health files and update contributor docs.**
   - Add `CONTRIBUTING.md` (required) that points at the AGENTS.md contract, the
     quality gate (`scripts/orchestration/run-quality-gates`), and the local +
     tagged release flow, plus a `.github/pull_request_template.md`. Issue
     templates (`.github/ISSUE_TEMPLATE/bug_report.md`,
     `feature_request.md`) are optional polish — include lean versions if quick,
     otherwise defer them. Keep all of these concise; do not invent policies
     beyond what AGENTS.md and the existing scripts already establish.
   - Update `AGENTS.md` §7: the `cacheBuster` guidance for README image URLs is
     obsolete now that images are committed under `assets/` — replace it with the
     committed-assets convention, and add a brief note that stable releases are
     cut with `scripts/release.sh` + a pushed tag (CI publishes the Release) and
     that dev builds publish automatically from the `dev` branch.
   - Add `tests/test_release_assets.py` (write red first, save red output under
     `/tmp/Decky-Metadata/`, then green): assert every image path referenced by
     `README.md` resolves to a committed file under `assets/`; assert `README.md`
     contains **no** remaining `user-attachments` URL; and assert
     `package.json` and `plugin.json` versions are equal (guarding the invariant
     `scripts/package.mjs` enforces at build time). Keep this stdlib-only (regex
     over the README text and `json.load`); do not add a YAML parser dependency —
     if you assert anything about the workflows, do it with plain text
     `in`-checks on the file contents.

8. **[GATE: reachable Deck] Capture the real Gaming Mode screenshots.**
   - Confirm the Deck is reachable first: `./run.sh scripts/decky doctor --deck`
     and `./run.sh scripts/deck/wait_online.sh` (be aware doctor may falsely
     report offline per the project runbook — confirm via an actual deploy/CDP
     round-trip before deciding). If the Deck is genuinely unreachable, **stop**:
     do not fabricate images, do not mark the round complete, and report the
     blocker per the Verification section.
   - Deploy the current plugin build to the Deck using the committed workflow
     (`./run.sh scripts/deck/deploy.sh`; use `scripts/deck/package_push.sh` +
     Decky-UI install if a backend/full-plugin install is needed).
   - Using the new `scripts/deck/screenshot.sh`, drive the UI (open the QAM
     Decky Metadata panels; open a matched non-Steam game's metadata editor from
     its context menu; open the Steam Activity news area for a matched shortcut)
     and capture PNGs matching the README's three existing images: the QAM panels,
     the metadata editor, and the activity news. Captures land under the
     `/tmp/Decky-Metadata` cache root (never write directly into the Dropbox tree
     from the capture tool). Recapture until each image clearly shows the described
     feature.
   - **Visually approve** each capture, then explicitly copy the approved PNGs from
     `/tmp/Decky-Metadata/...` into `assets/` with the stable descriptive
     filenames the README references (Task 6). This copy is the only step that
     writes images into the repo tree.
   - Commit the PNGs. Confirm they are not caught by `.gitignore` and that
     `tests/test_release_assets.py` now passes against the real files.

9. **[GATE: working `gh` auth] Create the private remote and push.**
   - Confirm auth: `gh auth status`. If it fails, **stop** and report the blocker;
     do not attempt an unauthenticated create/push.
   - Resolve the owner: `owner="$(gh api user --jq .login)"` (expected `beallio`).
   - Create the repository private and idempotently: if
     `gh repo view "$owner/Decky-Metadata"` fails, run
     `gh repo create "$owner/Decky-Metadata" --private --source=. --remote=origin
     --disable-wiki`. Do not enable Pages or make it public.
   - Push **only** `main`, all `v*` tags, and the current
     `feat/github-release-setup` branch (with upstream tracking). **Do not push
     `dev`.** Rationale: this branch is not yet merged, so pushing `dev` now would
     (a) publish a remote `dev` that lacks this work and (b) immediately trigger
     the dev-prerelease release workflow against pre-merge code. Because
     orchestration `finalize` merges `feat → dev` **locally only**
     (`ORCH_PUSH=0`), the correct first `dev` push happens **after** this plan
     finalizes.
   - Record explicitly in the session log that these remain post-finalization
     human steps: pushing the merged `dev` (which triggers the first dev
     prerelease), the `dev → main` promotion, the visibility flip to public, and
     cutting the first tagged stable Release via `scripts/release.sh`. CI will run
     on `main`/`dev` pushes and on pull requests; the feature-branch push alone
     does not match the CI triggers, so verify CI by opening a PR or by the later
     `dev`/`main` push rather than expecting a run from the feature-branch push.

10. **Rebuild artifacts, document, and finalize the change set.**
    - Run `npm run build` and commit `dist/index.js` if the bundle changed (it
      should not, since no `src/` code changed — if it does, investigate before
      committing).
    - Add `docs/agent_conversations/2026-07-16_github-release-setup.md` recording
      the objective, files added/changed, the screenshot-tooling addition, the CI
      and release-channel design (stable tag vs rolling `dev` prerelease), the
      screenshot capture evidence, the remote-creation result (or the exact gate
      that blocked), tests, and quality-gate results.
    - Ensure the working tree is clean and every change is committed before
      marking the round complete.

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

1. Run the focused tests through the wrapper while iterating:

   ```bash
   ./run.sh uv run --with pytest -- pytest -q tests/test_cdp_screenshot.py tests/test_release_assets.py
   ```

2. Run the complete quality gate and confirm a clean tree:

   ```bash
   ./run.sh scripts/orchestration/run-quality-gates
   ./run.sh scripts/orchestration/check-review-notes-not-deleted
   git diff --check
   git status --short
   ```

   Confirm TypeScript type-check, Rollup build, Vitest, Python byte-compile, all
   Pytest, and the version drift guard pass; `dist/index.js` is unchanged (no
   product code changed); and the tree is clean after commits.

3. Static/contract checks that do not require the Deck or GitHub:
   - `.github/workflows/ci.yml` mirrors the local gate (tsc, build, vitest,
     py_compile, pytest, drift guard) and runs **no** `scripts/deck/*` or
     `scripts/decky verify-change`/`doctor --deck` step.
   - `.github/workflows/release.yml` triggers stable on `v[0-9]+.[0-9]+.[0-9]+`
     tags (non-prerelease, hash-free `--release` build, tag/version match check)
     and dev on `dev`-branch push / dispatch (rolling `dev` prerelease with the
     hashed build). `permissions: contents: write` is present.
   - `scripts/release.sh` rejects a non-`X.Y.Z` argument, refuses to run on a
     dirty tree, and refuses a tag that already exists — confirm each guard fires
     without completing a real release. If you exercise the full happy path in a
     throwaway state, reset any throwaway commit/tag afterward so the real history
     and version are untouched, and confirm it only prints (never executes) the
     push commands.
   - `README.md` has no `user-attachments` URL, its image links point under
     `assets/`, and an Install-from-Releases section exists.

4. **Deferred / gated — on-device screenshot capture (Task 8).** Static tests
   cannot prove the screenshots depict the right UI. Deploy to a real Deck, drive
   the QAM panels, metadata editor, and activity news, capture with
   `scripts/deck/screenshot.sh`, and visually confirm each committed PNG in
   `assets/` shows its described feature before `tests/test_release_assets.py` is
   allowed to pass against real files. If the Deck is unreachable, stop and report
   per item 6 — do not substitute placeholder or fabricated images and do not mark
   the round complete.

5. **Deferred / gated — remote creation and push (Task 9).** Verify with
   `gh repo view "$(gh api user --jq .login)/Decky-Metadata"` that the repository
   exists and is **private**, and that `main`, the `v*` tags, and the feature
   branch are pushed while `dev` is **not** yet pushed. Do not expect a CI run from
   the feature-branch push (it does not match the `pull_request`/`dev`/`main`
   triggers); confirm instead that `.github/workflows/ci.yml` is present on the
   pushed branch and will run on the first PR or `dev`/`main` push. If `gh` auth is
   unavailable, stop and report per item 6.

6. **Blocker reporting.** If either gate (Deck reachability in Task 8, `gh` auth
   in Task 9) is not satisfiable, do not create the round-complete marker. Report
   the exact command that failed and its output to the orchestrator/user, leave
   Tasks 1–7 committed, and let the human resolve the environment before the plan
   can complete. On-device and GitHub side effects must never be simulated.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished github-release-setup
```

This writes:

```text
/tmp/Decky-Metadata/github-release-setup_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer github-release-setup`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/github-release-setup-review-*.md
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
   scripts/orchestration/clear-finished github-release-setup
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
   git add docs/review/github-release-setup-review-*.md
   git commit -m "docs(review): record github-release-setup review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished github-release-setup
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer github-release-setup` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed github-release-setup
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize github-release-setup
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Decky-Metadata/github-release-setup_finalized
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
scripts/orchestration/finalize github-release-setup
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Decky-Metadata/github-release-setup_finished
/tmp/Decky-Metadata/github-release-setup_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
