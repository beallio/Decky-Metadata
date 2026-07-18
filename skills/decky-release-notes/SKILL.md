---
name: decky-release-notes
description: Draft and maintain this repo's CHANGELOG release notes or perform a maintainer-authorized local stable release cut. Use when asked to write or refresh release notes, summarize commits since the last release, or cut, prepare, push, or publish a stable Decky-Metadata release. Produces notes that satisfy the scripts/changelog.py gate; publishing requires an explicit per-invocation instruction.
---

# Decky Release Notes

## Boundaries

The maintainer invoking this skill authorizes the local `dev → main` promotion,
annotated tag, package, and version commit created by `scripts/release.sh`. The
skill never pushes by default. Push only if the maintainer's request contains an
explicit per-invocation publish instruction; in other words, it may push only if
that authorization is present. The public `git push` remains the single
outward-facing gate. If publish intent is ambiguous, stop and ask rather than
guessing.

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

## Mode B — Cut a stable release `X.Y.Z`

1. Require the `dev` branch and a clean working tree. Confirm `X.Y.Z` is a strict
   stable SemVer. If `[Unreleased]` is not current, complete Mode A's drafting flow
   first using
   `git log --no-merges "$(scripts/version_guard.py highest)"..HEAD --format='%s'`.
   Do not continue until the notes are substantive and summary-led.
2. Run `scripts/changelog.py rollover X.Y.Z`. This validates that the version is
   ahead of `scripts/version_guard.py highest`, deterministically moves the notes
   to today's dated stable section, inserts a fresh empty `[Unreleased]`, and
   self-checks the result. Also run `scripts/changelog.py check X.Y.Z` and inspect
   `scripts/changelog.py extract X.Y.Z`.
3. Commit `CHANGELOG.md` on `dev` with a Conventional Commit such as
   `docs(changelog): roll over to X.Y.Z`.
4. Run `git checkout main`, then `git merge --no-ff dev`. The maintainer's Mode B
   invocation is the authorization for this local `dev → main` promotion.
5. On clean `main`, run `scripts/release.sh X.Y.Z`. It re-checks the gate, creates
   any required version commit, builds the hash-free package, and creates the
   annotated `vX.Y.Z` tag locally. It does not push.
6. **Push gate — default STOP.** Present the prepared tag, package, any version
   commit, and these exact commands, then stop:

   ```text
   git push origin main
   git push origin vX.Y.Z
   ```

7. Push only if the current request contains an explicit per-invocation publish
   instruction such as "push", "publish", or "release it live". When authorized,
   run both push commands, then run `git checkout dev` and
   `scripts/bump_next_patch.sh`. Commit the changed `package.json` and `plugin.json`
   as the next development base. If the request is ambiguous, do not push; stop
   and ask.

The deterministic `scripts/changelog.py` gate, rollover command, and
`scripts/release.sh` enforce the local cut. Public publishing remains separately
opted in for each invocation.
