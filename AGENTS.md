# Playhub Metadata — Agent Operating Contract
## Self-Enforcing Agent Protocol

Protocol Version: 2

This document is the project-local operating contract for agents working in this
directory or its subdirectories. It adapts the universal scripting standards from
`project_template` to this repository's actual stack, and it wires in the
`agent-orchestration` plan → implement → review → finalize engine.

Playhub Metadata is a **Decky Loader plugin** for Steam Big Picture on Windows:

- **Frontend:** TypeScript / React in `src/*.ts(x)`, bundled by **rollup** into
  `dist/index.js` (the committed plugin artifact). Tooling is **npm / pnpm**.
- **Backend:** a single-file Python module, `main.py`, using only the standard
  library and the Decky runtime.

There is **no uv project layout** here, but Python backend tests run through
`uv run --with pytest` in an ephemeral environment (`.protocol: TDD_REQUIRED=true`).
The quality gate is build + static check + pytest, defined in
`scripts/orchestration-hooks/quality-gates`.

---

# 1. Session Initialization

Before implementation work, verify state with `pwd`, `ls`, `git status`, and config
inspection, then output this handshake:

```
AGENT_PROTOCOL_HANDSHAKE

Project Root:
Detected Language(s): TypeScript/React, Python
Execution Mode: Project
Git Repository Present: (Yes/No)
Cache Root: /tmp/Playhub-Metadata-local
Protocol Version: 2
Command Wrapper: ./run.sh

Confirmed Policies:
[ ] Top-down planning
[ ] Cache isolation (/tmp, never inside Dropbox)
[ ] Verified filesystem state
[ ] Verified dependency state (package.json / node_modules)
[ ] Verified run wrapper

STATUS: READY
```

If any field cannot be confirmed, pause and resolve it before implementation.

---

# 2. Project Structure

```
AGENTS.md                         # this contract
.protocol                         # machine-readable policy flags
.envrc / run.sh                   # cache-isolation env + command wrapper
package.json / tsconfig.json      # frontend build config (rollup, tsc)
rollup.config.js                  # bundles src/ -> dist/index.js
src/*.ts(x)                       # TypeScript/React frontend
dist/index.js                     # committed build artifact
main.py                           # Python backend (Decky)
plugin.json                       # Decky plugin manifest
scripts/check_tdd.sh              # pre-commit sanity check
scripts/orchestration            # symlink -> agent-orchestration engine
scripts/orchestration-hooks/      # project quality-gates + finalize-release
orchestration.conf                # orchestration engine config (committed)
docs/plans/                       # implementation plans (write before code)
docs/specs/                       # durable behavior/interface specs
docs/review/                      # review notes (also used by the engine)
docs/agent_conversations/         # session summaries
```

Never reference files that have not been confirmed through filesystem inspection.

---

# 3. Command and Cache Policy

All temp files, tool caches, and installs must live under:

```
/tmp/Playhub-Metadata-local/
```

Run project commands through the wrapper so the redirections apply:

```
./run.sh npm ci
./run.sh npm run build
./run.sh npx tsc --noEmit
./run.sh python3 -m py_compile main.py
```

`run.sh` exports `TMPDIR`, `XDG_CACHE_HOME`, `npm_config_cache`, and
`PYTHONPYCACHEPREFIX` under the cache root. **No generated caches, `node_modules`,
or build temp may be committed inside the repo.** (`dist/index.js` is the one
intentionally committed build output.)

---

# 4. Dependency Policy

- Frontend deps come from `package.json` / `package-lock.json`. Install with
  `npm ci` (or `pnpm install --frozen-lockfile`). Never assume a package exists —
  verify it in `package.json` or `node_modules`.
- The backend (`main.py`) targets the Python standard library and the Decky
  runtime. Do not add third-party Python dependencies without an explicit plan
  entry — Decky plugins ship without a package manager on-device.
