# Plan: README Refresh: Approachable Copy, Trim Sections, Space Marine Feature Screenshots (readme-refresh)

## Context

The GitHub-publication work is merged into `dev` and the release pipeline is
green (CI + a rolling `dev` prerelease publish on every `dev` push). This plan
makes the README friendlier for end users and refreshes the feature screenshots.
No product code (`src/`, `main.py`, `backend/`, `dist/index.js`) changes.

Maintainer-requested changes:

1. **Tone.** Rewrite the README to be warm and human-approachable, not a
   technical spec. Lead with what the plugin does for a player in plain language.
   Keep it accurate, but cut jargon (avoid phrases like "native hub cards",
   "callable", "RPC", "quick-links contract", "delisted-app index" without a plain
   gloss). Short intro sentences, second person ("your games"), skimmable sections.

2. **Trim sections/files:**
   - Remove the **Build from source** subsection under Installation entirely
     (leave only the Releases install path — zip download *or* install-by-URL).
   - Remove the **Notes** section.
   - Delete `CONTRIBUTING.md`.
   - Remove the "maintained by beallio" wording from the credits (keep the
     upstream attributions to Playhub Metadata, the Decky Plugin Template, and
     decky-steamgriddb — those are license/credit obligations and must stay).
   - Delete the community-health templates `.github/pull_request_template.md` and
     `.github/ISSUE_TEMPLATE/` (both `bug_report.md` and `feature_request.md`).
     **Do NOT touch `.github/workflows/`** — `ci.yml` and `release.yml` are the
     CI/release automation and must remain. After deletion `.github/` still exists
     (it holds `workflows/`); do not remove the directory.

3. **Screenshots (see Task 3 for on-device capture).** Final README image set and
   placement:
   - **QAM panels** — reuse the existing `assets/decky-metadata-qam.png`, placed
     near the **top** of the README (just after the intro) as the hero image.
   - **Metadata editor** — reuse the existing `assets/decky-metadata-editor.png`
     (unchanged; it stays X-Men Origins: Wolverine), repositioned under the
     section describing editing metadata from a game's context menu. Do **not**
     add a separate capture of the menu itself.
   - **Game Info (two new, Space Marine)** — replace the single
     `assets/decky-metadata-gameinfo-quicklinks.png` (delete it) with two images:
     `assets/decky-metadata-gameinfo-top.png` (top of the Game Info tab: artwork/
     description/developer/publisher/release date/Deck compatibility) and
     `assets/decky-metadata-gameinfo-buttons.png` (the bottom quick-links button
     row).
   - **Community (new, Space Marine)** — `assets/decky-metadata-community.png`
     showing the matched game's Steam Community content.
   - **Controller layouts (redo, Space Marine)** — recapture
     `assets/decky-metadata-controller-layouts.png` for Warhammer 40,000: Space
     Marine (the current image is a different game).
   - **Activity news** — keep the existing
     `assets/decky-metadata-activity-news.png` (already Space Marine).
   Place Community, Game Info, Controller, and Activity images under their matching
   feature sections.

4. **Cache-busters.** Keep the `?cacheBuster=` convention. Because images change,
   bump the value to `?cacheBuster=20260717` on **every** README image reference
   (new and reused). `tests/test_release_assets.py` already strips the query and
   asserts the cacheBuster is present; keep it green.

The screenshot capture is a **hard gate**: it requires a reachable Steam Deck via
`scripts/deck/*` and `scripts/deck/screenshot.sh`. Warhammer 40,000: Space Marine
is an existing matched non-Steam shortcut on the Deck (it is the subject of the
current activity-news screenshot). If the Deck is unreachable, stop cleanly, report
the blocker, and do not mark the round complete or commit placeholder images.

### Execution permissions (explicit grant)

You have **explicit, standing permission** for this plan to reach the Steam Deck
over SSH via the committed `scripts/deck/*` tooling (the `steamdeck` ssh host, the
SSH tunnel to the CEF debugger on `localhost:18081`, `scp`/`rsync` deploys, and
`curl` to the tunnel) to capture the screenshots. These commands need network
access and may need to write outside the repository workspace (e.g.
`~/.ssh/known_hosts` or an SSH control socket under `~/.ssh`). **You are authorized
to escalate these specific commands outside the local sandbox as needed** rather
than treating a sandbox denial as a hard blocker. This grant does not extend to
`git push`, creating releases, or changing repository visibility; the orchestrator
handles the `dev` push and dev release after integration.

