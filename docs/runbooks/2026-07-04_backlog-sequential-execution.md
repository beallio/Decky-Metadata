# Runbook: Sequential execution of the remaining backlog plans with dual review

**Type:** orchestrator runbook (NOT an implementer plan — do not place in `docs/plans/`; it has
no slug/markers and would confuse `validate-state`). This is the orchestrator's operating
procedure for driving the 8 remaining thermo-nuclear-review backlog plans to completion, each
gated by **two reviews**: an **agy thermo-nuclear** review of the implementation branch **plus**
the orchestrator's own review.

> Provenance: backlog created 2026-07-03 from the thermo-nuclear review (codex + agy,
> orchestrator-verified). Three findings already merged to `dev`: dead-code-removal,
> tracing-behind-debug-flag, steam-ts-decomposition.

---

## Environment (source before each Bash call)

```bash
ORCH_TMP_ROOT=/tmp/Decky-Metadata
ORCH_BASE_BRANCH=dev
ORCH_IMPLEMENTER=codex
ORCH_APPROVAL_MODE=final
ORCH_LOCAL_ONLY=1
UV_CACHE_DIR=/tmp/Decky-Metadata/.uv
```

## Approval / promotion gates (unchanged)

- **final mode:** on the orchestrator's passing review, merge `feat/<slug>` into `dev` with
  `git merge --no-ff` and the verdict in the merge body.
- The orchestrator **never** authors an `APPROVED` note for the implementer's work (may write
  `CHANGES_REQUESTED`). **agy is an advisory second reviewer, not an approver** — it informs the
  orchestrator's review; it does not change the approval authority.
- **`dev` → `main` promotion and any release remain a human gate.** Never promote or release.

---

## Execution order (dependency-ordered)

Run strictly in this sequence. Rationale captures the hard dependencies discovered during
planning.

