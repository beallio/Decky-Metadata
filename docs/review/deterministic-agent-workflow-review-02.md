# Review — deterministic-agent-workflow (round 02)

Branch: `feat/deterministic-agent-workflow`
Reviewed against: `docs/plans/2026-07-11_deterministic-agent-workflow.md`

## Verdict

The implementation is broad, well-structured, and locally test-green, but it is
not ready to integrate. Several core safety and determinism contracts from the
plan are not enforced by the current implementation or tests. In particular, the
change-aware verifier can overstate coverage, package delivery is serialized but
not idempotent/machine-clean, private raw captures are not actually permission
restricted, and hook validation accepts bodies other than the exact delegates.

## Gate status

Independent validation passed:

- `scripts/orchestration/run-quality-gates` (18 Vitest tests and 214 pytest
  tests, plus typecheck/build/byte-compile/version guard);
- `skill-creator` quick validation;
- `bash -n` for all new/modified workflow scripts;
- Python compilation for the three new Python tools;
- installed-hook check, review-note deletion check, and `git diff --check`.

The five pre-existing untracked JSON files remain untouched. These green gates
do not exercise the semantic gaps below.

## Required changes

1. **Make `verify-change` accumulate requirements and report incomplete coverage
   honestly.** In `scripts/decky:58-65`, each matching path overwrites `checks`,
   so a multi-file diff can lose a previously required launch or re-render check.
   Represent checks as a set/union with deterministic output order and add a
   multi-path regression test. In `scripts/decky:71-86`, a device run without
   `--allow-launch` invokes `run_all.sh --no-launch` and then prints
   `STATUS PASS` even when the classification requires `launch`; likewise,
   `--allow-launch` without an explicit approved `MATCHED_APPID` is silently
   skipped by `run_all.sh` but still becomes `PASS`. Report the outstanding
   launch check as `DEFERRED`/`SKIP` and do not emit overall `PASS`, or reject the
   incomplete invocation. Add tests covering both cases without touching a real
   device.

2. **Finish package idempotency and JSON-output integrity.** The plan requires
   locked *and idempotent* delivery. `scripts/deck/package_push.sh:48` only writes
   a ledger; no path reads it or uses revalidated local/remote state to suppress a
   duplicate build/copy. Implement an idempotent fast path that still verifies
   the current local archive and remote checksum, with `--force` bypassing that
   skip, and test sequential duplicate invocations (not just concurrent lock
   serialization). Also, `--build --json` currently lets `run.sh`/npm write build
   output to stdout before the JSON object at lines 16-17. Ensure JSON mode emits
   exactly one parseable JSON document on stdout for real and fake builds; route
   progress to stderr or capture it. Add a regression test whose fake build emits
   stdout noise.

3. **Enforce the diagnostic privacy boundary on disk and the temp-root
   contract.** `scripts/deck/capture.sh:16-21` creates `restricted-raw` under the
   caller-controlled `DECKY_TMP_ROOT` with the process umask, which is normally
   mode 0755/0644. Validate that generated state remains under `/tmp` (and the
   default project root in normal operation), create the diagnostic root and
   `restricted-raw` with restrictive directory permissions, and ensure raw logs
   and opt-in settings are mode 0600. Apply the same `/tmp` containment check to
   other new state-root overrides where appropriate. Extend the capture tests to
   assert modes and reject a non-`/tmp` destination.

4. **Validate exact hook delegates, not only their last nonblank line.** Both
   `scripts/install_hooks.sh:14-18` and `scripts/decky_doctor.py:102-111` accept
   any executable script whose last line is an expected `exec`; arbitrary commands
   before it are incorrectly reported `OK`. Compare normalized complete content
   against the supported exact two-line thin delegate forms (including the
   existing tracked-variable form only if its complete body is explicitly
   supported). Add prepend/insertion drift tests for both the installer check and
   doctor.

5. **Complete the log-audit evidence shape required by the plan.** The grouped
   output at `scripts/deck/log_audit.py:82-95` contains only normalized signature
   and count, while the plan requires representative first/last occurrences for
   each normalized group. Preserve source path, line number, and raw first/last
   examples per group, keep deterministic ordering, and add fixture tests proving
   two normalized occurrences retain both boundaries without exposing less raw
   evidence than the existing report.

After these corrections, rerun the targeted workflow tests, exact skill
validation, shell/Python syntax checks, full project quality gate, review-note
preservation, and diff hygiene. Update the session record with the second-round
fixes and final counts, commit all changes plus this review note, preserve the
five unrelated JSON files, and recreate the round-complete marker.

STATUS: CHANGES_REQUESTED
