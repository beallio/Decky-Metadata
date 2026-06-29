# Session: Integrate project_template governance + agent-orchestration engine

- **Date:** 2026-06-28
- **Task objective:** Integrate `~/Dropbox/Scripts/project_template` (agent governance
  scaffold) and `~/Dropbox/Scripts/agent-orchestration` (plan→implement→review→finalize
  engine) into the Playhub Metadata Decky plugin.

## Decisions
- **Governance adapted to the real stack**, not copied verbatim: this repo is a
  TypeScript/React frontend (rollup/npm) + single-file Python backend (`main.py`),
  not a uv/pytest project. Strict TDD disabled (`.protocol: TDD_REQUIRED=false`);
  quality gate is `tsc --noEmit` + `npm run build` + `py_compile main.py`.
- **Orchestration implementer:** `codex` (`ORCH_IMPLEMENTER="codex"`),
  `ORCH_BASE_BRANCH="main"`, `ORCH_TMP_ROOT="/tmp/Playhub-Metadata-local"`.

## Files added / modified
- `scripts/orchestration` — symlink to `agent-orchestration/orchestration` (via install.sh)
- `orchestration.conf` — configured (implementer/base branch/tmp root)
- `scripts/orchestration-hooks/quality-gates` — real build + syntax gate
- `scripts/orchestration-hooks/finalize-release` — safe no-op (manual release)
- `AGENTS.md` — adapted operating contract
- `run.sh`, `.envrc`, `.protocol` — cache isolation under /tmp/Playhub-Metadata-local
- `scripts/check_tdd.sh` — staged-file tsc/py_compile pre-commit check
- `docs/{plans,specs,review,agent_conversations}/` — governance + engine workspace
- `.git/hooks/pre-commit` — runs `scripts/check_tdd.sh` (local, untracked)
- `.gitignore` — `orchestration.conf.local` added by installer

## Validation
- All new shell scripts pass `bash -n`.
- Orchestration symlink resolves; `latest-plan` reads `docs/plans`; `status --all` clean.
- `main.py` byte-compiles.
- Full `npm run build` not run in this session (no source change); gate is ready to run.

## How to use
- Ask for a plan → `orchestration-plan-author` writes `docs/plans/<date>_<slug>.md`.
- `/orchestrated-implementation` → runs the codex implementer, review cycles, merges
  `feat/<slug>` into `main` (base→main promotion stays a human gate).
- See `agent-orchestration/USAGE.md` for the conversational workflow.
