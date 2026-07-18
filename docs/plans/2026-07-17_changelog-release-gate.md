# Plan: Gate releases on curated CHANGELOG notes (changelog-release-gate)

## Context

**Problem.** A GitHub Release should ship with a real title *and* a curated
description (release notes body) — like the hand-written notes in
`beallio/SDH-Ludusavi`'s `v0.3.7` (a short summary + a bulleted, conventional-commit
changelog + a verification line). Today the **stable** publish path in
`.github/workflows/release.yml` publishes with `--title "$TAG"` and
`--generate-notes`, so a stable `vX.Y.Z` release goes out with only GitHub's
auto-generated commit list — there is no forcing function that a human wrote real
notes, and nothing fails if the notes would be empty. The user wants a script that
**refuses to publish a stable release unless curated notes exist for that exact
version**, wired both into CI and into the local release-prep path.

**Chosen design (decided with the user).**
1. Curated notes live in a new top-level `CHANGELOG.md` in
   [Keep a Changelog](https://keepachangelog.com) form: an `## [Unreleased]`
   section plus one `## [X.Y.Z] - YYYY-MM-DD` section per released version.
2. A new validator/extractor script, `scripts/changelog.py`, is the single source
   of truth. `check` fails (nonzero) when the requested version's section is
   missing, empty, or placeholder; `extract` prints that section's body for
   `gh release ... --notes-file`; `title` prints an enriched, non-empty release
   title derived from the section (see task 2) for `gh release ... --title`.
3. The gate is enforced in **two** places for stable releases, covering both
   **supported release paths** so neither the automated tag build nor the local
   prep can ship without notes:
   - `scripts/release.sh` preflight (before it creates the version-bump commit and
     tag), so you cannot cut the release locally with a stale changelog;
   - `.github/workflows/release.yml` **stable path only** (the `refs/tags/v*`
     branch), before `gh release create`, which also switches from
     `--generate-notes` to `--notes-file` fed from the CHANGELOG section, and
     from `--title "$TAG"` to an enriched title derived from that section.
   Scope of the guarantee: this gates the **scripted/CI** paths a maintainer is
   meant to use. It does not (and cannot, without repo-admin controls) stop someone
   from hand-running `gh release create` or clicking "Draft a new release" in the
   GitHub UI. Absolute enforcement would require branch/tag protection or a
   protected deployment environment — out of scope here; note it as a follow-up.

**Channel scoping (matches AGENTS.md §7 release-channel semantics — do not
broaden).**
- **Stable** (`release.yml` tag path + `release.sh`): HARD gate on the exact
  `## [X.Y.Z]` section. This is the user's real ask.
- **Manual dev semver prerelease** (`.github/workflows/dev-release.yml`,
  `workflow_dispatch`, updater-facing): gate on the `## [Unreleased]` section being
  non-empty, and publish those Unreleased notes (prepended to the existing
  "built from commit …" line). It is manually dispatched, so this upkeep is
  intentional and keeps the changelog warm between stable cuts.
- **Rolling dev prerelease** (`release.yml`, the `channel == dev` branch that fires
  on **every** `dev` push): DO **NOT** gate — leave its auto one-line notes exactly
  as-is. Gating this would break the on-device sideload loop on every dev commit.

**Relevant files (verify before editing — line numbers drift):**
- `.github/workflows/release.yml` — stable path publish step
  ("Publish stable GitHub Release", currently `--title "$TAG" --generate-notes`);
  leave the "Publish rolling dev prerelease" step untouched.
- `.github/workflows/dev-release.yml` — "Publish dev prerelease" step (currently
  `--title "v$DEV_VERSION (Dev)" --notes "Automated development pre-release …"`).
- `scripts/release.sh` — local stable-release prep (arg is `X.Y.Z`; sets versions,
  commits, tags, packages).
- `scripts/version_guard.py` / `scripts/set_release_version.py` — existing Python
  tooling conventions to mirror (stdlib only, subcommand `argparse`, tests in
  `tests/`).
- Backend/tooling tests run via `uv run --with pytest -- pytest -q` (see
  `scripts/orchestration-hooks/quality-gates`); add coverage under `tests/`.

**Facts pinned from the repo (2026-07-17):** highest stable tag is `v0.3.1`;
`package.json` / `plugin.json` version is `0.3.2` (the next, not-yet-released
stable base). Because 0.3.2 is unreleased, the seeded `CHANGELOG.md` keeps the
current 0.3.2 work under `## [Unreleased]` (dated historical sections below it) and
does **not** pre-create a `## [0.3.2]` section — the standard Keep-a-Changelog
rename at release time turns `[Unreleased]` into `[0.3.2] - <date>` (see task 1).
Seeding both would collide into a duplicate `[0.3.2]` header, which the parser
rejects by design.

**Out of scope (do NOT do here):** enriching the **dev** prerelease titles (those
stay `v$DEV_VERSION (Dev)` / `Dev build ($hash)` — only the stable title is
enriched); gating the rolling dev prerelease; backfilling full historical notes for
`v0.1.0`–`v0.3.1` beyond short stub sections; touching `plugin.json`/`package.json`
`publish.description` (that is the plugin/store blurb, a different field from release
notes); any `src/`, `backend/`, `main.py`, or `dist/` change.

**Slug used throughout this plan:** `changelog-release-gate`

---

## Orchestration Contract

**Slug:** `changelog-release-gate`

**Plan file:**

```text
docs/plans/2026-07-17_changelog-release-gate.md
```

**Implementation branch:**

```text
feat/changelog-release-gate
```

**Round-complete marker:**

```text
/tmp/Decky-Metadata/changelog-release-gate_finished
```

**Finalized marker:**

```text
/tmp/Decky-Metadata/changelog-release-gate_finalized
```

**Review notes:**

```text
docs/review/changelog-release-gate-review-*.md
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
git checkout -b feat/changelog-release-gate
```

Commit this plan first:

```bash
git add docs/plans/2026-07-17_changelog-release-gate.md
git commit -m "docs(plan): add changelog-release-gate implementation plan"
```

---

## Implementation Tasks

Follow TDD for `scripts/changelog.py` (write `tests/test_changelog.py` first, watch
it fail, then implement). Do the work in this order.

### 1. Seed `CHANGELOG.md` (new top-level file)

Create `CHANGELOG.md` at the repo root in Keep a Changelog form. **Follow the
standard Keep-a-Changelog lifecycle:** in-progress work accumulates under
`## [Unreleased]`; cutting a stable release *renames* `[Unreleased]` to
`[X.Y.Z] - <date>` and adds a fresh empty `[Unreleased]`. So the seed does **NOT**
pre-create a separate `[0.3.2]` section — the current, not-yet-released 0.3.2 work
lives under `[Unreleased]` (0.3.2 is the next release; highest stable tag is
`v0.3.1`). Pre-creating both `[Unreleased]` and `[0.3.2]` would force a duplicate
`[0.3.2]` header at release time, which the parser (task 2) rejects.

The file MUST contain, in this order:

- A title `# Changelog` and the standard one-line Keep a Changelog / SemVer preamble.
- `## [Unreleased]` — the current in-progress work destined for 0.3.2. It must be
  non-empty and substantive (the dev-release gate requires this). **Derive it from
  the actual diff, not guesswork:** at implementation time run
  `git log --no-merges v0.3.1..HEAD` (HEAD, so the changelog-gate feature's own
  commits are included; `--no-merges` avoids merge-commit noise) and group the real
  commits by Conventional-Commit type. Do **NOT** hard-code the earlier draft's
  feature list — in particular, **plugin self-update shipped in `v0.3.1`, not
  0.3.2**, so it must NOT appear here (it belongs in `[0.3.1]`). The genuine
  upcoming-0.3.2 work is version/description + README/CI cleanup, updater install
  docs, Actions/Dependabot bumps, and this changelog gate — but confirm against
  `git log` and explicitly fold in this feature branch's own commits.
  - Shape: begin the body with a one-line **summary sentence** (a plain, non-bullet
    line, ≤ ~72 chars), then a blank line, then `- ` bullets. Under `[Unreleased]`
    the summary line is optional (dev prereleases don't enrich their title), but
    seeding one here is good practice so it becomes the enriched stable title after
    the rename.
- Short stub sections for the already-published tags so the file is historically
  complete: `## [0.3.1] - <date>` (this is where **self-update** goes),
  `## [0.3.0] - <date>`, `## [0.2.0] - <date>`, `## [0.1.0] - <date>`, each with a
  real `YYYY-MM-DD` date (use `git log -1 --format=%ad --date=short <tag>`). Use the
  existing GitHub release notes / `git log <prev>..<tag>` for honest one-line
  wording; a single line each is acceptable — these are backfill, not the focus.
- Each version appears **exactly once** (no duplicate `## [X.Y.Z]` headers) — the
  parser rejects duplicates.

Section-header grammar the parser (task 2) must accept: `## [VERSION]` with an
optional ` - YYYY-MM-DD` date. For a **stable** section the date is **required**
(see `check`); `## [Unreleased]` may omit it.

**How the next stable cut works (document in task 7, do not do it now):** the
rollover happens **on `dev`, before the `dev → main` promotion**, so it flows to
`main` through the merge and `dev` and `main` never diverge on the changelog. On
`dev`: rename `## [Unreleased]` → `## [0.3.2] - <today>` (move its content, ensure a
leading non-bullet summary line and a real ISO date), then add a fresh empty
`## [Unreleased]` above it, and commit. Then merge `dev → main --no-ff` and run
`scripts/release.sh 0.3.2` on the clean `main` (its gate now finds `[0.3.2]`). The
rename — never a second `[0.3.2]` header — avoids the duplicate, and because the cut
was prepared on `dev`, the post-release `bump_next_patch.sh` on `dev` already sits
on top of the fresh empty `[Unreleased]` (no stale notes, no next-merge conflict).

### 2. `scripts/changelog.py` (new; Python 3, standard library only)

Mirror the style of `scripts/version_guard.py` (argparse subcommands, `main()`
returning an int exit code, executable shebang `#!/usr/bin/env python3`, `chmod +x`).
Parser locates `CHANGELOG.md` relative to the repo root (resolve from the script's
own path, like `package.mjs` does with `import.meta.url`), so it works regardless of
CWD. Provide a global `--file PATH` option (default: that repo-root `CHANGELOG.md`)
so tests and verification can point subcommands at fixtures. Factor the core logic
into importable pure functions (`find_section`, `check_section`, `render_title`)
with a thin `argparse` CLI wrapper, so `tests/test_changelog.py` can exercise them
directly without shelling out.

**Deterministic parsing contract (one shared helper — `find_section(text, key)` —
used by every subcommand, so all three agree on the body):**

- Normalize with `text.splitlines()` so CRLF and LF behave identically.
- **Detect section headers by bracketed key first, independent of any suffix**, so a
  malformed suffix can't hide a duplicate. A line is a section header iff it matches
  `^##\s+\[(?P<key>[^\]]+)\](?P<suffix>.*)$` — note **no `\s*` between `]` and the
  suffix capture**, so `suffix` includes the leading space(s) (a valid dated header
  yields suffix `" - 2026-07-17"`, not `"- 2026-07-17"`; an undated header yields
  `""`). The `key` identifies the section (e.g. `0.3.2`, `Unreleased`); the `suffix`
  is validated separately.
- **Reject duplicate keys before anything else:** count header lines whose `key`
  equals the requested key; if more than one, fail with a clear "duplicate section"
  error. This runs on the raw key match (not on suffix/date validity), so
  `## [0.3.2]` plus `## [0.3.2] - July 17` is still caught as a duplicate. This keeps
  `check`, `extract`, and `title` from ever disagreeing.
- **Then validate the selected header's date.** The suffix is a valid date iff it
  full-matches `^\s+-\s+(?P<date>\d{4}-\d{2}-\d{2})\s*$` **and**
  `datetime.date.fromisoformat(date)` succeeds — so
  a well-shaped but impossible date like `2026-13-01` or `2026-02-30` is rejected,
  not just accepted by a `\d{4}-\d{2}-\d{2}` shape. Expose the parsed date (or
  `None` when the suffix is empty) to callers. A non-empty suffix that is not a valid
  ` - <ISO date>` counts as **no valid date** (stable `check` then fails on the date
  condition).
- The section body is every line after the header up to the next line that is itself
  a `##` (level-2) header, or EOF. (A section at EOF is valid.)

Subcommands:

- `check VERSION` — resolve the key from `VERSION`: strip **exactly one** optional
  leading lowercase `v` (an arg with two leading `v`s must fail), then require the
  remainder to be a strict stable SemVer matching
  `^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$` — this rejects leading zeros
  (`01.2.3`), short (`0.3`) and long (`1.2.3.4`) forms, and any pre-release/build
  suffix (`1.2.3-dev`, `1.2.3+g0`). Locate `## [X.Y.Z]` via the shared helper. Exit
  `0` iff **all** of:
  1. the section exists and is unique;
  2. the header carries a valid `YYYY-MM-DD` **date** (stable releases must be
     dated — this also blocks publishing a `<release-date>` placeholder);
  3. the body is **substantive** (rule below); **and**
  4. the body's **first substantive line is not a bullet** (it is the summary line
     the stable title is enriched from). A section whose first substantive line is a
     bullet fails this condition.
  Otherwise print a clear, specific message to stderr (say which of the four failed)
  and exit `1`.
- `check --unreleased` — require the section to exist and be **substantive**, but do
  **not** require a date and do **not** require the leading-summary form (dev
  prereleases don't enrich their title).
- `extract VERSION` / `extract --unreleased` — print the section body (trimmed of
  leading/trailing blank lines, header excluded) to stdout via the shared helper.
  Exit `1` with a message if the section is missing or duplicated. (`extract` need
  not re-run the substantive check, but must fail on a missing/duplicate section.)
- `title VERSION` — print a single-line, enriched, **always non-empty** release
  title to stdout for `gh release --title`. Take the body's **summary line** (the
  first substantive line, per the body-level rule) — but only when it is **not** a
  bullet. Strip its surrounding whitespace and a single trailing period, and print
  `vX.Y.Z — SUMMARY` (em dash `—`, spaces around it; canonical `vX.Y.Z` regardless
  of the arg's leading `v`). Because `check VERSION` already requires that summary
  line, any gated stable release enriches. If the first substantive line is a bullet
  or there is none (only reachable if `check` were bypassed), fall back to bare
  `vX.Y.Z` — never emit an empty string. Exit `1` only if the section is
  missing/duplicated.

**Body preprocessing (before per-line classification).** Strip HTML comments from
the **whole body text** first, including an **unterminated** comment that runs to
EOF, with `re.sub(r"<!--.*?(?:-->|\Z)", "", body, flags=re.S)`, so a multi-line or
never-closed `<!-- … -->` can't leave its inner lines looking like prose. Then
`splitlines()` and classify.

This helper is a **heuristic gate against accidental empty/placeholder notes, not a
full CommonMark parser or a security boundary.** It deliberately handles the
enumerated structural and placeholder forms below (with a test for each); that is
enough to stop a curated-notes author from *accidentally* shipping a section that
renders to nothing.

**Line-classification helper** (single function, used everywhere). Given one raw
line, return `(substantive: bool, is_bullet: bool, payload: str)` where `is_bullet`
means "is a list item" (ordered or unordered — such lines can never be the
summary line):

1. Strip surrounding whitespace → `s`. If `s` is empty → not substantive.
2. If `s` is Markdown structure only → not substantive:
   - a heading (`^#`);
   - a **thematic break**: remove **all whitespace** from `s` (spaces *and* tabs, e.g.
     `re.sub(r"\s", "", s)`); if the result is 3+ repeats of a single `-`, `*`, or
     `_` (`---`, `***`, `___`, and the spaced/tabbed forms `- - -`, `-\t-\t-`) →
     structure;
   - a residual single-line HTML comment (`^<!--.*-->$`) — belt-and-suspenders after
     the body-level strip;
   - a **code-fence delimiter line**: `^(```+|~~~+)` (a line that is only a fence
     marker, optionally with an info string) — carries no notes on its own;
   - an **empty blockquote marker**: `s` is only `>` characters and whitespace
     (`^>[>\s]*$`) → structure (a blockquote *with* text is left alone and its text
     is judged normally);
   - a reference-link definition: `^\[[^\]]+\]:\s*\S` (colon may be followed by the
     URL with **no** space, e.g. `[x]:https://example`).
