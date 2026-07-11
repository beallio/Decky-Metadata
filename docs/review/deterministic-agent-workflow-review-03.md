# Review — deterministic-agent-workflow (round 03)

Branch: `feat/deterministic-agent-workflow`
Reviewed against: `docs/plans/2026-07-11_deterministic-agent-workflow.md`

## Verdict

The reviewed feature was merged into local `dev` as `7b8759a`, and the real
post-merge hook successfully built and copied `Decky-Metadata.zip`. That live
integration path exposed one narrow but contract-relevant reporting regression:
the package command retained a stale pre-build validation error after the rebuilt
archive passed validation.

## Gate status

Before integration, the full project gate, 39 focused workflow tests, skill quick
validation, syntax checks, hook checks, review-note preservation, and diff hygiene
all passed. The post-merge hook then reported:

```text
LOCAL_VALIDATION PASS
PACKAGE_CREATED PASS
DELIVERY PASS
INSTALLED_STATE REINSTALL_REQUIRED
package-push: archive is stale
```

The merge and copy succeeded, but the contradictory final error violates the
plan's requirement that package stages and failures be reported accurately.

## Required changes

1. In `scripts/deck/package_push.sh`, clear or replace validation error state
   when a later validation succeeds. A stale archive detected before `--build`
   is expected input to a successful rebuild, not a final error. Preserve real
   failures and the independent stage statuses.
2. Add a regression test that starts with an archive stale relative to `HEAD`,
   runs `--build --json` with a fake build that rewrites the archive to the
   current stamped version, and asserts the resulting JSON has
   `LOCAL_VALIDATION=PASS`, `PACKAGE_CREATED=PASS`, and an empty `error`. Also
   cover human output so a successful rebuild does not print the superseded
   stale-archive diagnostic.
3. Re-run the focused package/workflow tests, full quality gate, skill validator,
   syntax checks, review-note preservation, and diff hygiene. Update the session
   record, commit this review note and the fix, preserve the five unrelated JSON
   files, and recreate the round-complete marker.

STATUS: CHANGES_REQUESTED
