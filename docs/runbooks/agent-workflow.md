# Agent Workflow

Use the tracked dispatcher for deterministic project and Deck operations. Generated evidence always stays under `/tmp/Decky-Metadata`.

## Change

```bash
scripts/decky doctor
scripts/decky verify-change dev --explain
```

The second command runs local gates and classifies changed paths. A reported `DEFERRED` status names required Deck checks without mutating the device. Only an authorized modifying run may add `--device`; add `--allow-launch` only when launching the configured safe fixture is also authorized. Follow the existing plan/review/finalize flow through `scripts/orchestration`. Promotion from `dev` to `main` remains a human gate.

## Device investigation

```bash
scripts/decky doctor --deck
scripts/deck/logs.sh audit --json
scripts/decky capture
scripts/decky steamui snapshot
scripts/decky steamui search 'PATTERN'
```

These commands are read-only. Capture stores derived reports and restricted raw evidence separately. Full settings require `--include-settings` and a privacy warning. See [on-device verification](on-device-verification.md) before any deployment, reload, or game smoke.

## Package delivery

```bash
scripts/decky status --deck
scripts/decky package-push --build --push
```

The package command separately reports local validation, package creation, delivery, and installed state. It never installs the plugin or reloads Steam. An offline Deck is pending for the authorized Git hook but fails an explicit push.

## Optional setup

Both installers are non-mutating by default:

```bash
scripts/install_hooks.sh --check
scripts/install_project_skill.sh --dest /tmp/Decky-Metadata/skill-install-test
```

Use `--install` explicitly. The skill installer refuses external Git worktrees unless `--allow-external-worktree` is also supplied.