- If API behavior is uncertain: read the project source, then `@decky/*` or
  official docs, then web search. Speculative code is forbidden.

---

# 5. Execution Protocol

Lifecycle for a modifying task:

```
ANALYZE → PLAN → IMPLEMENT → VALIDATE → COMMIT → DOCUMENT
```

- **PLAN:** for non-trivial work, create or update `docs/plans/<feature>.md`
  (Problem Definition, Architecture Overview, Public Interfaces / data shapes,
  Dependency Requirements, Validation Strategy). For agent-orchestrated runs the
  plan lives at `docs/plans/<date>_<slug>.md`.
- **VALIDATE:** run the quality gate (Section 6) and confirm it passes.
- **COMMIT:** Conventional Commits, on a feature branch (Section 7).
- **DOCUMENT:** update `README.md` when behavior/usage changes; record a session
  summary in `docs/agent_conversations/` for implementation tasks.

For review-only tasks that do not modify files, stop after ANALYZE and report
findings.

---

# 6. Quality Gate (Definition of Done)

Before any commit, the change must pass the project quality gate:

```
./scripts/orchestration-hooks/quality-gates
```

which runs:

```
npx tsc --noEmit          # frontend type-check
npm run build             # rollup bundle -> dist/index.js
python3 -m py_compile main.py   # backend syntax check
uv run --with pytest -- pytest -q   # backend tests
```

A modifying task is complete only when:

```
[ ] tsc --noEmit passes
[ ] npm run build succeeds (dist/index.js regenerated when frontend changed)
[ ] main.py byte-compiles
[ ] pytest passes when tests/ exists
[ ] README updated when behavior or usage changed
[ ] caches/installs stayed under /tmp/Playhub-Metadata-local
[ ] session log recorded in docs/agent_conversations/
```

The `scripts/check_tdd.sh` pre-commit hook runs the lighter staged-file subset of
these checks.

---

# 7. Git Policy

Work on feature branches, never directly on `main`:

```
feat/<feature>   fix/<bug>   refactor/<component>   docs/<topic>
```

Commits use Conventional Commits:

```
feat(achievements): add Xbox source fallback
fix(steam): handle missing app id in news fetch
refactor(backend): extract metadata matcher
docs(readme): document RetroAchievements setup
```

Prefer small, atomic commits (one coherent change each). Commit the passing
current change before starting an unrelated one. Generated artifacts (caches,
`node_modules`, zips) must never be committed.

When cutting a release tag, bump `version` in `package.json` and `plugin.json`,
and increment the `cacheBuster` parameter on README image URLs so they refresh.

---

# 8. Agent Orchestration (plan → implement → review → finalize)

This repo is wired to the `agent-orchestration` engine via
`scripts/orchestration` (symlink) and `orchestration.conf`
(`ORCH_IMPLEMENTER="codex"`, `ORCH_BASE_BRANCH="main"`,
`ORCH_TMP_ROOT="/tmp/Playhub-Metadata-local"`).

Two skills drive it:

- **`orchestration-plan-author`** — scopes a request and writes a validated plan to
  `docs/plans/<date>_<slug>.md`, then stops. Safe to auto-trigger.
- **`/orchestrated-implementation`** — explicitly launches the background
  implementer on a plan, drives review cycles (`docs/review/<slug>-review-NN.md`),
  and merges the `feat/<slug>` branch on approval.

The engine's `finalize` calls `scripts/orchestration-hooks/{quality-gates,
finalize-release}`. The base → `main` promotion is always a human gate. See
`agent-orchestration/USAGE.md` for the conversational workflow.

---

# 9. Documentation & Session Logging

For implementation tasks, record a summary in `docs/agent_conversations/`
(date, task objective, files modified, design decisions, validation results),
e.g. `docs/agent_conversations/2026-06-28_integrate-governance.md`.

---

# 10. Failure Recovery

On failure: capture the error output, identify the failing component, fix the
root cause, and re-run the quality gate. Blind retries are forbidden.
