#!/usr/bin/env bash
set -euo pipefail

# The scheduled workflow serializes runs, so this exact-title check prevents
# hourly failures from creating a new issue while one is already open.
title="IGN trailer fallback health check failed"
existing="$(gh issue list --state open --search 'in:title "IGN trailer fallback health check failed"' \
  --limit 100 --json number,title \
  --jq '.[] | select(.title == "IGN trailer fallback health check failed") | .number')"
if [[ -n "$existing" ]]; then
  echo "Existing IGN health issue #${existing%%$'\n'*} remains open."
  exit 0
fi

body="${RUNNER_TEMP:?}/ign-trailer-health-failure.md"
printf 'The hourly IGN trailer capability check failed.\n\nWorkflow run: %s/%s/actions/runs/%s\n\nThe check covers IGN game search, verified trailer selection, and direct MP4 access for Deadpool and Bloodborne. See the failed workflow step for the specific result. It does not test playback inside Steam.\n' \
  "${GITHUB_SERVER_URL:?}" "${GITHUB_REPOSITORY:?}" "${GITHUB_RUN_ID:?}" > "$body"
gh issue create --title "$title" --label bug --body-file "$body"
