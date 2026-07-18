#!/usr/bin/env bash
# Install a published GitHub *release* build onto the Deck via Decky's OWN
# installer (over CDP) — the same path the self-update panel uses.
#
# Why this exists: the on-device dev loop installs local "X.Y.Z+<hash>" builds,
# which the update panel deliberately refuses to auto-update (isLocalBuild), and
# whose "+build" metadata out-ranks any same-base "-dev.g…" prerelease. So to
# exercise or use the self-updater you must first be on a real *release* build.
# This script puts the Deck on one; from there the panel updates normally.
#
#   scripts/deck/install_release.sh <tag> [update|downgrade]
#     scripts/deck/install_release.sh v0.3.1                 # move off a local build
#     scripts/deck/install_release.sh v0.3.2-dev.ge2ba24a    # force a dev prerelease
#
# After it fires, CONFIRM the install prompt that appears on the Deck. Decky
# downloads the zip, verifies the sha256, reinstalls, and restarts the plugin;
# startup reconciliation then promotes the pending install (grep the plugin log
# for "Pending update promoted").
#
# install_type is cosmetic (prompt wording only): auto-detected from the
# installed version unless overridden (update=2, downgrade=3).
#
# Requires: gh (authed), the CDP tunnel (auto-raised via tunnel.sh), and the
# plugin already installed on the Deck.
# Env: DECKY_DECK_HOST (default steamdeck), REPO (default beallio/Decky-Metadata).
set -euo pipefail

repo="${REPO:-beallio/Decky-Metadata}"
here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
root="$(git -C "$here" rev-parse --show-toplevel)"
host="${DECKY_DECK_HOST:-steamdeck}"
plugin_dir="/home/deck/homebrew/plugins/Decky-Metadata"   # zip folder name (hyphenated)

tag="${1:?usage: install_release.sh <tag> [update|downgrade]}"
mode="${2:-auto}"
ver="${tag#v}"

# Plugin identity Decky matches on = plugin.json "name" (may contain a space).
name="$(node -p "require('$root/plugin.json').name")"

# Zip asset download URL.
url="$(gh release view "$tag" --repo "$repo" --json assets \
  -q '.assets[] | select(.name=="Decky-Metadata.zip") | .url')"
[ -n "$url" ] || { echo "install_release: no Decky-Metadata.zip asset on $tag" >&2; exit 1; }

# sha256 Decky verifies = digest of the whole zip. Download and compute it so we
# never hand Decky a stale hash (a mismatch aborts the install).
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
gh release download "$tag" --repo "$repo" --pattern "Decky-Metadata.zip" --dir "$tmp" --clobber >/dev/null
sha="$(sha256sum "$tmp/Decky-Metadata.zip" | awk '{print $1}')"

# install_type: auto -> downgrade when the tag's base is below what's installed.
case "$mode" in
  update) itype=2 ;;
  downgrade) itype=3 ;;
  auto)
    installed="$(ssh -o BatchMode=yes -o ConnectTimeout=5 "$host" \
      "python3 -c 'import json;print(json.load(open(\"$plugin_dir/plugin.json\"))[\"version\"])'" 2>/dev/null || true)"
    itype="$(python3 - "$ver" "${installed:-}" <<'PY'
import re, sys
def base(v):
    m = re.match(r'(\d+)\.(\d+)\.(\d+)', v or '')
    return tuple(int(x) for x in m.groups()) if m else (0, 0, 0)
print(3 if base(sys.argv[1]) < base(sys.argv[2]) else 2)
PY
)" ;;
  *) echo "install_release: mode must be update|downgrade|auto" >&2; exit 2 ;;
esac

"$here/tunnel.sh" up >/dev/null
echo "install_release: installing $tag ($ver) as '$name' (install_type=$itype) — confirm the prompt on the Deck"
python3 "$here/cdp.py" eval SharedJSContext \
'(()=>{try{window.DeckyBackend.callable("utilities/install_plugin")("__URL__","__NAME__","__VER__","__SHA__",__TYPE__);return "install_plugin invoked — confirm the prompt on the Deck";}catch(e){return "error: "+String(e);}})()' \
  --var "URL=$url" --var "NAME=$name" --var "VER=$ver" --var "SHA=$sha" --var "TYPE=$itype"