**Do NOT run `npm install`/`npm update` or otherwise regenerate `package-lock.json`.**
The lockfile was just repaired to use the public npm registry; regenerating it in
this environment would repoint it at an internal mirror and break CI again. If a
step needs dependencies, use the existing `node_modules` or `npm ci` (which honors
the committed lockfile) only.

**Slug used throughout this plan:** `readme-refresh`

---

## Orchestration Contract

**Slug:** `readme-refresh`

**Plan file:**

```text
docs/plans/2026-07-17_readme-refresh.md
```

**Implementation branch:**

```text
feat/readme-refresh
```

**Round-complete marker:**

```text
/tmp/Decky-Metadata/readme-refresh_finished
```

**Finalized marker:**

```text
/tmp/Decky-Metadata/readme-refresh_finalized
```

**Review notes:**

```text
docs/review/readme-refresh-review-*.md
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
git checkout -b feat/readme-refresh
```

Commit this plan first:

```bash
git add docs/plans/2026-07-17_readme-refresh.md
git commit -m "docs(plan): add readme-refresh implementation plan"
```

---

## Implementation Tasks

Do the tasks in order. Tasks 1–2 (rewrite + trims + test wiring for reused images)
are automatable and must be committed before the gated Task 3 (on-device capture).
If the Deck gate blocks, Tasks 1–2 stay committed and the round is not marked
complete.

1. **Baseline.**
   - Output the AGENTS.md protocol handshake and run
     `./run.sh scripts/orchestration/run-quality-gates` to confirm a green start.
   - Re-read `README.md`, `tests/test_release_assets.py`, `scripts/deck/screenshot.sh`,
     the `screenshot` subcommand in `scripts/deck/cdp.py`, and the current
     `assets/` contents.

