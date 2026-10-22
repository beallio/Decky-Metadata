#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"
build=0
push=0
force=0
json=0
hook=0
while (($#)); do
  case "$1" in
    --build) build=1 ;;
    --push) push=1 ;;
    --force) force=1 ;;
    --json) json=1 ;;
    --hook)
      [[ "${DECKY_HOOK_AUTHORIZED:-0}" == 1 ]] || {
        echo "package-push: --hook is reserved for the installed Git hook" >&2
        exit 2
      }
      hook=1
      ;;
    *) echo "package-push: unknown option $1" >&2; exit 2 ;;
  esac
  shift
done
if ((hook)); then
  build=1
  push=1
fi

umask 077
if ! tmp_root="$(python3 scripts/deck/temp_paths.py root)"; then
  echo "package-push: could not resolve the private temporary root" >&2
  exit 2
fi
state_root="$tmp_root/package-state"
mkdir -p -- "$state_root"
exec 9>"$state_root/lock"
flock -x 9

zip="$repo_root/Decky-Metadata.zip"
if [[ -n "${DECKY_TEST_PACKAGE_ZIP:-}" ]]; then
  if ! zip="$(python3 scripts/deck/temp_paths.py validate "$DECKY_TEST_PACKAGE_ZIP")"; then
    echo "package-push: test archive must stay inside DECKY_TMP_ROOT" >&2
    exit 2
  fi
fi
host="${DECKY_DECK_HOST:-steamdeck}"
dest="${DECKY_DECK_DEST:-/home/deck/Downloads/}"
local_validation=SKIP
package_created=SKIP
delivery=NOT_REQUESTED
installed_state=UNKNOWN
error=""
digest=""
bundle_digest=""
backend_digest=""
shim_digest=""
manifest_digest=""
package_digest=""
version=""
ledger=""
remote_sha=""
remote_ready=0
already_current=0

validate_archive() {
  local meta head
  local_validation=SKIP
  [[ -f "$zip" ]] || {
    local_validation=FAIL
    error="archive missing"
    return 1
  }
  meta="$(python3 - "$zip" <<'PY'
import hashlib
import json
import stat
import struct
import sys
import zipfile

path = sys.argv[1]
def require(condition):
    if not condition:
        raise SystemExit(1)

def static_x64_elf(data):
    if (
        len(data) < 64
        or data[:7] != b"\x7fELF\x02\x01\x01"
        or struct.unpack_from("<H", data, 16)[0] not in (2, 3)
        or struct.unpack_from("<H", data, 18)[0] != 62
        or struct.unpack_from("<Q", data, 24)[0] == 0
    ):
        return False
    program_offset = struct.unpack_from("<Q", data, 32)[0]
    entry_size = struct.unpack_from("<H", data, 54)[0]
    count = struct.unpack_from("<H", data, 56)[0]
    if (count and entry_size < 56) or program_offset + entry_size * count > len(data):
        return False
    for index in range(count):
        header = program_offset + index * entry_size
        kind = struct.unpack_from("<I", data, header)[0]
        if kind == 3:
            return False
        if kind == 2:
            offset = struct.unpack_from("<Q", data, header + 8)[0]
            size = struct.unpack_from("<Q", data, header + 32)[0]
            if offset + size > len(data) or size % 16:
                return False
            for entry in range(offset, offset + size, 16):
                if struct.unpack_from("<q", data, entry)[0] == 1:
                    return False
    return True

with zipfile.ZipFile(path) as archive:
    package = json.loads(archive.read("Decky-Metadata/package.json"))
    plugin = json.loads(archive.read("Decky-Metadata/plugin.json"))
    require(package["version"] == plugin["version"])
    require(plugin.get("backend") == "bin/backend")
    bundle = archive.read("Decky-Metadata/dist/index.js")
    shim = archive.read("Decky-Metadata/main.py")
    manifest_bytes = archive.read("Decky-Metadata/plugin.json")
    package_bytes = archive.read("Decky-Metadata/package.json")
    native_name = "Decky-Metadata/bin/backend"
    native_info = archive.getinfo(native_name)
    mode = native_info.external_attr >> 16
    require(native_info.create_system == 3)
    require(mode == stat.S_IFREG | 0o755)
    native = archive.read(native_name)
    require(static_x64_elf(native))
print(
    package["version"],
    hashlib.sha256(open(path, "rb").read()).hexdigest(),
    hashlib.sha256(bundle).hexdigest(),
    hashlib.sha256(native).hexdigest(),
    hashlib.sha256(shim).hexdigest(),
    hashlib.sha256(manifest_bytes).hexdigest(),
    hashlib.sha256(package_bytes).hexdigest(),
)
PY
  )" || {
    local_validation=FAIL
    error="archive metadata or native backend mismatch"
    return 1
  }
  read -r version digest bundle_digest backend_digest shim_digest manifest_digest package_digest <<<"$meta"
  head="$(git rev-parse --short HEAD)"
  [[ "$version" == *"+$head" ]] || {
    local_validation=FAIL
    error="archive is stale"
    return 1
  }
  error=""
  local_validation=PASS
  mkdir -p -- "$state_root/ledger"
  ledger="$state_root/ledger/$(git rev-parse HEAD)-$digest"
}