| # | Slug | Why here |
| --- | --- | --- |
| 1 | `behavioral-frontend-tests` | Removes source-text-pinned tests. **Must precede `components-tsx-decomposition`** (the QAM scroll test pins `components.tsx` text and would break on the split). Small, low risk — good warm-up. |
| 2 | `load-data-caching` | Small backend change to `_load_data`. Land it **before** `main-py-decomposition` moves storage into a module. |
| 3 | `locale-neutral-tab-detection` | Independent frontend change (tab detection now lives under `src/steam/`). Low risk; do it before the larger backend work. |
| 4 | `scan-pipeline-refactor` | Behavioral (verify-first) cleanup of the scan orchestration in `main.py`. Land the tidied logic **before** `main-py-decomposition` moves it. |
| 5 | `main-py-decomposition` | Large + **packaging risk** (must update `scripts/package.mjs` to stage new `.py` modules). Do after the scan logic is cleaned. **Stop for human confirmation if the packaging step is ambiguous** (see Stop conditions). |
| 6 | `components-tsx-decomposition` | After `behavioral-frontend-tests` (step 1) removed the brittle test that would otherwise break. |
| 7 | `type-boundary-hardening` | **Must come after all decompositions** (steam done; main-py #5; components #6). Typing small modules is far cleaner than typing monoliths then re-moving. Do NOT interleave with a decomposition. |
| 8 | `build-and-version-nits` | Tiny tooling nits touching `scripts/package.mjs` and `components.tsx`. Land **last**, after `main-py-decomposition` (package.mjs) and `components-tsx-decomposition` (components.tsx) have settled, to avoid conflicts. |

If a step's plan states its own ordering that conflicts with this table, the plan's constraint
wins for correctness — re-sequence and note it.

---

## Per-plan protocol (the loop)

For each slug, in order:

### A. Preconditions
1. `source` the env. On `dev`, tree clean, only `dev`/`main` branches.
2. `scripts/orchestration/validate-state "<slug>"` — no markers, no session.
3. The plan is **already committed on `dev`** (backlog + any revisions). The implementer branches
   from `dev` and does **not** re-commit the plan (skip "commit plan first"; a `git commit` on an
   unchanged plan no-ops).

### B. Implement
```bash
scripts/orchestration/supervise-implementer "<slug>" start   # background; wait for the marker
```
Own the completion wait yourself (background job notifies on marker). If it exits early,
`supervise-implementer` auto-restarts (up to 5 attempts).

### C. Dual review (BOTH must pass to merge)

**C1 — Orchestrator review** (as usual): confirm every plan item, run the gates, verify scope,
tree clean. Gates depend on the plan:
- Frontend-touching: `./run.sh npx tsc --noEmit`, `./run.sh npm run build` (deterministic — tree
  clean after), `scripts/orchestration/run-quality-gates`.
- Backend-touching: `./run.sh python3 -m py_compile main.py` (+ new modules),
  `./run.sh uv run --with pytest -- pytest -q`.
- Always: plan-specific grep/scope gates + `git diff --name-only dev..HEAD` within scope.

**C2 — agy thermo-nuclear review of the implementation branch.** Run agy read-only over the
branch's changes (NOT the whole repo — keep findings about what this round introduced):

```bash
SCRATCH=<session scratchpad>
REPO=/home/beallio/Dropbox/Scripts/Decky-Metadata
# Build a per-branch review prompt: thermo-nuclear standards, scoped to the diff dev..feat/<slug>
git diff --stat dev..HEAD > "$SCRATCH/<slug>-diffstat.txt"
git diff dev..HEAD > "$SCRATCH/<slug>-fulldiff.txt"
# agy runs UN-SANDBOXED with the repo in its workspace (the --sandbox flag breaks agy auth;
# and agy defaults to its own scratch cwd, so pass --add-dir and absolute paths).
agy --add-dir "$REPO" --add-dir /tmp --print-timeout 20m --print "$(cat "$SCRATCH/<slug>-agy-prompt.md")" \
    > "$SCRATCH/<slug>-agy.txt" 2>"$SCRATCH/<slug>-agy-stderr.txt"
```
Do **NOT** use `agy --dangerously-skip-permissions` (auto-mode classifier blocks it) and do
**NOT** use `agy --sandbox` (breaks its auth). Un-sandboxed `--print` auto-allows reads and gates
writes; the review prompt forbids writes; verify the tree stays clean after (revert any stray
edits — the branch worktree must be untouched by the reviewer).

The agy prompt (per plan) instructs: perform a thermo-nuclear code-quality review of the changes
on `feat/<slug>` (the diff), judging (a) whether the round introduced any structural regression,
spaghetti, wrong abstraction, or hidden coupling; (b) whether it fulfilled the plan's intent
cleanly; (c) missed simplifications **within the plan's scope**. Read-only; output findings with
SEVERITY / LOCATION / PROBLEM / EVIDENCE / REMEDY to stdout.

### D. Consolidate the two reviews → decision

The orchestrator **vets every agy finding against the actual code** before acting (agy can
overstate counts or flag out-of-scope items — this happened in the initial audit). Classify each
agy finding:
- **VALID + in-scope regression / plan violation** → blocking.
- **VALID but scope-creep** (a real improvement beyond this plan's remit) → **do not block**;
  record it as a new backlog note/plan for later, mention in the review note.
- **Invalid / overstated** → note and dismiss with a one-line reason.

**Decision:**
- If C1 finds an issue **or** any agy finding is blocking → `CHANGES_REQUESTED`:
  ```bash
  scripts/orchestration/add-review-note "<slug>" CHANGES_REQUESTED
  # edit the note: orchestrator findings + the VETTED agy findings (mark each valid/invalid/
  # scope-creep). End with STATUS: CHANGES_REQUESTED.
  scripts/orchestration/submit-review "<slug>" CHANGES_REQUESTED   # commit the note
  scripts/orchestration/supervise-implementer "<slug>" continue    # resume after committed note
  ```
  Then repeat C–D.
- If C1 passes **and** no agy finding is blocking → **merge** (final mode):
  ```bash
  git checkout dev
  git merge --no-ff "feat/<slug>" -m "Merge <slug> into dev

  <verdict: what was verified + gates + red->green; note that an agy thermo-nuclear review of the
  branch was run and its findings were vetted (list any valid scope-creep items deferred to
  backlog).>"
  ```

Record, in the merge body or session log, that the **dual review** ran and the disposition of
agy's findings — this is the audit trail the user asked for.

### E. Clean up + advance
```bash
scripts/orchestration/stop-implementer "<slug>"
git branch -d "feat/<slug>"
```
Confirm only `dev`/`main` remain, tree clean, then proceed to the next slug.

---

## Stop conditions (hand back to the human)

Pause the sequence and report — do not push through — when:
- **`dev` → `main`**: never. That's the human gate; the whole sequence lands on `dev` only.
- **`main-py-decomposition` packaging (step 5):** if updating `scripts/package.mjs` to stage new
  `.py` modules is ambiguous or the packaged `Decky-Metadata.zip` cannot be confirmed to contain
  every module, stop for human confirmation rather than guess (a broken package silently ships an
  incomplete plugin).
- A plan needs a **behavior decision** not covered by its text (e.g. `scan-pipeline-refactor`
  finds a reviewer claim was wrong and the "fix" would change behavior).
- Two consecutive `CHANGES_REQUESTED` rounds on the same plan fail to converge — stop and
  summarize rather than loop indefinitely.
- The Deck being offline blocks a plan that has **no** compile/gate-level verification (none of
  these do — all are gate-verifiable with on-device as deferred smoke — but flag if that changes).

## Notes

- On-device verification stays **deferred** throughout (Deck offline). Each merge body records the
  deferred smoke checklist; the human runs it before `dev` → `main`.
- The post-commit hook packages `Decky-Metadata.zip` on each `dev` merge and skips the push while
  the Deck is unreachable — expected, not an error.
- Keep TLS verification on; `npm ci` only (no unpinned installs); no secrets in logs.
