---
name: decky-release-notes
description: Draft and maintain this repo's CHANGELOG release notes and prepare a stable release cut. Use when asked to write or refresh release notes / the changelog Unreleased section, summarize commits since the last release, or cut/prepare a stable release for Decky-Metadata. Produces notes that satisfy the scripts/changelog.py gate; it never pushes, tags, or promotes.
---

# Decky Release Notes

## Boundaries

Author release notes and prepare a cut, but never push, tag, or perform the
`dev → main` promotion. This skill does not run scripts/release.sh; those actions
remain human-gated under `AGENTS.md` §7.

## Mode A — Draft or refresh `[Unreleased]`

1. Resolve the comparison base with
   `base="$(scripts/version_guard.py highest)"`. If it is empty, use the
   repository's first commit as the base.
2. Read subjects with
   `git log --no-merges "$base"..HEAD --format='%s'`. Group useful commits by
   Conventional Commit type: `feat`, `fix`, `refactor`, `perf`, `docs`, `ci`, and
   `chore`. Drop subjects that only maintain the changelog or session logs.
3. Rewrite only the body below `## [Unreleased]` in `CHANGELOG.md`. Begin with an
   imperative, non-bullet summary line of about 72 characters or fewer, without a
   required trailing period. Follow it with a blank line and grouped `- ` bullets.
   Leave every historical section byte-for-byte unchanged.
4. Verify with `scripts/changelog.py check --unreleased`. Use
   `scripts/changelog.py extract --unreleased` to inspect the exact notes the gate
   sees. The check must exit zero.
5. Show the diff and stop for human review. Commit only when the user asks, on the
   current working branch and never directly to `dev`, with a Conventional Commit
   such as `docs(changelog): refresh Unreleased notes`.

## Mode B — Prepare a release cut `X.Y.Z`

1. Require a clean tree on `dev`. Confirm `X.Y.Z` is a valid stable SemVer and is
   ahead of `scripts/version_guard.py highest`.
2. Optionally complete Mode A first so `[Unreleased]` is current.
3. Rename `## [Unreleased]` to `## [X.Y.Z] - YYYY-MM-DD` using today's real ISO
   date; do not create a second `[X.Y.Z]` header. Ensure the renamed section begins
   with a non-bullet summary line, then insert a fresh empty `## [Unreleased]`
   header above it.
4. Verify with `scripts/changelog.py check X.Y.Z`; it must exit zero. Use
   `scripts/changelog.py extract X.Y.Z` to review the gated release notes.
5. Hand off without executing release actions: tell the human to commit the
   changelog on `dev`, merge `dev → main --no-ff` per `AGENTS.md` §7, and run
   `scripts/release.sh X.Y.Z` on clean `main`. That script re-checks the gate and
   prints the push commands. Stop here.

The deterministic `scripts/changelog.py` gate in CI and `scripts/release.sh`
enforces the notes; this skill only helps produce them.
