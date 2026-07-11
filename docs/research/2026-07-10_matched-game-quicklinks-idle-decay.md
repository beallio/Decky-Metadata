# Research: Matched non-Steam game Game Info quick-links decay while idle

**Status:** OPEN investigation — deferred. Pick this up **after** the three
in-flight plans land (`ign-platform-match-preference`,
`hide-quicklinks-row-nonsteam`, `gameinfo-focus-reset`). This is a *separate*
problem from all three and from the already-merged `gameinfo-shield-exhaustion`.

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

## Current best hypothesis (unproven)

Steam periodically **rebuilds the `details` object** for the shortcut appid
(evidence: our injected `descriptionsData` is gone → `strFullDescription:""` after
idle; the rebuilt `details` is bound to the shortcut id `3015223078`). The 5
store/community links are produced by Steam's link-builder from *some* state that
is present on first render (optimistic / from a matched-appid fetch during the
initial spoofed render) but is dropped when `details` is reconciled against the
shortcut appid, which has no real store page. The 2s `BIsModOrShortcut` poll is a
symptom of a periodic reconcile pass, not the cause.

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

## Concrete next steps

1. **Enumerate the link-builder inputs**: read the full `l = [...]` assembly in
   `chunk~2dcc5aaf7.js`; list the exact `details`/`overview` fields each of the 5
   links reads. This tells us what state is present-then-dropped.
2. **Instrument the details rebuild**: over CDP, subscribe to / poll
   `appDetailsStore.GetAppData(3015223078).details` on the idle page; log when the
   object identity changes and which link-driving fields flip. Identify the
   trigger (timer? store subscription? focus/visibility event?).
3. **Test a fix hypothesis**: on the idle page, re-assert the link-driving fields
   (and `descriptionsData`) on the rebuilt `details`, force a re-render, and check
   whether the links return **and persist**. If yes, the fix is to patch the
   `details` getter/cache (or subscribe to the rebuild) and re-assert for matched
   non-Steam games — not just on render.
4. **Decide fix vs. limitation**: if the links depend on genuinely async
   store-item data for the shortcut appid, persisting them may require faking that
   data continuously. Weigh a robust patch vs. documenting a known limitation.
5. Keep matched vs. unmatched separated: for **unmatched** games the
   `hide-quicklinks-row-nonsteam` tree-patch already removes the row (so idle
   decay there is moot); this investigation is **matched games only**.

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