3. Determine list-item marker + payload. `s` is a list item (`is_bullet = True`) iff
   it starts with an **unordered** marker `[-*+]` **or** an **ordered** marker
   `\d+[.)]`, each followed by whitespace (or nothing). Match with
   `^(?:[-*+]|\d+[.)])(?:\s+(?P<rest>.*\S))?\s*$`; `rest` is the captured remainder
   (empty for a bare `- ` / `1. ` with only spaces). If it is a list item, then also
   strip a leading **task-list checkbox** `^\[[ xX]\]\s+` from `rest`. `payload` =
   that remainder (or `s` itself when not a list item). A list item whose payload is
   **empty → not substantive** (bare-bullet / empty-ordered case — do NOT let
   `strip()` collapse `- ` into a substantive `-`).
4. Placeholder test on `payload` (after trimming surrounding whitespace and a single
   trailing `.`/`:`), case-insensitive: it is a placeholder (→ not substantive) iff
   it **equals** one of `todo`, `tbd`, `tbc`, `wip`, `fixme`, `n/a`, `na`, `none`,
   `nothing yet`, `placeholder`, `_placeholder_`, **or** matches
   `^(todo|tbd|tbc|wip|fixme)\b` (keyword leading the line, e.g. `TODO: write notes`,
   `FIXME - later`). The leading-keyword set is the short, unambiguous one only, so a
   real bullet like `None of the caches …` (payload starts with `none`, exact-match
   only) still passes.
