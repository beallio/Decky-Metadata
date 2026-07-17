# Plan: GitHub Release Follow-up: URL Install, Feature Screenshots, Cache Busters (github-release-followup)

## Context

The `github-release-setup` plan (already merged into `dev`) prepared the repo for
GitHub: private remote, CI + release workflows, `scripts/release.sh`, committed
screenshots under `assets/`, and a README rewrite. This follow-up makes four
maintainer-requested refinements on top of it. No product code
(`src/`, `main.py`, `backend/`, `dist/index.js`) changes.

1. **Install-from-Releases wording** — the README's "Install from GitHub Releases"
   section should make both paths explicit: download the `Decky-Metadata.zip`
   asset from the Releases page, **or** install it directly by URL using Decky's
   "install from URL" flow (paste the release asset URL). Keep the existing
   build-from-source path below it.

2. **Two new feature screenshots (on-device capture required).** Add committed
   screenshots that show two flagship behaviors, matching the existing capture
   pipeline and style:
   - **Game Info quick-links** — Steam's native **Game Info** tab for a *matched*
     non-Steam shortcut, showing the plugin's rewritten quick-links (Support and
     Community Market removed, Store Page kept for a listed match, DLC / Points
     Shop retargeted to the real Steam app). Use a listed match.
   - **Controller community layouts** — the **Controller Settings** / layouts
     screen for a *matched, listed* non-Steam shortcut, showing the borrowed
     Recommended/Official and Community layouts the plugin supplements in.
   Reference each new image from the relevant README feature section (the Game
   Info quick-links bullet and the Controller Settings bullet under Features).

3. **Cache-busters on README images** — this intentionally restores the
   convention the setup plan removed. Because README images are referenced by
   stable relative filenames under `assets/`, GitHub's image proxy caches them by
   URL and a changed same-named image can serve stale. Append a
   `?cacheBuster=20260716` query to **every** README image reference (the three
   existing images plus the two new ones), and restore the AGENTS.md guidance to
   bump that value whenever committed screenshots change.

4. Because cache-busters add a `?cacheBuster=...` query to the image src,
   `tests/test_release_assets.py` (which resolves each referenced image to a
   committed file under `assets/`) must **strip the query string** before the
   filesystem check. This test change is required by item 3 — record the rationale
   in the session log; do not weaken the "no `user-attachments` URL" or
   "package.json/plugin.json versions match" assertions.

The screenshot capture is a **hard gate**: it requires a reachable Steam Deck via
the committed `scripts/deck/*` tooling and the `scripts/deck/screenshot.sh` helper
added in the prior plan. If the Deck is unreachable, stop cleanly, report the exact
blocker, and do **not** mark the round complete or commit placeholder images.

### Execution permissions (explicit grant)

You have **explicit, standing permission** for this plan to reach the Steam Deck
over SSH via the committed `scripts/deck/*` tooling (the `steamdeck` ssh host, the
SSH tunnel to the CEF debugger on `localhost:18081`, `scp`/`rsync` deploys, and
`curl` to the tunnel) in order to capture the two new screenshots. These commands
need network access and may need to write outside the repository workspace (e.g.
`~/.ssh/known_hosts` or an SSH control socket under `~/.ssh`). **You are authorized
to escalate these specific commands outside the local sandbox as needed** rather
than treating a sandbox denial as a hard blocker. This grant does not extend to
`git push`, creating releases, or changing repository visibility — this plan makes
no remote changes; the orchestrator handles the `dev` push and dev release after
integration.

Primary surfaces: `README.md`, `AGENTS.md`, two new PNGs under `assets/`, and
`tests/test_release_assets.py`, plus a session summary under
`docs/agent_conversations/`. The screenshot tooling, workflows, and release script
from the prior plan are reused unchanged.

**Slug used throughout this plan:** `github-release-followup`

---

## Orchestration Contract

**Slug:** `github-release-followup`

**Plan file:**

