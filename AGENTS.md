# Decky-Metadata — Agent Operating Contract
## Self-Enforcing Agent Protocol

Protocol Version: 2

This document is the project-local operating contract for agents working in this
directory or its subdirectories. It adapts the universal scripting standards from
`project_template` to this repository's actual stack, and it wires in the
`agent-orchestration` plan → implement → review → finalize engine.

Decky-Metadata is a **Decky Loader plugin** for SteamOS / Steam Deck (Steam Gaming Mode):

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
Cache Root: /tmp/Decky-Metadata
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
/tmp/Decky-Metadata/
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

### Mandatory workflow routing

| Trigger | Required start | Mutation boundary |
| --- | --- | --- |
| Implement/change/refactor | `scripts/decky doctor`, then `scripts/decky verify-change [BASE] --explain` | `--device` deploys; `--allow-launch` permits a configured launch fixture |
| Diagnose Deck/log behavior | `scripts/decky doctor --deck`, `scripts/deck/logs.sh audit --json`, `scripts/decky capture` | read-only unless the user requests changes |
| Inspect SteamUI | `scripts/decky steamui snapshot` / `search PATTERN` | snapshots only below `/tmp/Decky-Metadata` |
| Package/send/check | `scripts/decky status --deck`, then `scripts/decky package-push` | require explicit `--build` / `--push` outside an authorized hook |

Use [docs/runbooks/agent-workflow.md](docs/runbooks/agent-workflow.md) for the
detailed flow. Hook and skill installers default to checks/dry-runs and require
`--install`. Device deployment, launch, package copying, and the `dev` to `main`
promotion retain their explicit flags and human gates.

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
[ ] vitest passes (frontend unit tests: src/**/*.test.ts)
[ ] main.py byte-compiles
[ ] pytest passes when tests/ exists
[ ] README updated when behavior or usage changed
[ ] caches/installs stayed under /tmp/Decky-Metadata
[ ] session log recorded in docs/agent_conversations/
[ ] on-device checks run for src/steam/ changes (see below)
```

**On-device verification.** Changes under `src/steam/` must additionally pass
the live checks on the Deck — two shipped regressions were invisible to the
static gates. Use the committed tooling in `scripts/deck/` (tunnel, CDP
client, deploy loop, smoke suite) instead of recreating it ad hoc:

```
scripts/deck/deploy.sh            # build -> push -> hard reload -> wait
scripts/deck/verify/run_all.sh    # launch / quick-links / re-render smokes
```

Which checks each change requires, plus debugging recipes and hazards
(notably: NEVER enumerate MobX store instances — overview/details/appStore —
inside a render-phase tree walk; it wedges the renderer), are documented in
`docs/runbooks/on-device-verification.md`. For QAM/panel/editor focus and D-pad
order, drive `scripts/deck/cdp.py input` (synthetic controller keys) plus the
`js/gpfocus_dump.js` / `js/focus_order.js` probes — do not hand-roll a
key-dispatch script (see that runbook's "Controller navigation & initial focus").

The `scripts/check_tdd.sh` pre-commit hook runs the lighter staged-file subset of
these checks.

`scripts/post_commit.sh` is an optional build-package-push hook that builds +
packages the plugin (`npm run package`, which stamps the short git hash into the
plugin version) and `scp`s the fixed-name `Decky-Metadata.zip` to the Steam Deck
for the Developer-Mode sideload loop. It runs only on `dev`/`main` by default (set
`DECKY_POST_COMMIT_ALL=1` to force any branch), skips the push when the Deck is
unreachable, and never blocks a commit. Config: `DECKY_DECK_HOST` (default `steamdeck`),
`DECKY_DECK_DEST` (default `/home/deck/Downloads/`).

Install the script as **both** hooks, each execing it (same pattern as
`pre-commit`):

- `.git/hooks/post-commit` — fires on direct `git commit` (e.g. feature-branch work).
- `.git/hooks/post-merge` — fires on `git merge` / `git pull`. This one is
  required for the orchestration flow: `dev` is advanced only by `git merge --no-ff`,
  and **git merge fires `post-merge`, not `post-commit`**, so without it the auto
  build/package/push never runs when work lands on `dev`.

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

After the human-approved `dev` → `main` promotion, prepare a stable release with
`scripts/release.sh`; it creates the local version commit, annotated tag, and
hash-free package but only prints the outward-facing push commands. Pushing the
tag lets GitHub Actions publish `Decky-Metadata.zip` **plus** the self-updater
sidecars `Decky-Metadata-<tag>.zip.sha256` and `Decky-Metadata-<tag>.manifest.json`
(the manifest carries the whole-zip sha256 the updater and Decky Loader verify).
Then move the dev base to the next patch so the drift guard stays green:

```
scripts/release.sh 0.1.1
git push origin main
git push origin v0.1.1
scripts/bump_next_patch.sh
```

**Plugin identity.** Decky Loader keys an installed plugin off the `plugin.json`
`name` field, and the self-updater must pass that exact string to
`install_plugin` to replace in place. The canonical identity is
`Decky-Metadata` (matching the zip folder and `package.json` name); the QAM
header still shows the human-readable "Decky Metadata" via `titleView`. Do not
reintroduce a space into the `name` field.

**Release channels.** Two GitHub prerelease flows exist and must not be
conflated:
- The rolling `dev` prerelease (auto-refreshed on every `dev` push, fixed `dev`
  tag) is for the on-device sideload loop only. Its non-semver tag means the
  self-updater's discovery deliberately skips it — it is **not** an update
  source.
- The **Dev Release** workflow (`.github/workflows/dev-release.yml`, manual
  `workflow_dispatch`) publishes distinct `vX.Y.Z-dev.g<sha>` semver
  prereleases with a manifest + checksum. These are what the updater's
  "development" channel discovers and installs.

Version grammar the updater parses (and `scripts/package.mjs --release-version`
accepts): `X.Y.Z`, optionally `-dev.<id>` (development channel) and/or
`+<build>` metadata. A local `npm run package` still stamps `X.Y.Z+<hash>`,
which the panel treats as a non-updatable local build.

README screenshots are committed
under `assets/` and use stable relative paths with a
`?cacheBuster=YYYYMMDD` query. Bump that value whenever committed screenshots
are re-captured so GitHub's image proxy serves the updated images.

---

# 8. Agent Orchestration (plan → implement → review → finalize)

This repo is wired to the `agent-orchestration` engine via
`scripts/orchestration` (symlink) and `orchestration.conf`
(`ORCH_IMPLEMENTER="codex"`, `ORCH_BASE_BRANCH="main"`,
`ORCH_TMP_ROOT="/tmp/Decky-Metadata"`).

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
