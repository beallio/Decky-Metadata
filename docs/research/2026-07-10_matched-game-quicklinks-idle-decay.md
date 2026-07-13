# Research: Matched non-Steam game Game Info quick-links decay while idle

**Status:** RESOLVED on `feat/matched-quicklinks-idle-decay` (2026-07-13).
Matched shortcut details replacements are populated before SteamUI receives
them; the five store/community links and injected description survived repeated
idle checks longer than 60 seconds.

**Date opened:** 2026-07-10. **Device session evidence** captured live over CDP.

---

## Symptom

On a **matched** non-Steam game (a shortcut with a real `steam_appid`), open its
Game Info tab: the quick-links row (Store Page / Community Hub / Discussions /
Guides / Support) renders, then **disappears while the page sits idle** — no
navigation, no button presses. Leaving and re-entering the page brings them back
(briefly), then they decay again.

This is user-visible as "the buttons vanish on their own." It is **distinct** from:

- `gameinfo-shield-exhaustion` (merged): that fixed the route-shield **call
  budget** (4→64) so a render burst can't exhaust the spoof. This idle decay is
  not budget exhaustion.
- `hide-quicklinks-row-nonsteam` (in flight): that intentionally *removes* the row
  for **unmatched** (no-`steam_appid`) games. This bug is about matched games
  *losing* a row they should keep.
- `gameinfo-focus-reset` (in flight): that's the focus jump on subsection return,
  a different mechanism.

---

## Evidence (live CDP, 2026-07-10)

### Matched game — Transformers: Devastation (shortcut `3015223078` → Steam `338930`)

- Fresh open: quick-links section child had `links.length === 5`
  (`Store Page, Community Hub, Discussions, Guides, Support`).
- After ~48s idle: DOM row container still present, but `links.length === 0`.
- Live flags on the section's `details` at that point:
  `bStorePagePublished:false`, `bAvailableContentOnStore:false`,
  `bCommunityMarketPresence:false`, `strFullDescription:""` (our injected
  description was **gone**), `unAppID/nAppID/appid: 3015223078` (the shortcut id).
- `overview.BIsModOrShortcut()` returned **`false`** (spoof still active).
- Log: while idle, Steam polled `BIsModOrShortcut` for the appid **every ~2s**,
  every call `reason='normal-shortcut'`, `shieldState=None`, `bypassCounter` idle.
  Because the spoof still returned false, **BIsModOrShortcut is not the cause.**

### Unmatched game — X-Men Origins: Wolverine [DS] (shortcut `3156562597`, no `steam_appid`)

- Freshly opened: quick-links section had `links.length === 6`
  (`Store Page, Community Hub, Discussions, Guides, Market, Support`) — the full
  row **including Market**.
- Flags: `bStorePagePublished:false`, `bAvailableContentOnStore:false`,
  `bCommunityMarketPresence:true`, `marketPresence:true`, `BIsModOrShortcut()
  === false`, `strFullDescription:""`.

**The decisive contradiction:** X-Men shows the 5 store/community links with
`bStorePagePublished === false`. So those 5 links are **NOT** gated by
`bStorePagePublished` / `bAvailableContentOnStore`. Only **Market** is cleanly
flag-gated (`bCommunityMarketPresence` — true on X-Men → Market shows; false on
idle Devastation → no Market). Confirmed in the bundle:
`BHasMarketPresence(e){return !LAUNCHER_TYPE && e.bCommunityMarketPresence}`.

---

## Ruled out

- **Shield / spoof exhaustion or flip** — `BIsModOrShortcut()` stays `false`
  (spoofed) throughout; links vanish anyway.
- **Store-presence flags gating the 5 links** — X-Men renders all of them with
  `bStorePagePublished:false`.
- **Route-shield TTL (2000ms)** — the shield is irrelevant here; the spoof isn't
  what's dropping the links.

## Confirmed mechanism and fix (2026-07-13)

The native cache update is the rebuild boundary. On a fresh Transformers Game
Info open, the first
`SetCachedDataForApp(3015223078, "achievements", 2, ...)` call arrived about
2.65 seconds later and replaced both the `details` and `descriptionsData` object
identities. The trigger was the achievements cache fill, not a timer,
focus/visibility event, or route navigation. Decky's description payload remained
in `appDetailsCache`, but SteamUI could render the transient native replacement
before a later `GetDescriptions` call restored `appData.descriptionsData`; that
render then stayed stale.

The current Steam link builder also rules out an async-store-data limitation.
The five links have these inputs:

- **Store Page:** rendered whenever `overview.BIsModOrShortcut()` is false;
  its URL uses the app id (or a standalone-store demo parent).
- **Community Hub:** the same shortcut gate, plus non-launcher mode.
- **Discussions:** the same shortcut gate, plus non-launcher mode.
- **Guides:** the same shortcut gate, plus non-launcher mode.
- **Support:** the same shortcut gate, plus kiosk mode being unlocked.

None of those five reads `details`, `rgCards`, `bAvailableContentOnStore`, or an
async store-item result. Those fields gate additional links only: DLC uses
`bAvailableContentOnStore`, Points Shop uses `rgCards`, Workshop uses
`workshopVisible`, and Market uses `marketPresence`.

The fix patches `appDetailsStore.GetAppData`, records the last `details` identity
per app id, and recognizes only non-Steam metadata records with a positive
`steam_appid`. When Steam replaces a matched shortcut's `details`, Decky writes
the description, associations, and screenshot fields onto the replacement before
returning it to SteamUI. The native details identity change already invalidates
the observing section, so the rerender receives the populated object rather than
the transient empty one. Unmatched shortcuts do not take this rebuild path, and
the route shield / in-call truth behavior is unchanged.

### Verification evidence

- Before the fix, CDP captured the achievements cache write changing the
  `details` identity; the DOM could fall from 1,602 to 548 characters while the
  later `appData.descriptionsData` had already returned to 1,109 characters.
- On the deployed fix, Transformers (`3015223078` -> `338930`) exposed exactly
  Store Page, Community Hub, Discussions, Guides, and Support, with a
  1,109-character `strFullDescription` on the React section's `details` object.
- Untouched idle samples of 91.6 seconds and 117.5 seconds (including a
  leave/re-enter cycle) retained all five links and the full description. The
  exact final matched-only bundle passed another 87.3-second idle sample.
- `BIsModOrShortcut()` remained `false`, and all details ids remained the
  shortcut id throughout.
- The no-launch device suite passed with semantic fixtures: listed
  `2155012430`, delisted `3497159354`, and never-on-Steam `2977244592`. It also
  confirmed zero cache writes across three subsection round-trips.

To confirm/refute, the link-builder inputs must be enumerated (see next steps).

---

## Where to look

### Steam bundle (on device: `~/.local/share/Steam/steamui/`)

- `chunk~2dcc5aaf7.js` contains the AppDetails links section. The links array is
  built around:
  ```
  l = [{ label: (0,u.we)("#AppDetails_Links_Store" ...) }, ...]
  s = t.bAvailableContentOnStore
  r = !e && n.rgCards?.length > 0            // trading cards influence a link
  // store-page button gate seen nearby:
  if (!t?.bStorePagePublished || r.BIsModOrShortcut() || r.BIsApplication...) ...
  ```
  Read the **full** function that assembles `l` (search `#AppDetails_Links_Store`
  / `#AppDetails_Link_Discussions`) to enumerate exactly what each of the 5 links
  requires. `rgCards`, `bAvailableContentOnStore`, and possibly async store-item
  data are candidates for what's present-then-dropped.
- Localization tokens: `#AppDetails_Links_Store`, `#AppDetails_Links_Community`,
  `#AppDetails_Link_Discussions`, `#AppDetails_Link_Guides`,
  `#AppDetails_Link_Market`, `#AppDetails_Link_Support`,
  `#AppDetails_Link_Workshop`.

### React anchor (stable across builds)

The links **section** is the React node whose `props` are exactly
`{ overview, details, workshopVisible, marketPresence }`; its child receives the
computed `links` array. Component names (`N`, `z`) and CSS hashes
(`b3wFR-A7udxD-EIp_rbqC`) change per build — do not anchor on them.

### Our code

- `src/steam/metadataPatch.ts` — `applyMetadata` injects
  `descriptionsData`/`associationData`/screenshots and calls
  `appDetailsCache.SetCachedDataForApp(...)`. The idle rebuild wipes these, so
  whatever we re-assert must survive a `details` rebuild, not just a render.
- `src/steam/routerPatches.ts` — GAME_DETAIL_ROUTES render patch re-applies on
  render, but the idle decay happens **without** a render patch firing, so a
  render-only re-apply won't hold.

---

## Investigation steps completed

1. Enumerated the full link assembly in `chunk~2dcc5aaf7.js`.
2. Polled selected app-data fields at 100 ms and instrumented the native cache
   setter to identify the achievements cache fill as the replacement trigger.
3. Tested the getter-bound re-assert on-device across repeated idle cycles.
4. Chose the fix path because the five required links have no async store-data
   dependency.
