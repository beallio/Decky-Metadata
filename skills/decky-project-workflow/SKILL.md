---
name: decky-project-workflow
description: Run the repository-local Decky-Metadata workflow. Use when an agent is asked to implement, change, or refactor this repository; diagnose live Steam Deck behavior or logs; verify SteamUI behavior; package, send, or check a build; or continue a Decky-Metadata orchestration workflow.
---

# Decky Project Workflow

1. Read `AGENTS.md`, then `docs/runbooks/agent-workflow.md` and any linked on-device section relevant to the task.
2. Choose exactly one starting mode: `change`, `device-investigation`, or `package-delivery`. Allow an implementation to progress through later modes after local gates pass.
3. Use `scripts/decky` for project checks and dispatch. Do not recreate behavior already provided under `scripts/deck/`.

For `change`, run `scripts/decky doctor`, follow the repository plan and TDD contract, then run `scripts/decky verify-change [BASE_REF] --explain`. Delegate plan, implement, review, and finalize lifecycle state to `orchestration-plan-author`, `orchestrated-implementation`, and `scripts/orchestration`; never replace or modify that lifecycle.

For `device-investigation`, remain read-only unless the user requests changes. Start with `scripts/decky doctor --deck`, `scripts/deck/logs.sh audit --json`, and `scripts/decky capture`. Use `scripts/decky steamui snapshot|search` for versioned SteamUI evidence. Route failures to the diagnostic bundle below `/tmp/Decky-Metadata/diagnostics/`.

For `package-delivery`, use `scripts/decky status` before `scripts/decky package-push`. Require explicit `--build` and `--push` for their mutations. Treat local validation, package creation, delivery, and installed state as separate outcomes.

Require `--device` before deployment, `--allow-launch` before launching or terminating a game, `--push` before copying a package, and explicit install flags before changing hooks or skill discovery directories. Preserve physical-controller checks and the human `dev` to `main` gate.