```text
docs/plans/2026-07-16_github-release-followup.md
```

**Implementation branch:**

```text
feat/github-release-followup
```

**Round-complete marker:**

```text
/tmp/Decky-Metadata/github-release-followup_finished
```

**Finalized marker:**

```text
/tmp/Decky-Metadata/github-release-followup_finalized
```

**Review notes:**

```text
docs/review/github-release-followup-review-*.md
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
git checkout -b feat/github-release-followup
```

Commit this plan first:

```bash
git add docs/plans/2026-07-16_github-release-followup.md
git commit -m "docs(plan): add github-release-followup implementation plan"
```

---

## Implementation Tasks

Do the tasks in order. Tasks 1 and 2 are automatable and must be committed before
the gated Task 3 (on-device capture). If the Deck gate blocks, Tasks 1–2 stay
committed and the round is simply not marked complete.

1. **Baseline.**
   - From the repository root, output the AGENTS.md protocol handshake and run
     `./run.sh scripts/orchestration/run-quality-gates` to confirm a green start.
   - Re-read `README.md`, `AGENTS.md`, `tests/test_release_assets.py`,
     `scripts/deck/screenshot.sh`, and `scripts/deck/cdp.py`'s `screenshot`
     subcommand so you reuse the existing capture pipeline rather than
     re-deriving it.

2. **README + AGENTS + test changes (no Deck needed yet).**
   - **Install-from-Releases wording** (item 1): in the README "Install from
     GitHub Releases" subsection, present both install paths explicitly — (a)
     download the `Decky-Metadata.zip` asset from the latest release page, and (b)
     install directly by URL by pasting the release asset URL into Decky's
     install-from-URL flow. Keep the rolling `dev` prerelease reference and the
     build-from-source section below unchanged in intent.
   - **Cache-busters** (item 3): append `?cacheBuster=20260716` to **every**
     README image reference — the three existing images
     (`assets/decky-metadata-qam.png`, `assets/decky-metadata-editor.png`,
     `assets/decky-metadata-activity-news.png`) and the two new ones added in
     Task 3. Use the exact query key `cacheBuster` to match the repo's historical
     convention.
   - **AGENTS.md**: restore a short note under the release/versioning guidance
     that committed README screenshots use a `?cacheBuster=YYYYMMDD` query and that
     the value must be bumped whenever those images are re-captured. (The prior
     plan removed this; you are restoring it deliberately.)
   - **`tests/test_release_assets.py`**: update the image-resolution assertion to
     strip a trailing `?...` query string from each referenced path before
     checking that the file exists under `assets/`. Add a positive assertion that
     every README image reference carries a `?cacheBuster=` query so the
     convention cannot silently regress. Keep the existing "no `user-attachments`
     URL" and "package.json == plugin.json version" assertions intact. Run the
     test red first (it should fail once refs carry queries but before the strip
     logic is added, or add the new cacheBuster assertion first), save the red
     output under `/tmp/Decky-Metadata/`, then implement to green for the three
     existing images. The two new images resolve after Task 3.
   - Reference the two new images (by their planned `assets/` filenames) from the
     correct README feature bullets now, each with the `?cacheBuster=20260716`
     query, so Task 3 only needs to drop the files in. Suggested stable filenames:
     `assets/decky-metadata-gameinfo-quicklinks.png` and
     `assets/decky-metadata-controller-layouts.png`.

