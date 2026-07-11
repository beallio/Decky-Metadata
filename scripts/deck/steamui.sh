#!/usr/bin/env bash
set -euo pipefail
repo_root="$(git rev-parse --show-toplevel)"; cd "$repo_root"
tmp_root="$(realpath -m "${DECKY_TMP_ROOT:-/tmp/Decky-Metadata}")"
[[ "$tmp_root" == /tmp || "$tmp_root" == /tmp/* ]] || { echo "steamui: DECKY_TMP_ROOT must resolve below /tmp" >&2; exit 2; }
root="$tmp_root/steamui"
host="${DECKY_DECK_HOST:-steamdeck}"
usage() { echo "Usage: steamui.sh snapshot | search PATTERN [--build BUILD_ID]"; }
snapshot() {
  if [[ -n "${DECKY_STEAMUI_ROOT:-}" ]]; then
    live="$DECKY_STEAMUI_ROOT"; build="${DECKY_STEAMUI_BUILD_ID:-local}"
    dest="$root/$build"; mkdir -p "$dest/assets"
    python3 - "$live" "$dest" "$build" <<'PY'
import hashlib,json,os,shutil,sys
from pathlib import Path
src,dst,build=Path(sys.argv[1]),Path(sys.argv[2]),sys.argv[3]
files=[]
for p in sorted(src.rglob("*")):
 if p.is_file() and p.suffix in {".js",".css"}:
  rel=p.relative_to(src); target=dst/"assets"/rel; target.parent.mkdir(parents=True,exist_ok=True); shutil.copy2(p,target)
  files.append({"path":str(rel),"size":p.stat().st_size,"sha256":hashlib.sha256(p.read_bytes()).hexdigest()})
json.dump({"schema_version":1,"build_id":build,"files":files},open(dst/"manifest.json","w"),sort_keys=True,indent=2)
PY
  else
    remote="$(ssh "$host" "find ~/.local/share/Steam -type d -path '*/steamui' 2>/dev/null | head -1")"
    [[ -n "$remote" ]] || { echo "steamui: live SteamUI directory not found" >&2; return 1; }
    build="$(ssh "$host" "cat ~/.steam/steam/package/steam_client_ubuntu12.installed 2>/dev/null || awk '/BuildID/{print \$2;exit}' ~/.local/share/Steam/appcache/appinfo.vdf 2>/dev/null || true")"; build="${build:-unknown}"
    dest="$root/$build"; mkdir -p "$dest"
    printf -v remote_q '%q' "$remote"
    printf -v build_q '%q' "$build"
    ssh "$host" "python3 - $remote_q $build_q" >"$dest/manifest.json" <<'PY'
import hashlib,json,sys
from pathlib import Path
root,build=Path(sys.argv[1]),sys.argv[2]
files=[]
for path in sorted(root.rglob("*")):
 if path.is_file() and path.suffix in {".js",".css"}:
  files.append({"path":str(path.relative_to(root)),"size":path.stat().st_size,"sha256":hashlib.sha256(path.read_bytes()).hexdigest()})
json.dump({"schema_version":1,"build_id":build,"source_root":str(root),"files":files},sys.stdout,sort_keys=True,indent=2)
PY
  fi
  printf '%s\n' "$dest"
}
case "${1:-}" in
  snapshot) [[ $# == 1 ]] || { usage >&2; exit 2; }; snapshot ;;
  search)
    [[ $# -ge 2 ]] || { usage >&2; exit 2; }; pattern="$2"; shift 2; historical=""
    if (($#)); then [[ "$1" == --build && $# == 2 ]] || { usage >&2; exit 2; }; historical="$2"; fi
    if [[ -n "$historical" ]]; then dest="$root/$historical"; else dest="$(snapshot)"; fi
    [[ -f "$dest/manifest.json" ]] || { echo "steamui: snapshot unavailable" >&2; exit 1; }
    if [[ -z "$historical" && -n "${DECKY_STEAMUI_BUILD_ID:-}" && "$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["build_id"])' "$dest/manifest.json")" != "$DECKY_STEAMUI_BUILD_ID" ]]; then echo "steamui: refusing stale snapshot" >&2; exit 1; fi
    if [[ -z "${DECKY_STEAMUI_ROOT:-}" && -z "$historical" ]]; then
      remote="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["source_root"])' "$dest/manifest.json")"
      encoded="$(printf '%s' "$pattern" | base64 | tr -d '\n')"
      printf -v remote_q '%q' "$remote"
      archive="$dest/matching-assets.zip"
      ssh "$host" "python3 - $remote_q $encoded" >"$archive" <<'PY'
import base64,sys,zipfile
from pathlib import Path
root=Path(sys.argv[1]); pattern=base64.b64decode(sys.argv[2]).decode()
with zipfile.ZipFile(sys.stdout.buffer,"w",zipfile.ZIP_DEFLATED) as archive:
 for path in sorted(root.rglob("*")):
  if path.is_file() and path.suffix in {".js",".css"} and pattern in path.read_text(errors="replace"):
   archive.write(path,path.relative_to(root))
PY
      python3 - "$archive" "$dest/assets" <<'PY'
import sys,zipfile
from pathlib import Path,PurePosixPath
archive,dest=Path(sys.argv[1]),Path(sys.argv[2]); dest.mkdir(parents=True,exist_ok=True)
with zipfile.ZipFile(archive) as source:
 for name in source.namelist():
  relative=PurePosixPath(name)
  if relative.is_absolute() or ".." in relative.parts: raise SystemExit("steamui: unsafe remote asset path")
  target=dest.joinpath(*relative.parts); target.parent.mkdir(parents=True,exist_ok=True)
  target.write_bytes(source.read(name))
archive.unlink()
PY
    fi
    grep -R -n -F -- "$pattern" "$dest/assets" 2>/dev/null || true
    ;;
  *) usage >&2; exit 2 ;;
esac