inspect_installed() {
  local installed installed_version installed_bundle_digest installed_backend_digest installed_shim_digest installed_manifest_digest installed_package_digest installed_backend_mode
  local remote_code
  remote_code='
import hashlib,json,os,stat
from pathlib import Path
root=Path("/home/deck/homebrew/plugins/Decky-Metadata")
names=("dist/index.js","bin/backend","main.py","plugin.json","package.json")
hashes=[]
for name in names:
    path=root/name
    assert stat.S_ISREG(path.lstat().st_mode)
    hashes.append(hashlib.sha256(path.read_bytes()).hexdigest())
manifest=json.loads((root/"plugin.json").read_bytes())
mode=stat.S_IMODE((root/"bin/backend").lstat().st_mode)
print(manifest.get("version",""),*hashes,format(mode,"o"))
'
  installed="$(ssh "$host" "python3 -c '$remote_code'" 2>/dev/null || true)"
  read -r installed_version installed_bundle_digest installed_backend_digest installed_shim_digest installed_manifest_digest installed_package_digest installed_backend_mode <<<"$installed"
  if [[
    "$installed_version" == "$version" &&
    "$installed_bundle_digest" == "$bundle_digest" &&
    "$installed_backend_digest" == "$backend_digest" &&
    "$installed_shim_digest" == "$shim_digest" &&
    "$installed_manifest_digest" == "$manifest_digest" &&
    "$installed_package_digest" == "$package_digest" &&
    "$installed_backend_mode" == 755
  ]]; then
    installed_state=CURRENT
  else
    installed_state=REINSTALL_REQUIRED
  fi
}

# A prior successful ledger entry is only a hint. Revalidate both the local
# archive and remote download before suppressing duplicate hook work.
if validate_archive 2>/dev/null; then
  if ((push)) && ssh -q -o BatchMode=yes -o ConnectTimeout=2 "$host" exit >/dev/null 2>&1; then
    remote_ready=1
    remote_sha="$(ssh "$host" "sha256sum '${dest%/}/Decky-Metadata.zip' | awk '{print \$1}'" 2>/dev/null || true)"
  fi
  if ((!force)) && [[ -f "$ledger" ]] && {
    ((!push)) || ((remote_ready)) && [[ "$remote_sha" == "$digest" ]]
  }; then
    already_current=1
  fi
fi

if ((build)); then
  if ((already_current)); then
    package_created=ALREADY_CURRENT
  elif {
    if ((json)); then
      ./run.sh npm run package >&2
    else
      ./run.sh npm run package
    fi
  }; then
    package_created=PASS
  else
    package_created=FAIL
    error="package failed"
  fi
fi

if [[ "$package_created" != FAIL ]]; then
  validate_archive || true
fi

if ((push)) && [[ "$local_validation" == PASS ]]; then
  if ((!remote_ready)) && ssh -q -o BatchMode=yes -o ConnectTimeout=2 "$host" exit >/dev/null 2>&1; then
    remote_ready=1
  fi
  if ((remote_ready)); then
    if ((already_current)) && [[ "$remote_sha" == "$digest" ]]; then
      delivery=ALREADY_CURRENT
      inspect_installed
    elif {
      if ((json)); then
        scp "$zip" "$host:$dest" >&2
      else
        scp "$zip" "$host:$dest"
      fi
    }; then
      remote_sha="$(ssh "$host" "sha256sum '${dest%/}/Decky-Metadata.zip' | awk '{print \$1}'" 2>/dev/null || true)"
      if [[ "$remote_sha" == "$digest" ]]; then
        delivery=PASS
        inspect_installed
      else
        delivery=VERIFY_FAILED
        error="remote checksum mismatch"
      fi
    else
      delivery=COPY_FAILED
      error="copy failed"
    fi
  else
    if ((hook)); then
      delivery=DELIVERY_PENDING
    else
      delivery=OFFLINE
      error="Deck offline"
    fi
  fi
fi

if [[ -n "$ledger" && "$local_validation" == PASS && (
  "$delivery" == PASS || "$delivery" == ALREADY_CURRENT || "$delivery" == NOT_REQUESTED
) ]]; then
  printf '%s %s %s\n' "$(git rev-parse HEAD)" "$digest" "$delivery" >"$ledger"
fi

if ((json)); then
  python3 - "$local_validation" "$package_created" "$delivery" "$installed_state" "$error" <<'PY'
import json
import sys
print(json.dumps(dict(zip(
    ("LOCAL_VALIDATION", "PACKAGE_CREATED", "DELIVERY", "INSTALLED_STATE", "error"),
    sys.argv[1:],
)), sort_keys=True))
PY
else
  printf 'LOCAL_VALIDATION %s\nPACKAGE_CREATED %s\nDELIVERY %s\nINSTALLED_STATE %s\n' \
    "$local_validation" "$package_created" "$delivery" "$installed_state"
  [[ -z "$error" ]] || echo "package-push: $error" >&2
fi

if [[ "$local_validation" == FAIL ||
  "$package_created" == FAIL ||
  "$delivery" == COPY_FAILED ||
  "$delivery" == VERIFY_FAILED ]]; then
  exit 1
fi
if [[ "$delivery" == OFFLINE ]] && ((hook == 0)); then
  exit 1
fi
exit 0