3. **[GATE: reachable Deck] Capture the two new feature screenshots.**
   - Confirm the Deck is reachable (`./run.sh scripts/decky doctor --deck`,
     `./run.sh scripts/deck/wait_online.sh`; the doctor may falsely report offline
     per the project runbook — confirm with an actual deploy/CDP round-trip before
     deciding). If genuinely unreachable, **stop**, report the blocker, and do not
     mark the round complete or commit placeholder images.
   - Deploy the current build (`./run.sh scripts/deck/deploy.sh`; use
     `scripts/deck/package_push.sh` + Decky-UI install if a full-plugin install is
     needed). Use a listed matched non-Steam shortcut (the deck verify fixtures
     use `listed_match`) so both features are populated.
   - Capture with `scripts/deck/screenshot.sh` (captures land under
     `/tmp/Decky-Metadata` per the tool's contract):
     - Navigate to the matched shortcut's **Game Info** tab and capture the
       rewritten quick-links (Support/Community Market absent, Store Page present,
       DLC/Points Shop retargeted). Save as
       `assets/decky-metadata-gameinfo-quicklinks.png`.
     - Navigate to that shortcut's **Controller Settings** / layouts screen and
       capture the borrowed Recommended/Official and Community layouts. Save as
       `assets/decky-metadata-controller-layouts.png`.
   - **Visually approve** each capture (it must clearly show the described
     feature), then copy the approved PNGs from `/tmp/Decky-Metadata/...` into
     `assets/` with the exact filenames the README references from Task 2. Recapture
     until each image unambiguously demonstrates its feature.
   - Commit the two PNGs. Confirm they are not caught by `.gitignore`, that
     `tests/test_release_assets.py` now passes against all five images, and that
     the full quality gate is green.

4. **Document.**
   - Add `docs/agent_conversations/2026-07-16_github-release-followup.md` recording
     the objective, the README/AGENTS/test changes, the cache-buster convention
     restoration and the exact test change made for it, the two new screenshots
     with their source SHA-256s and the on-device path exercised, and the
     quality-gate results.
   - Ensure the working tree is clean and every change is committed before marking
     the round complete.

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

1. Run the focused asset test through the wrapper:

   ```bash
   ./run.sh uv run --with pytest -- pytest -q tests/test_release_assets.py
   ```

2. Run the complete quality gate and confirm a clean tree:

   ```bash
   ./run.sh scripts/orchestration/run-quality-gates
   ./run.sh scripts/orchestration/check-review-notes-not-deleted
   git diff --check
   git status --short
   ```

3. Static/content checks (no Deck):
   - README "Install from GitHub Releases" documents both the zip download and the
     install-by-URL path.
   - Every README image reference carries `?cacheBuster=20260716`; there are five
     image references total (three existing + two new).
   - `README.md` still contains no `user-attachments` URL.
   - AGENTS.md documents the cacheBuster convention again.
   - `tests/test_release_assets.py` strips the query before resolving files and
     asserts the cacheBuster query is present; the version-agreement and
     no-`user-attachments` assertions remain.

4. **Deferred / gated — on-device capture (Task 3).** Static tests cannot prove the
   two new screenshots depict the right UI. Deploy to a real Deck, navigate to a
   listed matched shortcut's Game Info and Controller Settings screens, capture
   with `scripts/deck/screenshot.sh`, and visually confirm each committed PNG shows
   its feature (rewritten quick-links; borrowed community layouts) before the test
   passes against real files. If the Deck is unreachable, stop and report per item
   5 — do not commit placeholder or fabricated images or mark the round complete.

5. **Blocker reporting.** If the Deck gate is not satisfiable, do not create the
   round-complete marker. Report the exact command that failed and its output,
   leave Tasks 1–2 committed, and let the human resolve the environment. On-device
   side effects must never be simulated.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished github-release-followup
```

This writes:

```text
/tmp/Decky-Metadata/github-release-followup_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer github-release-followup`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/github-release-followup-review-*.md
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
   scripts/orchestration/clear-finished github-release-followup
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
   git add docs/review/github-release-followup-review-*.md
   git commit -m "docs(review): record github-release-followup review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished github-release-followup
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer github-release-followup` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed github-release-followup
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize github-release-followup
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Decky-Metadata/github-release-followup_finalized
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
scripts/orchestration/finalize github-release-followup
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Decky-Metadata/github-release-followup_finished
/tmp/Decky-Metadata/github-release-followup_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