5. Kept the rebuild guard matched-only; unmatched rows remain governed by
   `hide-quicklinks-row-nonsteam`.

---

## Appendix: CDP how-to (self-contained for a cold resume)

See also memory `[[deck-cdp-debug-loop]]`. Enable debug logging in the plugin so
`BIsModOrShortcut decision` / `reentry shield` traces land in
`~/homebrew/logs/Decky-Metadata/decky-metadata.log`.

CEF remote debugging is enabled on device (`~/.steam/steam/.cef-enable-remote-debugging`,
listening `127.0.0.1:8080`). Tunnel from the workstation, then eval via a
dependency-free raw-WebSocket client:

```bash
ssh -f -N -o ExitOnForwardFailure=yes -L 18081:localhost:8080 steamdeck
python3 cdp_eval.py localhost 18081 SharedJSContext        <js-file-or-inline>   # JS stores (SteamUIStore, appStore)
python3 cdp_eval.py localhost 18081 "Steam Big Picture Mode" <js-file-or-inline> # DOM + React fibers
# close tunnel: kill the ssh whose /proc/<pid>/comm == "ssh" matching 18081 (don't pkill your shell)
```

Notes: `appStore`/`appDetailsStore`/`SteamUIStore` live in **SharedJSContext**;
the game DOM + React fibers live in **"Steam Big Picture Mode"**. Read a fiber
from a DOM node via its `__reactFiber$…` key and walk `.return` up / `.child` +
`.sibling` down. Find the links section by the `{overview, details,
workshopVisible, marketPresence}` prop signature.

`cdp_eval.py` (recreate if the scratchpad is gone):

```python
#!/usr/bin/env python3
"""Minimal CDP Runtime.evaluate over a raw RFC6455 websocket. No deps.
Usage: cdp_eval.py <host> <port> <target-title> <js-expression-file-or-inline>"""
import base64, hashlib, json, os, socket, struct, sys, urllib.request

def ws_connect(host, port, path):
    sock = socket.create_connection((host, port), timeout=15)
    key = base64.b64encode(os.urandom(16)).decode()
    req = (f"GET {path} HTTP/1.1\r\nHost: {host}:{port}\r\nUpgrade: websocket\r\n"
           f"Connection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n")
    sock.sendall(req.encode())
    resp = b""
    while b"\r\n\r\n" not in resp:
        resp += sock.recv(4096)
    if b"101" not in resp.split(b"\r\n", 1)[0]:
        raise RuntimeError("handshake failed")
    return sock

def ws_send(sock, payload):
    data = payload.encode(); mask = os.urandom(4); header = b"\x81"; n = len(data)
    if n < 126: header += bytes([0x80 | n])
    elif n < 65536: header += bytes([0x80 | 126]) + struct.pack(">H", n)
    else: header += bytes([0x80 | 127]) + struct.pack(">Q", n)
    sock.sendall(header + mask + bytes(b ^ mask[i % 4] for i, b in enumerate(data)))

def recv_exact(sock, n):
    buf = b""
    while len(buf) < n: buf += sock.recv(n - len(buf))
    return buf

def ws_recv(sock):
    parts = []
    while True:
        b1, b2 = recv_exact(sock, 2); fin = b1 & 0x80; op = b1 & 0x0F
        length = b2 & 0x7F
        if length == 126: length = struct.unpack(">H", recv_exact(sock, 2))[0]
        elif length == 127: length = struct.unpack(">Q", recv_exact(sock, 8))[0]
        data = recv_exact(sock, length)
        if op == 0x8: raise RuntimeError("closed")
        if op in (0x1, 0x0):
            parts.append(data)
            if fin: return b"".join(parts).decode()

def main():
    host, port, title, expr = sys.argv[1], int(sys.argv[2]), sys.argv[3], sys.argv[4]
    if os.path.exists(expr): expr = open(expr).read()
    targets = json.load(urllib.request.urlopen(f"http://{host}:{port}/json", timeout=10))
    t = next((x for x in targets if x.get("title") == title), None)
    path = "/" + t["webSocketDebuggerUrl"].split("/", 3)[3]
    sock = ws_connect(host, port, path)
    ws_send(sock, json.dumps({"id": 1, "method": "Runtime.evaluate",
        "params": {"expression": expr, "returnByValue": True, "awaitPromise": True}}))
    while True:
        msg = json.loads(ws_recv(sock))
        if msg.get("id") == 1:
            print(json.dumps(msg.get("result", msg), indent=2)); return

if __name__ == "__main__":
    main()
```