5. Otherwise → substantive.

So `- TODO`, `- TBD.`, `TODO: write notes`, `WIP`, a **bare `- `**, `1. TODO`,
`- [ ] TODO`, `- - -`, `-\t-\t-`, a body that is only an HTML comment (terminated
**or** run-to-EOF), a body of only code-fence delimiters, and a body of only an empty
`>` blockquote all fail; a real sentence or a list item with real prose passes.

**Body-level rules built on the classifier:**
- A body is **substantive** iff at least one line is substantive.
- The body's **summary line** is simply its **first substantive line**. There is one
  rule, no skipping: if that first substantive line **is a bullet**, there is no
  summary — stable `check` fails condition 4 and `title` uses its bare-`vX.Y.Z`
  fallback. (So a section whose first real content is a bullet can never masquerade
  as having a summary via a later non-bullet line.)

Exact error text is up to you but must name the version/section and the file, e.g.
`changelog: no "## [0.3.5]" section found in CHANGELOG.md`,
`changelog: "## [0.3.5]" is missing a YYYY-MM-DD date`, and
`changelog: "## [0.3.5]" needs a non-bullet summary line before its bullets`.

### 3. `tests/test_changelog.py` (new — write FIRST)

Pytest, standard library + pytest only. Exercise the pure helpers
(`find_section` / `check_section` / `render_title`) directly, and the CLI via the
mandatory `--file PATH` option pointed at fixtures. Cover:

