# Deterministic Agent Workflow Implementation

## Objective

Implement the tracked deterministic-agent-workflow plan by composing existing Deck tooling into stable project-local commands, diagnostics, package delivery, routing documentation, and an optional canonical skill.

## Files and architecture

- Added the thin `scripts/decky` dispatcher and stable doctor/log/fixture Python modules.
- Added read-only diagnostic capture and SteamUI snapshot scripts under `scripts/deck/`.
- Consolidated package creation/delivery behind a locked `package_push.sh` primitive and made the existing Git hook delegate to it.
- Added default-nonmutating hook and project-skill installers.
- Generated `skills/decky-project-workflow/` with the active `skill-creator` initializer, then kept its instructions focused on the three starting modes and existing orchestration ownership.
- Added synthetic fixtures and focused tests. Raw device/user metadata was not copied into the repository.

## Decisions and safety boundaries

- `--deck` is read-only. Deployment requires `--device`; real launch/termination additionally requires `--allow-launch` and a configured safe fixture.
- Package build and push are separate explicit stages outside the already-authorized post-commit/post-merge path.
- Diagnostic raw evidence stays in a marked restricted directory below `/tmp/Decky-Metadata`; full settings remain opt-in.
- Local validation, package creation, delivery, and installed state remain independent statuses so a Deck outage does not invalidate a local merge.

## Explicit non-goals

- No changes to the shared `scripts/orchestration` engine or lifecycle state.
- No package delivery from `scripts/orchestration-hooks/finalize-release`.
- No automatic skill installation into real agent homes, plugin installation, Steam reload from package delivery, `dev` to `main` promotion, or relocation of `node_modules`.
- No plugin runtime changes in `main.py`, `backend/`, or `src/`.

## Validation

- Baseline orchestration quality gates passed before implementation.
- Focused workflow tests passed: 31 tests, including the review-hardening cases
  for package locking/provenance, remote SteamUI assets, diagnostic privacy,
  semantic fixtures, and exact hook/skill installer behavior.
- `bash -n` passed for all new and modified shell scripts.
- `skill-creator` quick validation passed using `/home/beallio/.codex/skills/.system/skill-creator/scripts/quick_validate.py`.
- The full project quality gate passed (frontend type-check/build, 18 Vitest
  tests, Python byte-compilation, and 214 pytest tests).

## Deferred live checks

Live Deck checks are intentionally deferred until the user authorizes device availability and mutation. Read-only doctor, log sync/audit, capture, SteamUI snapshot/search, semantic fixture confirmation, modifying deploy/reload checks, real launch smoke, and physical-controller Play/focus checks remain deferred as specified by the plan.

## Review round 02 hardening

- Changed `verify-change` classification to union requirements across every
  changed path in stable order. A required launch smoke now remains `DEFERRED`
  without launch consent, and consent is rejected unless `MATCHED_APPID` is
  explicitly configured.
- Made package delivery idempotent by treating the ledger as a hint and
  revalidating the local archive plus remote checksum before skipping duplicate
  build/copy work. `--force` bypasses the skip, and JSON-mode build/copy progress
  is kept off stdout.
- Restricted diagnostic roots to mode 0700 and raw evidence/settings to mode
  0600, rejected state roots outside `/tmp`, and applied the same temp-root
  boundary to the dispatcher, package state, and SteamUI snapshots.
- Replaced last-line hook recognition with exact complete-body validation for
  canonical delegates and the three explicitly supported installed legacy
  delegates.
- Added deterministic first/last raw source evidence to every normalized
  log-audit group.

Round 02 validation passed: 39 focused workflow tests, shell syntax checks,
Python compilation, exact hook checks, skill quick validation, `git diff
--check`, 18 Vitest tests, and 222 pytest tests. The five pre-existing untracked
JSON files remained untouched. Live Deck and physical-controller checks remain
deferred under the plan's authorization gates.

## Review round 03 package reporting

- Cleared superseded archive-validation error state after a successful rebuild,
  so a pre-build stale archive cannot contradict later passing package stages.
- Added JSON and human-output regression coverage for rebuilding a stale archive
  to the current stamped version. Real build and validation failures continue to
  retain their independent stage statuses and diagnostics.

Round 03 validation passed: the package suite, complete focused workflow suite,
shell syntax checks, Python compilation, hook and skill checks, full project
quality gate, review-note preservation, and diff hygiene. Live Deck and
physical-controller checks remain deferred under the plan's authorization gates.
