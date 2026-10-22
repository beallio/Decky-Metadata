#!/usr/bin/env bash
# Community fallback render check for a never-on-Steam shortcut.
#
#   smoke_community.sh <never-on-steam-appid>
#
# A non-Steam shortcut that was never on Steam populates its Community tab from
# stored metadata screenshots (provider-icon cards), or shows nothing when it has
# no stored screenshots. Uses the plugin's own `feed selected` log line as the
# source of truth for what the fallback served, then asserts the DOM rendered
# matching cards. When the fixture has no stored screenshots, rendering nothing is
# correct (PASS with a note).
input_fail() { printf 'FAIL: %s\n' "$1" >&2; exit 2; }
appid="${1:-}"
[[ "$appid" =~ ^[1-9][0-9]*$ ]] || input_fail "usage: smoke_community.sh <never-on-steam-appid>"
host="${DECKY_DECK_HOST:-steamdeck}"
homebrew="${DECKY_TEST_HOMEBREW:-/home/deck/homebrew}"
[[ "$homebrew" == /* && "$homebrew" != *$'\n'* && "$homebrew" != *$'\r'* ]] || input_fail "DECKY_TEST_HOMEBREW must be an absolute remote path"
[[ ! "$homebrew" =~ (^|/)\.\.(/|$) ]] || input_fail "DECKY_TEST_HOMEBREW must not traverse parent directories"
source "$(dirname -- "${BASH_SOURCE[0]}")/_lib.sh"

remote_python() {
  local code="$1" command argument quoted
  printf -v command 'python3 -c %q' "$code"
  shift
  for argument in "$@"; do
    printf -v quoted '%q' "$argument"
    command+=" $quoted"
  done
  ssh "$host" "$command"
}

remote_homebrew="$(ssh "$host" "realpath -e -- $(printf %q "$homebrew")")" || fail "remote homebrew is unavailable"
[[ "$remote_homebrew" == /* && "$remote_homebrew" != / ]] || fail "remote homebrew did not resolve to an absolute non-root path"
log_cursor_code='import json,os,pathlib,sys; root=pathlib.Path(sys.argv[1]).resolve(strict=True); log=root/"logs"/"Decky-Metadata"/"decky-metadata.log"; resolved=log.resolve(strict=False); assert root in resolved.parents and not log.is_symlink(), "log path escapes homebrew or is a symlink"; info=os.stat(log,follow_symlinks=False) if log.exists() else None; assert info is None or __import__("stat").S_ISREG(info.st_mode), "log is not a regular file"; print(json.dumps({"root":str(root),"log":str(resolved),"dev":info.st_dev if info else None,"ino":info.st_ino if info else None,"size":info.st_size if info else 0},separators=(",",":")))'
cursor="$(remote_python "$log_cursor_code" "$remote_homebrew")" || fail "could not capture community log cursor"
nav "/library/app/$appid"
sleep 2
cdp eval "$BPM_TARGET" "@$JS_DIR/click_by_label.js" --var "LABEL=Community" >/dev/null
sleep 5
fresh_log_code='import json,os,pathlib,re,stat,sys; root=pathlib.Path(sys.argv[1]).resolve(strict=True); log=root/"logs"/"Decky-Metadata"/"decky-metadata.log"; before=json.loads(sys.argv[2]); resolved=log.resolve(strict=True); assert root in resolved.parents and str(resolved)==before["log"], "community log path changed or escaped homebrew"; info=os.stat(resolved,follow_symlinks=False); assert stat.S_ISREG(info.st_mode), "community log is not a regular file"; prior=before["ino"] is not None; assert not prior or (info.st_dev==before["dev"] and info.st_ino==before["ino"]), "community log rotated or was replaced; request evidence is ambiguous"; offset=before["size"] if prior else 0; assert info.st_size>=offset, "community log was truncated after the cursor"; fd=os.open(resolved,os.O_RDONLY|getattr(os,"O_NOFOLLOW",0)); stream=os.fdopen(fd,"rb"); current=os.fstat(stream.fileno()); assert (current.st_dev,current.st_ino)==(info.st_dev,info.st_ino), "community log changed while reading"; stream.seek(offset); text=stream.read().decode("utf-8","replace"); appid=sys.argv[3]; matches=[line for line in text.splitlines() if "feed selected appId=%r"%appid in line and "page=%r"%"1" in line]; assert matches, "no matching community request line was written after the captured log cursor"; print(json.dumps({"line":matches[-1]},separators=(",",":")))'
fresh_payload="$(remote_python "$fresh_log_code" "$remote_homebrew" "$cursor" "$appid")" || fail "community request has no fresh matching log evidence"
read -r source_val hublen_val < <(python3 - "$fresh_payload" <<'PY'
import json, re, sys
payload = json.loads(sys.argv[1])
line = payload.get("line")
if not isinstance(line, str):
    raise SystemExit("FAIL: community log evidence is malformed")
source = re.search(r"source='([^']*)'", line)
hub = re.search(r"hubLen='([^']*)'", line)
if source is None or hub is None:
    raise SystemExit("FAIL: fresh community log line is missing source/hubLen")
print(source.group(1), hub.group(1))
PY
)
cards_json="$(cdp eval "$BPM_TARGET" "@$JS_DIR/community_cards.js")"

python3 - "$appid" "$source_val" "$hublen_val" "$cards_json" <<'PY' || exit 1
import json, sys
appid, source, hublen, cards_raw = sys.argv[1:]
cards = json.loads(cards_raw)
if not isinstance(cards, dict):
    raise SystemExit("FAIL: community DOM probe returned invalid data")
images = cards.get("cardImageCount")
avatars = cards.get("dataUriAvatarCount")
if type(images) is not int or images < 0 or type(avatars) is not int or avatars < 0:
    raise SystemExit("FAIL: community DOM probe returned invalid image counts")
if source == "none" or hublen == "0":
    if images or avatars:
        raise SystemExit(
            f"FAIL: fresh empty result source={source} hubLen={hublen} "
            f"but DOM contains {images} remote cards and {avatars} injected avatars"
        )
    print(f"NOTE: {appid} has a fresh explicit empty fallback result; the Community DOM is empty")
elif not source or not hublen:
    raise SystemExit("FAIL: fresh community evidence has empty source/hubLen")
elif images <= 0:
    raise SystemExit(f"FAIL: fallback served source={source} hubLen={hublen} but no card images rendered")
print(f"OK: source={source} hubLen={hublen} cards={images} data-uri-avatars={avatars}")
PY
pass "community: appid=$appid fallback has fresh request evidence and matching DOM"
