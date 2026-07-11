#!/usr/bin/env bash
set -euo pipefail
repo_root="$(git rev-parse --show-toplevel)"; cd "$repo_root"
build=0; push=0; force=0; json=0; hook=0
while (($#)); do case "$1" in --build) build=1;; --push) push=1;; --force) force=1;; --json) json=1;; --hook) [[ "${DECKY_HOOK_AUTHORIZED:-0}" == 1 ]] || { echo "package-push: --hook is reserved for the installed Git hook" >&2; exit 2; }; hook=1;; *) echo "package-push: unknown option $1" >&2; exit 2;; esac; shift; done
((hook)) && { build=1; push=1; }
tmp_root="$(realpath -m "${DECKY_TMP_ROOT:-/tmp/Decky-Metadata}")"
[[ "$tmp_root" == /tmp || "$tmp_root" == /tmp/* ]] || { echo "package-push: DECKY_TMP_ROOT must resolve below /tmp" >&2; exit 2; }
state_root="$tmp_root/package-state"; mkdir -p "$state_root"
exec 9>"$state_root/lock"; flock -x 9
zip="$repo_root/Decky-Metadata.zip"
if [[ -n "${DECKY_TEST_PACKAGE_ZIP:-}" ]]; then
  [[ "$DECKY_TEST_PACKAGE_ZIP" == /tmp/* ]] || { echo "package-push: test archive override must stay under /tmp" >&2; exit 2; }
  zip="$DECKY_TEST_PACKAGE_ZIP"
fi
host="${DECKY_DECK_HOST:-steamdeck}"; dest="${DECKY_DECK_DEST:-/home/deck/Downloads/}"
local_validation=SKIP; package_created=SKIP; delivery=NOT_REQUESTED; installed_state=UNKNOWN; error=""
digest=""; bundle_digest=""; version=""; ledger=""; remote_sha=""; remote_ready=0; already_current=0
validate_archive() {
  local meta head
  local_validation=SKIP
  [[ -f "$zip" ]] || { local_validation=FAIL; error="archive missing"; return 1; }
  meta="$(python3 - "$zip" <<'PY'
import hashlib,json,sys,zipfile
p=sys.argv[1]
with zipfile.ZipFile(p) as z:
 a=json.loads(z.read('Decky-Metadata/package.json')); b=json.loads(z.read('Decky-Metadata/plugin.json'))
 if a['version']!=b['version']: raise SystemExit(1)
 bundle=hashlib.sha256(z.read('Decky-Metadata/dist/index.js')).hexdigest()
 print(a['version'],hashlib.sha256(open(p,'rb').read()).hexdigest(),bundle)
PY
)" || { local_validation=FAIL; error="archive metadata mismatch"; return 1; }
  read -r version digest bundle_digest <<<"$meta"
  head="$(git rev-parse --short HEAD)"
  [[ "$version" == *"+$head" ]] || { local_validation=FAIL; error="archive is stale"; return 1; }
  error=""
  local_validation=PASS
  mkdir -p "$state_root/ledger"
  ledger="$state_root/ledger/$(git rev-parse HEAD)-$digest"
}
inspect_installed() {
  local installed installed_version installed_bundle_digest
  installed="$(ssh "$host" "python3 -c 'import hashlib,json; root=\"/home/deck/homebrew/plugins/Decky-Metadata\"; print(json.load(open(root+\"/plugin.json\"))[\"version\"], hashlib.sha256(open(root+\"/dist/index.js\",\"rb\").read()).hexdigest())'" 2>/dev/null || true)"
  read -r installed_version installed_bundle_digest <<<"$installed"
  [[ "$installed_version" == "$version" && "$installed_bundle_digest" == "$bundle_digest" ]] && installed_state=CURRENT || installed_state=REINSTALL_REQUIRED
}

# A prior successful ledger entry is only a hint. Revalidate both the local
# archive and remote download before suppressing duplicate hook work.
if validate_archive 2>/dev/null; then
  if ((push)) && ssh -q -o BatchMode=yes -o ConnectTimeout=2 "$host" exit >/dev/null 2>&1; then
    remote_ready=1
    remote_sha="$(ssh "$host" "sha256sum '${dest%/}/Decky-Metadata.zip' | awk '{print \$1}'" 2>/dev/null || true)"
  fi
  if ((!force)) && [[ -f "$ledger" ]] && { ((!push)) || ((remote_ready)) && [[ "$remote_sha" == "$digest" ]]; }; then
    already_current=1
  fi
fi

if ((build)); then
  if ((already_current)); then
    package_created=ALREADY_CURRENT
  elif { if ((json)); then ./run.sh npm run package >&2; else ./run.sh npm run package; fi; }; then
    package_created=PASS
  else
    package_created=FAIL; error="package failed"
  fi
fi

if [[ "$package_created" != FAIL ]]; then
  validate_archive || true
fi

if ((push)) && [[ "$local_validation" == PASS ]]; then
  if ((!remote_ready)) && ssh -q -o BatchMode=yes -o ConnectTimeout=2 "$host" exit >/dev/null 2>&1; then remote_ready=1; fi
  if ((remote_ready)); then
    if ((already_current)) && [[ "$remote_sha" == "$digest" ]]; then
      delivery=ALREADY_CURRENT
      inspect_installed
    elif { if ((json)); then scp "$zip" "$host:$dest" >&2; else scp "$zip" "$host:$dest"; fi; }; then
      remote_sha="$(ssh "$host" "sha256sum '${dest%/}/Decky-Metadata.zip' | awk '{print \$1}'" 2>/dev/null || true)"
      if [[ "$remote_sha" == "$digest" ]]; then
        delivery=PASS
        inspect_installed
      else
        delivery=VERIFY_FAILED; error="remote checksum mismatch"
      fi
    else delivery=COPY_FAILED; error="copy failed"; fi
  else
    if ((hook)); then delivery=DELIVERY_PENDING; else delivery=OFFLINE; error="Deck offline"; fi
  fi
fi
if [[ -n "$ledger" && "$local_validation" == PASS && ( "$delivery" == PASS || "$delivery" == ALREADY_CURRENT || "$delivery" == NOT_REQUESTED ) ]]; then
  printf '%s %s %s\n' "$(git rev-parse HEAD)" "$digest" "$delivery" >"$ledger"
fi
if ((json)); then python3 - "$local_validation" "$package_created" "$delivery" "$installed_state" "$error" <<'PY'
import json,sys
print(json.dumps(dict(zip(("LOCAL_VALIDATION","PACKAGE_CREATED","DELIVERY","INSTALLED_STATE","error"),sys.argv[1:])),sort_keys=True))
PY
else printf 'LOCAL_VALIDATION %s\nPACKAGE_CREATED %s\nDELIVERY %s\nINSTALLED_STATE %s\n' "$local_validation" "$package_created" "$delivery" "$installed_state"; [[ -z "$error" ]] || echo "package-push: $error" >&2; fi
[[ "$local_validation" != FAIL && "$package_created" != FAIL && "$delivery" != COPY_FAILED && "$delivery" != VERIFY_FAILED && ! ( "$delivery" == OFFLINE && "$hook" == 0 ) ]]
