#!/usr/bin/env bash
set -euo pipefail
repo_root="$(git rev-parse --show-toplevel)"; cd "$repo_root"
build=0; push=0; force=0; json=0; hook=0
while (($#)); do case "$1" in --build) build=1;; --push) push=1;; --force) force=1;; --json) json=1;; --hook) [[ "${DECKY_HOOK_AUTHORIZED:-0}" == 1 ]] || { echo "package-push: --hook is reserved for the installed Git hook" >&2; exit 2; }; hook=1;; *) echo "package-push: unknown option $1" >&2; exit 2;; esac; shift; done
((hook)) && { build=1; push=1; }
state_root="${DECKY_TMP_ROOT:-/tmp/Decky-Metadata}/package-state"; mkdir -p "$state_root"
exec 9>"$state_root/lock"; flock -x 9
zip="$repo_root/Decky-Metadata.zip"
if [[ -n "${DECKY_TEST_PACKAGE_ZIP:-}" ]]; then
  [[ "$DECKY_TEST_PACKAGE_ZIP" == /tmp/* ]] || { echo "package-push: test archive override must stay under /tmp" >&2; exit 2; }
  zip="$DECKY_TEST_PACKAGE_ZIP"
fi
host="${DECKY_DECK_HOST:-steamdeck}"; dest="${DECKY_DECK_DEST:-/home/deck/Downloads/}"
local_validation=SKIP; package_created=SKIP; delivery=NOT_REQUESTED; installed_state=UNKNOWN; error=""
if ((build)); then
  if ./run.sh npm run package; then package_created=PASS; else package_created=FAIL; error="package failed"; fi
fi
if [[ "$package_created" != FAIL && -f "$zip" ]]; then
  meta="$(python3 - "$zip" <<'PY'
import hashlib,json,sys,zipfile
p=sys.argv[1]
with zipfile.ZipFile(p) as z:
 a=json.loads(z.read('Decky-Metadata/package.json')); b=json.loads(z.read('Decky-Metadata/plugin.json'))
 if a['version']!=b['version']: raise SystemExit(1)
 bundle=hashlib.sha256(z.read('Decky-Metadata/dist/index.js')).hexdigest()
 print(a['version'],hashlib.sha256(open(p,'rb').read()).hexdigest(),bundle)
PY
)" || { local_validation=FAIL; error="archive metadata mismatch"; }
  if [[ "$local_validation" != FAIL ]]; then
    read -r version digest bundle_digest <<<"$meta"; head="$(git rev-parse --short HEAD)"
    if [[ "$version" == *"+$head" || "$force" == 1 ]]; then local_validation=PASS; else local_validation=FAIL; error="archive is stale"; fi
  fi
else [[ "$package_created" == FAIL ]] || { local_validation=FAIL; error="archive missing"; }; fi
if ((push)) && [[ "$local_validation" == PASS ]]; then
  if ssh -q -o BatchMode=yes -o ConnectTimeout=2 "$host" exit >/dev/null 2>&1; then
    if scp "$zip" "$host:$dest"; then
      remote_sha="$(ssh "$host" "sha256sum '${dest%/}/Decky-Metadata.zip' | awk '{print \$1}'" 2>/dev/null || true)"
      [[ "$remote_sha" == "$digest" ]] && delivery=PASS || { delivery=VERIFY_FAILED; error="remote checksum mismatch"; }
      installed="$(ssh "$host" "python3 -c 'import hashlib,json; root=\"/home/deck/homebrew/plugins/Decky-Metadata\"; print(json.load(open(root+\"/plugin.json\"))[\"version\"], hashlib.sha256(open(root+\"/dist/index.js\",\"rb\").read()).hexdigest())'" 2>/dev/null || true)"
      read -r installed_version installed_bundle_digest <<<"$installed"
      [[ "$installed_version" == "$version" && "$installed_bundle_digest" == "$bundle_digest" ]] && installed_state=CURRENT || installed_state=REINSTALL_REQUIRED
    else delivery=COPY_FAILED; error="copy failed"; fi
  else
    if ((hook)); then delivery=DELIVERY_PENDING; else delivery=OFFLINE; error="Deck offline"; fi
  fi
fi
mkdir -p "$state_root/ledger"; [[ "${digest:-}" ]] && printf '%s %s %s\n' "$(git rev-parse HEAD)" "$digest" "$delivery" >"$state_root/ledger/$(git rev-parse HEAD)-$digest"
if ((json)); then python3 - "$local_validation" "$package_created" "$delivery" "$installed_state" "$error" <<'PY'
import json,sys
print(json.dumps(dict(zip(("LOCAL_VALIDATION","PACKAGE_CREATED","DELIVERY","INSTALLED_STATE","error"),sys.argv[1:])),sort_keys=True))
PY
else printf 'LOCAL_VALIDATION %s\nPACKAGE_CREATED %s\nDELIVERY %s\nINSTALLED_STATE %s\n' "$local_validation" "$package_created" "$delivery" "$installed_state"; [[ -z "$error" ]] || echo "package-push: $error" >&2; fi
[[ "$local_validation" != FAIL && "$package_created" != FAIL && "$delivery" != COPY_FAILED && "$delivery" != VERIFY_FAILED && ! ( "$delivery" == OFFLINE && "$hook" == 0 ) ]]
