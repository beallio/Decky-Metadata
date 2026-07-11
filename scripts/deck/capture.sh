#!/usr/bin/env bash
set -euo pipefail
repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"
since=""
include_settings=0
while (($#)); do
  case "$1" in
    --since) [[ $# -ge 2 ]] || { echo "capture: --since requires TIMESTAMP" >&2; exit 2; }; since="$2"; shift ;;
    --include-settings) include_settings=1 ;;
    *) echo "capture: unknown option $1" >&2; exit 2 ;;
  esac
  shift
done
stamp="${DECKY_CAPTURE_TIMESTAMP:-$(date -u +%Y%m%dT%H%M%SZ)}"
tmp_base="${DECKY_TMP_ROOT:-/tmp/Decky-Metadata}"
root="$tmp_base/diagnostics/$stamp"
restricted="$root/restricted-raw"
mkdir -p "$root" "$restricted"
manifest="$root/manifest.jsonl"
: >"$manifest"
record() { python3 - "$manifest" "$1" "$2" "$3" <<'PY'
import json,sys
with open(sys.argv[1],"a") as f: f.write(json.dumps({"command":sys.argv[2],"status":int(sys.argv[3]),"file":sys.argv[4]},sort_keys=True)+"\n")
PY
}
collect() {
  name="$1"; shift
  output="$root/$name"
  set +e; "$@" >"$output" 2>"$output.stderr"; status=$?; set -e
  record "$*" "$status" "$output"
  return 0
}
redact_json() {
  [[ -f "$1" ]] || return 0
  python3 - "$1" <<'PY'
import json,re,sys
from urllib.parse import urlsplit,urlunsplit
p=sys.argv[1]
try: value=json.load(open(p))
except (OSError,json.JSONDecodeError): raise SystemExit(0)
def clean(v):
 if isinstance(v,dict): return {k:("<REDACTED>" if re.search(r"token|authorization|account",k,re.I) else clean(x)) for k,x in v.items()}
 if isinstance(v,list): return [clean(x) for x in v]
 if isinstance(v,str):
  v=re.sub(r"/home/[^/\s]+", "<HOME>", v)
  v=re.sub(r"(?i)(authorization:\s*)\S+", r"\1<REDACTED>", v)
  v=re.sub(r"(?i)(access[_-]?token|token)([=:]\s*)[^\s&\"']+", r"\1\2<REDACTED>", v)
  v=re.sub(r"\b7656119\d{10}\b", "<ACCOUNT_ID>", v)
  def strip_query(match):
   u=urlsplit(match.group(0)); return urlunsplit((u.scheme,u.netloc,u.path,"",""))
  v=re.sub(r"https?://[^\s\"']+", strip_query, v)
  return v
 return v
json.dump(clean(value),open(p,"w"),sort_keys=True,indent=2)
PY
}
collect doctor.json ./run.sh python3 scripts/decky_doctor.py --deck --json
redact_json "$root/doctor.json"
if DECKY_LOG_SYNC_DIR="$tmp_base/deck-logs" scripts/sync_deck_logs.sh >"$root/log-sync.txt" 2>&1; then
  record "scripts/sync_deck_logs.sh" 0 "$root/log-sync.txt"
  latest="$(find "$tmp_base/deck-logs" -type l -name latest -print | sort | tail -n 1)"
  [[ -d "$latest" ]] && cp -a "$latest/." "$restricted/"
  audit_args=("$latest" --json); [[ -n "$since" ]] && audit_args+=(--since "$since")
  collect log-audit.json ./run.sh python3 scripts/deck/log_audit.py "${audit_args[@]}"
  redact_json "$root/log-audit.json"
else record "scripts/sync_deck_logs.sh" 1 "$root/log-sync.txt"; fi
collect cdp-list.json ./run.sh python3 scripts/deck/cdp.py list
collect cdp-state.json ./run.sh python3 scripts/deck/cdp.py eval SharedJSContext @scripts/deck/js/state.js
for steam_log in console_log.txt gameprocess_log.txt; do
  raw="$restricted/$steam_log"
  if ssh "${DECKY_DECK_HOST:-steamdeck}" "tail -n 400 ~/.local/share/Steam/logs/$steam_log" >"$raw" 2>"$raw.stderr"; then
    python3 - "$raw" "$root/$steam_log" <<'PY'
import re,sys
text=open(sys.argv[1],errors="replace").read()
text=re.sub(r"/home/[^/\s]+", "<HOME>", text)
text=re.sub(r"(?i)(authorization:\s*)\S+", r"\1<REDACTED>", text)
text=re.sub(r"(?i)(access[_-]?token|token)([=:]\s*)[^\s&\"']+", r"\1\2<REDACTED>", text)
text=re.sub(r"\b7656119\d{10}\b", "<ACCOUNT_ID>", text)
text=re.sub(r"(https?://[^\s?\"']+)\?[^\s\"']+", r"\1", text)
open(sys.argv[2],"w").write(text)
PY
    record "read bounded Steam log $steam_log" 0 "$root/$steam_log"
  else record "read bounded Steam log $steam_log" 1 "$raw"; fi
done
./run.sh python3 scripts/decky_doctor.py --json >"$root/package-state.json" || true
redact_json "$root/package-state.json"
active="$(find "$tmp_base/verification" -name fixtures.json -type f 2>/dev/null | sort | tail -1 || true)"
if [[ -n "$active" ]]; then cp "$active" "$root/fixtures.json"; record "copy active fixture manifest" 0 "$root/fixtures.json"; fi
failed="$(find "$tmp_base/verification" -name 'failed-command*' -type f 2>/dev/null | sort | tail -1 || true)"
if [[ -n "$failed" ]]; then cp "$failed" "$root/failed-command.txt"; record "copy failed command output" 0 "$root/failed-command.txt"; fi
settings_remote="/home/deck/homebrew/settings/Decky-Metadata/decky_metadata.json"
if ((include_settings)); then
  echo "WARNING: --include-settings copies private plugin settings into restricted-raw." >&2
  if ssh "${DECKY_DECK_HOST:-steamdeck}" "cat '$settings_remote'" >"$restricted/settings.json" 2>"$root/settings.stderr"; then record "read full settings" 0 "$restricted/settings.json"; else record "read full settings" 1 "$restricted/settings.json"; fi
else
  if ssh "${DECKY_DECK_HOST:-steamdeck}" "cat '$settings_remote'" 2>/dev/null | python3 -c 'import json,sys; d=json.load(sys.stdin); m=d.get("metadata",d); vals=[v for v in m.values() if isinstance(v,dict)]; matched=[v for v in vals if v.get("steam_appid")]; delisted=[v for v in matched if v.get("delisted") is True or str(v.get("steam_store_state") or v.get("store_state") or "").lower() in {"delisted","unavailable","removed"}]; print(json.dumps({"entry_count":len(m),"listed_match":len(matched)-len(delisted),"delisted_match":len(delisted),"never_on_steam":len(vals)-len(matched)},sort_keys=True))' >"$root/metadata-summary.json"; then record "read redacted metadata summary" 0 "$root/metadata-summary.json"; else record "read redacted metadata summary" 1 "$root/metadata-summary.json"; fi
fi
python3 - "$manifest" "$root/manifest.json" "$include_settings" <<'PY'
import json,sys
rows=[json.loads(line) for line in open(sys.argv[1])]
json.dump({"schema_version":1,"include_settings":bool(int(sys.argv[3])),"collections":rows},open(sys.argv[2],"w"),sort_keys=True,indent=2)
PY
rm "$manifest"
printf '%s\n' "$root"
