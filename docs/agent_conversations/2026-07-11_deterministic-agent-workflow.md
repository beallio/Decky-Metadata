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