2. **Rewrite README, trim sections/files, and wire reused images.**
   - Rewrite `README.md` in a warm, plain-language, skimmable style per Context
     item 1. Keep every claim accurate to the plugin's actual behavior; simplify
     wording rather than inventing features. Preserve the badges block and the
     License & Credits attributions (minus the "maintained by beallio"
     phrasing).
   - Structure: title + badges + a friendly one-paragraph intro; then the **QAM
     hero image** near the top; a short **Install** section (download the
     `Decky-Metadata.zip` from Releases, or paste the release asset URL into
     Decky's install-from-URL flow; mention the `dev` prerelease testing channel);
     then feature sections in plain language, each with its screenshot placed under
     it (editor under the context-menu editing section; the two Game Info images
     under a Game Info section; Community image under a Community section;
     Controller image under a controller section; Activity image under an Activity
     section). Remove the **Build from source** subsection and the **Notes**
     section entirely.
   - `git rm CONTRIBUTING.md`, `git rm .github/pull_request_template.md`, and
     `git rm -r .github/ISSUE_TEMPLATE`. Leave `.github/workflows/` untouched.
   - Reference every image with `?cacheBuster=20260717`. For this task, wire the
     reused images (`decky-metadata-qam.png`, `decky-metadata-editor.png`,
     `decky-metadata-activity-news.png`) and reference the five to-be-captured/
     changed names (`decky-metadata-gameinfo-top.png`,
     `decky-metadata-gameinfo-buttons.png`, `decky-metadata-community.png`,
     `decky-metadata-controller-layouts.png`) so Task 3 only drops files in.
     `git rm assets/decky-metadata-gameinfo-quicklinks.png` (replaced by the two
     Game Info images) and remove its README reference.
   - `tests/test_release_assets.py` should continue to pass for the reused images;
     the newly-referenced-but-not-yet-committed images will make it fail until Task
     3 — that is expected. Do not weaken the test; if helpful, run it after Task 3.
   - Do not run the on-device capture yet; commit the text/removal changes first so
     they survive a Deck-gate block.

3. **[GATE: reachable Deck] Capture the Space Marine feature screenshots.**
   - Confirm the Deck is reachable (`./run.sh scripts/decky doctor --deck`,
     `./run.sh scripts/deck/wait_online.sh`; doctor may falsely report offline per
     the runbook — confirm with a real deploy/CDP round-trip). If genuinely
     unreachable, **stop**, report the blocker, and do not mark the round complete
     or commit placeholder images.
   - Deploy the current build (`./run.sh scripts/deck/deploy.sh`; use
     `package_push.sh` + Decky-UI install if a full install is needed). Use the
     existing matched non-Steam shortcut **Warhammer 40,000: Space Marine**.
   - Capture with `scripts/deck/screenshot.sh` (captures land under
     `/tmp/Decky-Metadata` per the tool's contract), visually approve each, then
     copy the approved PNGs into `assets/` with the exact names the README
     references:
     - Game Info tab, scrolled to the **top** → `assets/decky-metadata-gameinfo-top.png`.
     - Game Info tab, scrolled to the **bottom quick-links button row** →
       `assets/decky-metadata-gameinfo-buttons.png`.
     - **Community** tab showing the matched game's Steam Community content →
       `assets/decky-metadata-community.png`.
     - **Controller Settings** community/borrowed layouts for Space Marine →
       `assets/decky-metadata-controller-layouts.png` (overwrite the old image).
   - Recapture until each image unambiguously shows its feature. Commit the images.
     Confirm none are caught by `.gitignore`, that
     `tests/test_release_assets.py` passes against all referenced images, and that
     the full quality gate is green.

4. **Document.**
   - Add `docs/agent_conversations/2026-07-17_readme-refresh.md` recording the
     objective, the README tone rewrite and the sections/files removed, the final
     image set with each new capture's source SHA-256 and the on-device path
     exercised, and the quality-gate results.
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

1. Run the focused asset test:

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
   - README reads as approachable, plain-language copy; no Build-from-source
     subsection and no Notes section remain; no "maintained by beallio".
   - `CONTRIBUTING.md`, `.github/pull_request_template.md`, and
     `.github/ISSUE_TEMPLATE/` are gone; `.github/workflows/ci.yml` and
     `release.yml` remain.
   - The QAM image appears near the top; the editor, two Game Info, Community,
     Controller, and Activity images appear under their matching sections.
   - Every README image reference carries `?cacheBuster=20260717`; the removed
     `decky-metadata-gameinfo-quicklinks.png` is no longer referenced or committed.
   - `README.md` still has no `user-attachments` URL; the version-agreement and
     cacheBuster assertions in `tests/test_release_assets.py` pass.
   - `package-lock.json` is unchanged by this plan (no dependency churn).

4. **Deferred / gated — on-device capture (Task 3).** Static tests cannot prove the
   four new/redone screenshots depict the right UI. Deploy to a real Deck, navigate
   Space Marine's Game Info (top and bottom), Community, and Controller Settings
   screens, capture with `scripts/deck/screenshot.sh`, and visually confirm each
   committed PNG before the asset test passes against real files. If the Deck is
   unreachable, stop and report per item 5 — never commit placeholder or fabricated
   images or mark the round complete.

5. **Blocker reporting.** If the Deck gate is not satisfiable, do not create the
   round-complete marker. Report the exact failing command and its output, leave
   Tasks 1–2 committed, and let the human resolve the environment. On-device side
   effects must never be simulated.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished readme-refresh
```

This writes:

```text
/tmp/Decky-Metadata/readme-refresh_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer readme-refresh`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/readme-refresh-review-*.md
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
   scripts/orchestration/clear-finished readme-refresh
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
   git add docs/review/readme-refresh-review-*.md
   git commit -m "docs(review): record readme-refresh review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished readme-refresh
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer readme-refresh` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed readme-refresh
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize readme-refresh
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Decky-Metadata/readme-refresh_finalized
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
scripts/orchestration/finalize readme-refresh
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Decky-Metadata/readme-refresh_finished
/tmp/Decky-Metadata/readme-refresh_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