- a **dated** stable section with a leading summary line + real bullets → `check`
  passes (exit 0 / True);
- a missing version section → fails;
- a header present but empty body (immediately followed by the next `## `) → fails;
- a placeholder-only body — cover **each** of `- TODO`, `- TBD.`,
  `TODO: write notes`, `WIP`, and a **bare `- `** (and a bare `- ` with only trailing
  spaces) → all fail (guards the bare-bullet edge specifically);
- a real bullet that merely *starts with* an exact-match word, `- None of the caches
  are cleared`, → **passes** (guards against the leading-keyword rule over-matching);
- a body of only Markdown structure → fails, covering **each**: a heading; a
  single-line `<!-- comment -->`; a **multi-line** `<!-- … -->` whose inner lines
  look like prose; an **unterminated** `<!--` comment that runs to EOF; a plain
  `---`, a **spaced** `- - -`, and a **tabbed** `-\t-\t-` thematic break; a body of
  only code-fence delimiters (```` ``` ````); a body of only an empty `>` blockquote;
  a reference-link definition both `[x]: url` and no-space `[x]:https://example`;
- placeholder list forms beyond bullets → fail: `1. TODO` (ordered marker) and
  `- [ ] TODO` (task-list checkbox); while `1. Real ordered note` and
  `- [x] Shipped the thing` (real payload) → count as substantive list items;
- a **stable** section whose first substantive line is a **bullet**, even when a
  plain sentence follows later, → `check` fails (no skipping to a later non-bullet);
  the same body under `--unreleased` → passes;
- a **stable** section with a summary + bullets but **no date** in the header →
  `check` fails; adding ` - 2026-07-17` → passes;
- **calendar-invalid dates** `## [0.3.2] - 2026-13-01` and `## [0.3.2] - 2026-02-30`
  → `check` fails (shape alone is not enough); a real leap day
  `## [0.3.2] - 2028-02-29` → passes; a non-ISO suffix `## [0.3.2] - July 17` →
  fails the date condition;
- `## [Unreleased]` with and without a ` - 2026-07-17` date → both accepted by
  `--unreleased`;
- SemVer arg handling: `v0.3.2` → resolves to `[0.3.2]` (passes); each of `vv0.3.2`,
  `0.3`, `1.2.3.4`, `01.2.3`, `1.2.3-dev`, `1.2.3+g0` → **fails** with a
  version-format error;
- **duplicate** headers detected on the bracketed key regardless of suffix: both a
  plain `## [0.3.2]` × 2 **and** the mixed `## [0.3.2]` + `## [0.3.2] - July 17`
  cases → `check`/`extract`/`title` all fail with a duplicate error (not a silent
  pick, and the malformed twin doesn't hide the duplicate);
- a valid section at **EOF** (no trailing `##`) → parses correctly;
- **CRLF** line endings produce the same results as LF;
- `--unreleased` check on a non-empty vs empty Unreleased section;
- `extract` returns the body text without the header and without surrounding blank
  lines, and `extract` on a missing/duplicate section fails;
- `title` for a section with a summary line → `v0.3.2 — <summary>` (single trailing
  period stripped, em dash, canonical `v` prefix even when the arg omitted it);
- `title` safety-net: a bullets-only section (only reachable if `check` is bypassed)
  → bare `v0.3.2`, never empty;
- `title` on a missing/duplicate section → fails (exit 1).

Prefer testing a pure `find_section` / `check_section` / `render_title` helper
directly, with a thin CLI wrapper, so these cases don't each shell out.

### 4. Wire the gate into `scripts/release.sh` (+ fix the no-op-commit trap)

**4a — Changelog preflight.** After the `X.Y.Z` version-format validation and the
clean-tree / branch / tag-exists guards, and **before**
`scripts/orchestration/run-quality-gates` / `set_release_version.py` / the commit,
add a preflight:

```bash
# A stable release must ship curated notes: require a CHANGELOG.md section.
python3 scripts/changelog.py check "$version"
```

`set -euo pipefail` is already active, so a nonzero exit aborts before any mutation.

**4b — Tolerate an already-set version (BLOCKER found in review).** Today
`release.sh` runs these **four consecutive lines** (currently lines 58–61):

```bash
scripts/set_release_version.py "$version"     # line 58
git add package.json plugin.json              # line 59
git commit -m "release: $tag"                 # line 60
git tag -a "$tag" -m "Release $tag"           # line 61
```

But the repo's normal flow leaves `package.json`/`plugin.json` **already** at the
next base version (e.g. both are `0.3.2` now, ahead of the highest stable tag
`v0.3.1`, because `bump_next_patch.sh` bumps `dev` right after each release). So
`set_release_version.py 0.3.2` produces **no diff**, and the unconditional
`git commit` fails with "nothing to commit" — aborting the release under `set -e`.

The current line 62 (`node scripts/package.mjs --release`) runs **after** the tag.
Two problems to fix together: (a) the no-op commit, and (b) if packaging fails the
tag is already created, so the retry then dies on the "tag already exists" guard.
**Replace lines 58–62 inclusive** — the four lines above **plus** the packaging line
— with the block below, which (1) commits only when there's a diff, (2) packages
**before** tagging, and (3) makes `git tag` the **final** mutation, so a packaging
failure leaves no tag and the run is cleanly retryable. Tagging still happens exactly
once:

```bash
scripts/set_release_version.py "$version"
git add package.json plugin.json
if ! git diff --cached --quiet; then
  git commit -m "release: $tag"
else
  echo "release: package.json/plugin.json already at $version; tagging current HEAD"
fi
node scripts/package.mjs --release    # package BEFORE tagging (final mutation = tag)
git tag -a "$tag" -m "Release $tag"
```

Leave the printed push instructions after this block unchanged. Note in the session
log that the CHANGELOG `[X.Y.Z]` section is expected to already be on `main` (arrived
via the `dev → main` merge, per task 7) before running `release.sh` — the gate checks
it; this script does not create it.

**4c — Fix release.sh's now-stale self-description.** Because the commit is
conditional, the script no longer *always* creates a version commit. Update its own
text so it doesn't over-promise:
- In `usage()` (the here-doc, ~line 21), change "Prepare a stable release commit,
  annotated … tag, and … zip" to say the version commit is created **only when the
  metadata version changes**, otherwise it tags the current `HEAD`.
- In the final "Prepared $tag …" echo (~line 66), change "Review the commit, tag, and
  package." to wording that holds whether or not a commit was made (e.g. "Review the
  tag, package, and any version commit.").
These are message-only edits; do not change control flow.

### 5. Wire the gate into `.github/workflows/release.yml` (stable path ONLY)

The stable `version` is a **local shell variable inside the "Package selected
release channel" step** — it is NOT in scope in the separate "Publish stable GitHub
Release" step (which today only sets `TAG`). So you must export it. Do **exactly**
this (one prescribed contract, not alternatives):

1. In the **"Package selected release channel"** step, in the `refs/tags/v*` branch
   where `version` is computed, also emit it:

   ```bash
   echo "version=$version" >> "$GITHUB_OUTPUT"
   ```

2. In the **"Publish stable GitHub Release"** step (guarded by
   `steps.package.outputs.channel == 'stable'`), add `VERSION` to its `env:` block
   alongside the existing `TAG`:

   ```yaml
   env:
     GH_TOKEN: ${{ github.token }}
     TAG: ${{ steps.package.outputs.tag }}
     VERSION: ${{ steps.package.outputs.version }}
   ```

3. Replace that step's `gh release create … --title "$TAG" --generate-notes` run
   body with (note `set -euo pipefail` at the top, matching the repo's other steps):

   ```bash
   set -euo pipefail
   python3 scripts/changelog.py check "$VERSION"
   python3 scripts/changelog.py extract "$VERSION" > "$RUNNER_TEMP/release-notes.md"
   title="$(python3 scripts/changelog.py title "$VERSION")"
   gh release create "$TAG" \
     Decky-Metadata.zip \
     "Decky-Metadata-$TAG.zip.sha256" \
     "Decky-Metadata-$TAG.manifest.json" \
     --title "$title" --notes-file "$RUNNER_TEMP/release-notes.md"
   ```

The enriched `$title` still begins with `v$VERSION` (== `$TAG`), so the release
stays identifiable by tag; quoting `"$title"` safely preserves the em dash. Do
**NOT** modify the "Publish rolling dev prerelease" step (it keeps
`--generate`-free auto one-line notes).

### 6. Wire the gate into `.github/workflows/dev-release.yml`

**Ordering matters (BLOCKER found in review).** The current step order is
`Package dev prerelease` → **`Create and push dev tag`** (pushes `v$DEV_VERSION` to
origin) → `Publish dev prerelease`. If the Unreleased gate ran only in the publish
step and failed, the tag would already be pushed with no release, and re-running the
same commit would then fail because the tag exists. So **validate and build the
notes file BEFORE the tag is created.**

Add a new step **immediately before** "Create and push dev tag":

```yaml
- name: Validate and prepare dev release notes
  shell: bash
  run: |
    set -euo pipefail
    python3 scripts/changelog.py check --unreleased
    {
      echo "Automated development pre-release built from commit $FULL_SHA."
      echo
      python3 scripts/changelog.py extract --unreleased
    } > "$RUNNER_TEMP/dev-notes.md"
```

(`$RUNNER_TEMP` persists across steps in the same job, so the file is still there at
publish time.) Then change the **"Publish dev prerelease"** step to consume it —
only the notes source changes; title, prerelease flag, target, and asset list stay
as they are:

```bash
gh release create "v$DEV_VERSION" \
  Decky-Metadata.zip \
  "Decky-Metadata-v$DEV_VERSION.zip.sha256" \
  "Decky-Metadata-v$DEV_VERSION.manifest.json" \
  --prerelease \
  --target "$FULL_SHA" \
  --title "v$DEV_VERSION (Dev)" \
  --notes-file "$RUNNER_TEMP/dev-notes.md"
```

**Known, intended lifecycle:** right after a stable cut you may deliberately clear
`## [Unreleased]`; until a new Unreleased entry is added, `dev-release.yml` will
correctly refuse to publish a manual dev prerelease (there are no notes to ship).
This is by design — call it out in the session log and the AGENTS.md note (task 7)
so it isn't mistaken for a bug.

### 7. Docs

- In `AGENTS.md` §7, the existing sentence "it creates the local version commit,
  annotated tag, and hash-free package" is now inaccurate (the version commit is
  conditional). Adjust it to "it creates the version commit **when the metadata
  version changes** (otherwise it tags the current `HEAD`), an annotated tag, and a
  hash-free package".
- Add a short **"Release notes / CHANGELOG"** subsection to `AGENTS.md` §7 (Git
  Policy, near the `scripts/release.sh` description). It must state:
  - Stable releases require a curated, **dated** `## [X.Y.Z] - YYYY-MM-DD` section
    whose body leads with a non-bullet summary line; `scripts/release.sh` and CI
    enforce it via `scripts/changelog.py`, and the stable release **title** is
    enriched to `vX.Y.Z — <summary>` from that leading line.
  - The **release-cut procedure**, spelled out to avoid the duplicate-header trap
    **and** keep `dev`/`main` in sync: prepare the rollover **on `dev`, before the
    `dev → main` promotion**. On `dev`, **rename** the existing `## [Unreleased]`
    header to `## [X.Y.Z] - <today>` (do not add a second `[X.Y.Z]`), ensure it leads
    with a non-bullet summary line, insert a fresh empty `## [Unreleased]` above it,
    and commit. Then merge `dev → main --no-ff` and run `scripts/release.sh X.Y.Z` on
    the clean `main`. Doing the rename on `dev` (not `main`) means the post-release
    `bump_next_patch.sh` on `dev` sits on the fresh `[Unreleased]`, so manual dev
    prereleases don't republish stale notes and the next promotion won't conflict on
    the dated section. Fit this into the existing §7 stable flow (merge dev→main,
    `release.sh`, push, `bump_next_patch.sh` on dev).
  - Manual dev prereleases publish the current `## [Unreleased]` notes; **right
    after a stable cut the new `[Unreleased]` is empty, so `dev-release.yml` will
    refuse to publish until a new entry is added — this is intended, not a bug.**
- **Reconcile `## [Unreleased]` last.** Task 1 seeds it early (before this feature's
  own script/workflow/test/doc commits exist), so as the **final implementation
  step** — after all other commits are made — re-run `git log --no-merges v0.3.1..HEAD`
  and update `## [Unreleased]` so it accurately reflects everything landing for the
  upcoming release, explicitly including this changelog-gate work
  (`feat(release): gate publishes on CHANGELOG notes`). Commit that as the last
  changelog edit. (Pure changelog/session-log housekeeping commits need not list
  themselves.)
- Record a session summary under `docs/agent_conversations/` per AGENTS.md §9.

Keep commits atomic and Conventional (e.g. `feat(release): gate publishes on
CHANGELOG notes`, `test(release): cover changelog gate`, `docs(agents): document
changelog release gate`).

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

Run from the repo root. **The whole block must be self-failing** — run it with
`set -euo pipefail`, and write every *expected-failure* check as an explicit
`if cmd; then echo FAIL; exit 1; fi` (a bare `! cmd && echo …` is NOT caught by
`set -e` because `!` suppresses errexit, so an unexpected success would slip through
and a later successful command would leave the block green). A positive check that
fails aborts under `set -e`; a `must_fail` helper handles the negatives.

```bash
set -euo pipefail
cl() { python3 scripts/changelog.py "$@"; }         # convenience
must_fail() { if "$@"; then echo "FAIL: unexpectedly succeeded: $*" >&2; exit 1; fi; }

# 1. New files exist and the script is executable.
test -f CHANGELOG.md && test -x scripts/changelog.py && echo "files OK"

# 2. Unit tests pass (repo cache wrapper + ephemeral uv env, per quality-gates;
#    do NOT call pytest bare).
./run.sh uv run --with pytest -- pytest -q tests/test_changelog.py

# 3. Seed is Unreleased-only (no [0.3.2] until the release-time rename): the
#    dev-release dependency is what we assert here.
cl check --unreleased                          # exit 0 (dev-release depends on this)
test -n "$(cl extract --unreleased)" && echo "unreleased extract OK"
must_fail cl check 0.3.2                        # no stable [0.3.2] section yet

# 4. Missing / malformed version args are rejected (per-item; a bare `for` returns
#    only the LAST status and would mask an earlier accepted arg).
must_fail cl check 9.9.9
for bad in vv0.3.2 0.3 1.2.3.4 01.2.3 1.2.3-dev 1.2.3+g0; do must_fail cl check "$bad"; done
echo "version-format rejections OK"

# 5. Stable check/extract/title via the mandatory --file option (proves the
#    enriched-title contract without a real cut).
f=/tmp/Decky-Metadata/vfix-changelog.md
printf '# Changelog\n\n## [0.3.2] - 2026-07-17\nRelease hardening and CI cleanup.\n\n- fix(ci): pin actions\n' > "$f"
cl --file "$f" check 0.3.2 && echo "stable check OK"
test -n "$(cl --file "$f" extract 0.3.2)" && echo "extract OK"
cl --file "$f" title 0.3.2                                    # expect: v0.3.2 — Release hardening and CI cleanup
cl --file "$f" title 0.3.2 | grep -Eq '^v0\.3\.2 — .+$' && echo "title enriched OK"
# Bullet-first stable (no summary) MUST fail:
printf '# Changelog\n\n## [0.3.9] - 2026-07-17\n- only a bullet\n' > "$f"; must_fail cl --file "$f" check 0.3.9
# Undated stable MUST fail:
printf '# Changelog\n\n## [0.3.9]\nSummary line.\n\n- bullet\n' > "$f"; must_fail cl --file "$f" check 0.3.9
# Calendar-invalid date MUST fail; a real leap day passes:
printf '# Changelog\n\n## [0.3.9] - 2026-02-30\nSummary.\n' > "$f"; must_fail cl --file "$f" check 0.3.9
printf '# Changelog\n\n## [0.3.9] - 2028-02-29\nSummary.\n' > "$f"; cl --file "$f" check 0.3.9 && echo "leap-day OK"
# Structural / placeholder bodies are NOT substantive:
printf '# Changelog\n\n## [Unreleased]\n- \n' > "$f";            must_fail cl --file "$f" check --unreleased  # bare bullet
printf '# Changelog\n\n## [Unreleased]\n1. TODO\n' > "$f";       must_fail cl --file "$f" check --unreleased  # ordered placeholder
printf '# Changelog\n\n## [Unreleased]\n- [ ] TODO\n' > "$f";    must_fail cl --file "$f" check --unreleased  # task-list placeholder
printf '# Changelog\n\n## [Unreleased]\n- - -\n' > "$f";         must_fail cl --file "$f" check --unreleased  # spaced thematic break
printf '# Changelog\n\n## [Unreleased]\n<!--\nhidden\n-->\n' > "$f"; must_fail cl --file "$f" check --unreleased  # multiline comment
printf '# Changelog\n\n## [Unreleased]\n<!--\nnever closed\n' > "$f"; must_fail cl --file "$f" check --unreleased  # unterminated comment to EOF
printf '# Changelog\n\n## [Unreleased]\n```\n```\n' > "$f";      must_fail cl --file "$f" check --unreleased  # only code fences
printf '# Changelog\n\n## [Unreleased]\n>\n' > "$f";             must_fail cl --file "$f" check --unreleased  # empty blockquote
echo "structural rejections OK"

# 6. release.sh wiring AND ordering, asserted structurally (do NOT run release.sh —
#    it requires clean main and exits on its guards first).
python3 - <<'PY'
src = open("scripts/release.sh").read().splitlines()
def idx(needle): return next(i for i, l in enumerate(src) if needle in l)
chk  = idx("changelog.py check")
gate = idx("run-quality-gates")
setv = idx("set_release_version.py")
pkg  = idx("package.mjs")
tag  = idx("git tag -a")
assert chk < gate < setv < pkg < tag, f"release.sh order wrong: {chk,gate,setv,pkg,tag}"
assert sum("git tag -a" in l for l in src) == 1, "expected exactly one git tag -a"
assert any("git diff --cached --quiet" in l for l in src), "missing no-op-commit guard"
print("release.sh order OK")
PY

# 7. Duplicate-header safety, including the malformed twin (caught on the key).
printf '# Changelog\n\n## [0.3.2] - 2026-07-17\nreal\n\n## [0.3.2] - July 17\nother\n' > "$f"
must_fail cl --file "$f" check 0.3.2 && echo "duplicate-header rejected"

# 8. Full project quality gate stays green.
scripts/orchestration/run-quality-gates

# 9. Workflow wiring, asserted STRUCTURALLY (parse YAML, inspect exact steps +
#    ordering, so a substring in the wrong step can't false-pass). PyYAML via uv.
./run.sh uv run --with pyyaml -- python - <<'PY'
import yaml
def steps(path, job): return yaml.safe_load(open(path))["jobs"][job]["steps"]
def names(sts): return [s.get("name") for s in sts]
def step(sts, name): return next(s for s in sts if s.get("name") == name)

# --- release.yml stable path ---
rel = steps(".github/workflows/release.yml", "publish")
pkg = step(rel, "Package selected release channel")
assert 'echo "version=' in pkg["run"], "stable version not exported to GITHUB_OUTPUT"
assert ">> \"$GITHUB_OUTPUT\"" in pkg["run"], "package step doesn't append to GITHUB_OUTPUT"
pub = step(rel, "Publish stable GitHub Release")
assert pub["env"].get("VERSION") == "${{ steps.package.outputs.version }}", "VERSION env not bound"
r = pub["run"]
for needle in ("changelog.py check", "changelog.py extract", "changelog.py title", "--notes-file"):
    assert needle in r, f"stable publish missing {needle}"
assert "--generate-notes" not in r, "stable publish still auto-generates notes"
# gate must run BEFORE publish: check < extract < title < gh release create
seq = [r.index(x) for x in ("changelog.py check", "changelog.py extract", "changelog.py title", "gh release create")]
assert seq == sorted(seq), f"stable publish step out of order: {seq}"
rolling = step(rel, "Publish rolling dev prerelease")["run"]
assert "Automated development build" in rolling, "rolling dev step changed"
assert "changelog.py" not in rolling and "--notes-file" not in rolling, "rolling dev step must stay ungated"

# --- dev-release.yml: package < validate < tag < publish ---
dev = steps(".github/workflows/dev-release.yml", "dev-release")
n = names(dev)
order = [n.index(x) for x in ("Package dev prerelease",
                              "Validate and prepare dev release notes",
                              "Create and push dev tag",
                              "Publish dev prerelease")]
assert order == sorted(order), f"dev-release step order wrong: {order}"
val = step(dev, "Validate and prepare dev release notes")["run"]
assert "check --unreleased" in val and "extract --unreleased" in val, "dev validation missing check/extract"
dpub = step(dev, "Publish dev prerelease")["run"]
assert "--notes-file" in dpub, "dev publish not using notes-file"
assert "check --unreleased" not in dpub, "dev validation must live in the pre-tag step, not publish"
print("workflow wiring OK")
PY

git status --short   # only new/edited files from this plan
```

**Deferred verification (state in the session log; do NOT attempt locally):** the
GitHub Actions publish steps (`gh release create` with `--notes-file` on a real tag
push, and the manual `dev-release.yml` dispatch) can only be exercised on GitHub
against real credentials and a real tag/dispatch. Verify their shell logic locally
by extracting the step scripts and running them with a stubbed `gh` (a shell
function that echoes its args) plus a fixture `RUNNER_TEMP`, and confirm the
`--notes-file` path is populated from `scripts/changelog.py extract`; the actual
publish is confirmed on the next real release. Do not push tags or dispatch
workflows from this plan.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished changelog-release-gate
```

This writes:

```text
/tmp/Decky-Metadata/changelog-release-gate_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer changelog-release-gate`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/changelog-release-gate-review-*.md
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
   scripts/orchestration/clear-finished changelog-release-gate
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
   git add docs/review/changelog-release-gate-review-*.md
   git commit -m "docs(review): record changelog-release-gate review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished changelog-release-gate
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer changelog-release-gate` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed changelog-release-gate
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize changelog-release-gate
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Decky-Metadata/changelog-release-gate_finalized
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
scripts/orchestration/finalize changelog-release-gate
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Decky-Metadata/changelog-release-gate_finished
/tmp/Decky-Metadata/changelog-release-gate_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
