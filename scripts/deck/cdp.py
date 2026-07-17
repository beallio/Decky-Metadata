#!/usr/bin/env python3
"""Stdlib-only CDP client for the Steam Deck's CEF remote debugger.

Talks to the debugger through the SSH tunnel opened by scripts/deck/tunnel.sh
(default localhost:18081 -> deck 127.0.0.1:8080). No third-party deps, so it
also runs on the Deck itself.

Usage:
  cdp.py list
  cdp.py eval <target> <js | @file | ->   [--var KEY=VALUE ...]
  cdp.py reload [<target>] [--keep-cache]
  cdp.py wait-ready [--timeout SECONDS]
  cdp.py input [<target>] <key> [<key> ...] [--delay MS]
  cdp.py screenshot <output.png> [<target>]

Targets are matched by exact title first, then substring
(e.g. "SharedJSContext", "Big Picture").

input dispatches synthetic key events (rawKeyDown + keyUp) to drive the gamepad
UI when a physical controller is not in the loop — the only way to exercise real
D-pad focus movement and A/B activation from a script. The default target is
"Steam Big Picture Mode" (Gaming Mode); pass an explicit target as the first arg
to override. Keys are named tokens with Steam-controller aliases:

  up/down/left/right (arrows), enter (A), escape (B/back), backspace, tab,
  space, ctrl-a. --delay sets the gap between successive keys (default 120ms) so
  the nav tree settles and each focus move registers. Example — walk a panel:

  cdp.py input down down down
  cdp.py eval "Steam Big Picture Mode" @scripts/deck/js/gpfocus_dump.js

Dispatching arrow keys drives Steam's gamepad focus in this CEF build; pair it
with js/gpfocus_dump.js after each step to read the authoritative focus order.

screenshot captures the composited Gaming Mode page as a PNG below
DECKY_TMP_ROOT (default /tmp/Decky-Metadata). The default target is
"Steam Big Picture Mode"; pass an explicit target as the final argument to
override it.

eval reads JS from the argument, from @path, or from stdin when "-".
--var KEY=VALUE replaces every literal __KEY__ in the JS before evaluation,
so committed snippets in scripts/deck/js/ can be parameterized:

  cdp.py eval SharedJSContext @scripts/deck/js/nav.js --var ROUTE=/library/home

wait-ready polls SharedJSContext until Decky, decky-frontend-lib (window.DFL)
and the app store are loaded — the safe point to run further evals after a
reload or Steam restart.

Environment: CDP_HOST (default localhost), CDP_PORT (default 18081).
"""
import base64
import binascii
import json
import os
from pathlib import Path
import socket
import struct
import sys
import time
import urllib.request

HOST = os.environ.get("CDP_HOST", "localhost")
PORT = int(os.environ.get("CDP_PORT", "18081"))

READY_EXPR = (
    '(() => (typeof window.DeckyPluginLoader !== "undefined"'
    ' && typeof window.DFL !== "undefined"'
    ' && (typeof appStore !== "undefined" && (appStore?.allApps?.length ?? 0) > 0))'
    ' ? "READY" : "loading")()'
)

# Gaming Mode context; substring match in find_target resolves the full title.
DEFAULT_INPUT_TARGET = "Steam Big Picture Mode"

# name -> (key, code, windowsVirtualKeyCode, modifiers). The CDP Input modifier
# bitfield is Alt=1, Ctrl=2, Meta=4, Shift=8.
_KEYS = {
    "up": ("ArrowUp", "ArrowUp", 38, 0),
    "down": ("ArrowDown", "ArrowDown", 40, 0),
    "left": ("ArrowLeft", "ArrowLeft", 37, 0),
    "right": ("ArrowRight", "ArrowRight", 39, 0),
    "enter": ("Enter", "Enter", 13, 0),
    "escape": ("Escape", "Escape", 27, 0),
    "backspace": ("Backspace", "Backspace", 8, 0),
    "tab": ("Tab", "Tab", 9, 0),
    "space": (" ", "Space", 32, 0),
    "ctrl-a": ("a", "KeyA", 65, 2),
}

# Steam-controller and convenience aliases -> canonical key name.
_KEY_ALIASES = {
    "arrowup": "up", "arrowdown": "down", "arrowleft": "left", "arrowright": "right",
    "a": "enter",  # Steam A button activates the focused control
    "b": "escape", "back": "escape", "esc": "escape",  # Steam B button backs out
    "bksp": "backspace", "del": "backspace",
    "ctrla": "ctrl-a", "select-all": "ctrl-a",
    "sp": "space",
}


def http_json(path):
    with urllib.request.urlopen(f"http://{HOST}:{PORT}{path}", timeout=10) as resp:
        return json.load(resp)


def ws_connect(path):
    sock = socket.create_connection((HOST, PORT), timeout=30)
    key = base64.b64encode(os.urandom(16)).decode()
    req = (
        f"GET {path} HTTP/1.1\r\nHost: {HOST}:{PORT}\r\nUpgrade: websocket\r\n"
        f"Connection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n"
    )
    sock.sendall(req.encode())
    resp = b""
    while b"\r\n\r\n" not in resp:
        resp += sock.recv(4096)
    if b"101" not in resp.split(b"\r\n", 1)[0]:
        raise RuntimeError("websocket handshake failed")
    return sock


def ws_send(sock, payload):
    data = payload.encode()
    mask = os.urandom(4)
    header = b"\x81"
    n = len(data)
    if n < 126:
        header += bytes([0x80 | n])
    elif n < 65536:
        header += bytes([0x80 | 126]) + struct.pack(">H", n)
    else:
        header += bytes([0x80 | 127]) + struct.pack(">Q", n)
    sock.sendall(header + mask + bytes(b ^ mask[i % 4] for i, b in enumerate(data)))


def _recv_exact(sock, n):
    buf = b""
    while len(buf) < n:
        chunk = sock.recv(n - len(buf))
        if not chunk:
            raise RuntimeError("websocket closed")
        buf += chunk
    return buf


def ws_recv(sock):
    parts = []
    while True:
        b1, b2 = _recv_exact(sock, 2)
        fin = b1 & 0x80
        op = b1 & 0x0F
        length = b2 & 0x7F
        if length == 126:
            length = struct.unpack(">H", _recv_exact(sock, 2))[0]
        elif length == 127:
            length = struct.unpack(">Q", _recv_exact(sock, 8))[0]
        data = _recv_exact(sock, length)
        if op == 0x8:
            raise RuntimeError("websocket closed")
        if op in (0x0, 0x1):
            parts.append(data)
            if fin:
                return b"".join(parts).decode()


def find_target(title):
    targets = http_json("/json")
    exact = next((t for t in targets if t.get("title") == title), None)
    if exact:
        return exact
    matches = [t for t in targets if title.lower() in (t.get("title") or "").lower()]
    if len(matches) == 1:
        return matches[0]
    if not matches:
        raise SystemExit(f"cdp: no target matching {title!r}. Try: cdp.py list")
    names = ", ".join(repr(t.get("title")) for t in matches)
    raise SystemExit(f"cdp: ambiguous target {title!r}: {names}")


def target_socket(title):
    target = find_target(title)
    path = "/" + target["webSocketDebuggerUrl"].split("/", 3)[3]
    return ws_connect(path)


def rpc(sock, msg_id, method, params=None):
    ws_send(sock, json.dumps({"id": msg_id, "method": method, "params": params or {}}))
    while True:
        msg = json.loads(ws_recv(sock))
        if msg.get("id") == msg_id:
            return msg


def evaluate(title, expr):
    sock = target_socket(title)
    try:
        msg = rpc(sock, 1, "Runtime.evaluate", {
            "expression": expr,
            "returnByValue": True,
            "awaitPromise": True,
        })
    finally:
        sock.close()
    result = msg.get("result", msg)
    if "exceptionDetails" in result:
        print(json.dumps(result["exceptionDetails"], indent=2), file=sys.stderr)
        raise SystemExit(1)
    return result.get("result", result)


def decode_screenshot_data(payload):
    if not payload:
        raise ValueError("cdp: no screenshot data returned")
    try:
        return base64.b64decode(payload, validate=True)
    except (binascii.Error, ValueError, TypeError) as exc:
        raise ValueError("cdp: invalid base64 screenshot data") from exc


def _screenshot_output_path(output_arg):
    tmp_root = Path(os.environ.get("DECKY_TMP_ROOT", "/tmp/Decky-Metadata")).resolve()
    system_tmp = Path("/tmp").resolve()
    if tmp_root != system_tmp and system_tmp not in tmp_root.parents:
        raise SystemExit("cdp: DECKY_TMP_ROOT must resolve below /tmp")

    requested = Path(output_arg)
    output_path = (
        requested.resolve()
        if requested.is_absolute()
        else (tmp_root / "screenshots" / requested).resolve()
    )
    if output_path != tmp_root and tmp_root not in output_path.parents:
        raise SystemExit(f"cdp: screenshot output must be below {tmp_root}")
    return output_path


def capture_screenshot(title, output_arg):
    output_path = _screenshot_output_path(output_arg)
    sock = target_socket(title)
    try:
        msg = rpc(sock, 1, "Page.captureScreenshot", {
            "format": "png",
            "fromSurface": True,
            "captureBeyondViewport": False,
        })
    finally:
        sock.close()

    if "error" in msg:
        error = msg["error"]
        detail = error.get("message", error) if isinstance(error, dict) else error
        raise SystemExit(f"cdp: Page.captureScreenshot failed: {detail}")
    try:
        png_bytes = decode_screenshot_data(msg.get("result", {}).get("data"))
    except ValueError as exc:
        raise SystemExit(str(exc)) from exc

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(png_bytes)
    print(output_path)


def read_js(arg, variables):
    if arg == "-":
        js = sys.stdin.read()
    elif arg.startswith("@"):
        with open(arg[1:], encoding="utf-8") as fh:
            js = fh.read()
    else:
        js = arg
    for key, value in variables.items():
        js = js.replace(f"__{key}__", value)
    return js


def parse_vars(argv):
    variables = {}
    rest = []
    i = 0
    while i < len(argv):
        if argv[i] == "--var":
            if i + 1 >= len(argv) or "=" not in argv[i + 1]:
                raise SystemExit("cdp: --var expects KEY=VALUE")
            key, value = argv[i + 1].split("=", 1)
            variables[key] = value
            i += 2
        else:
            rest.append(argv[i])
            i += 1
    return variables, rest


def cmd_list():
    for t in http_json("/json"):
        print(f"{t.get('type', '?'):8} {t.get('title')}")


def cmd_eval(argv):
    variables, rest = parse_vars(argv)
    if len(rest) != 2:
        raise SystemExit("usage: cdp.py eval <target> <js | @file | -> [--var KEY=VALUE ...]")
    title, js_arg = rest
    value = evaluate(title, read_js(js_arg, variables))
    if value.get("type") == "string":
        # Print raw so JSON.stringify'd payloads pipe cleanly into jq/python.
        print(value.get("value"))
    else:
        print(json.dumps(value, indent=2))


def cmd_reload(argv):
    keep_cache = "--keep-cache" in argv
    argv = [a for a in argv if a != "--keep-cache"]
    title = argv[0] if argv else "SharedJSContext"
    sock = target_socket(title)
    try:
        rpc(sock, 1, "Page.enable")
        ws_send(sock, json.dumps({
            "id": 2,
            "method": "Page.reload",
            "params": {"ignoreCache": not keep_cache},
        }))
        # The renderer tears down while reloading; don't insist on a reply.
        sock.settimeout(5)
        try:
            while True:
                msg = json.loads(ws_recv(sock))
                if msg.get("id") == 2:
                    break
        except Exception:
            pass
    finally:
        sock.close()
    print(f"reload sent to {title} (ignoreCache={not keep_cache})")


def cmd_wait_ready(argv):
    timeout = 180
    if "--timeout" in argv:
        timeout = int(argv[argv.index("--timeout") + 1])
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            value = evaluate("SharedJSContext", READY_EXPR)
            if value.get("value") == "READY":
                print("READY")
                return
        except (SystemExit, Exception):
            pass
        time.sleep(5)
    raise SystemExit(f"cdp: not ready after {timeout}s")


def _resolve_key(name):
    canon = _KEY_ALIASES.get(name.lower(), name.lower())
    spec = _KEYS.get(canon)
    if spec is None:
        valid = ", ".join(sorted(set(list(_KEYS) + list(_KEY_ALIASES))))
        raise SystemExit(f"cdp: unknown key {name!r}. Valid: {valid}")
    return spec


def cmd_input(argv):
    delay_ms = 120
    rest = []
    i = 0
    while i < len(argv):
        if argv[i] == "--delay":
            if i + 1 >= len(argv):
                raise SystemExit("cdp: --delay expects MS")
            delay_ms = int(argv[i + 1])
            i += 2
        else:
            rest.append(argv[i])
            i += 1
    if not rest:
        raise SystemExit(
            "usage: cdp.py input [<target>] <key> [<key> ...] [--delay MS]")
    # The first token is a target override only when it is not itself a key name.
    title = DEFAULT_INPUT_TARGET
    keys = rest
    first = rest[0].lower()
    if first not in _KEYS and first not in _KEY_ALIASES:
        title, keys = rest[0], rest[1:]
    if not keys:
        raise SystemExit("cdp: no keys to send")
    # Validate every key before opening a socket so a typo fails fast.
    resolved = [_resolve_key(k) for k in keys]
    sock = target_socket(title)
    try:
        msg_id = 1
        for key, code, virtual_key, modifiers in resolved:
            for phase in ("rawKeyDown", "keyUp"):
                rpc(sock, msg_id, "Input.dispatchKeyEvent", {
                    "type": phase,
                    "key": key,
                    "code": code,
                    "windowsVirtualKeyCode": virtual_key,
                    "nativeVirtualKeyCode": virtual_key,
                    "modifiers": modifiers,
                })
                msg_id += 1
            time.sleep(delay_ms / 1000)
    finally:
        sock.close()
    print(f"sent {len(keys)} key(s) to {title!r}: {' '.join(keys)}")


def cmd_screenshot(argv):
    if not 1 <= len(argv) <= 2:
        raise SystemExit("usage: cdp.py screenshot <output.png> [<target>]")
    output_arg = argv[0]
    title = argv[1] if len(argv) == 2 else DEFAULT_INPUT_TARGET
    capture_screenshot(title, output_arg)


def main():
    if len(sys.argv) < 2:
        raise SystemExit(__doc__.strip())
    cmd, argv = sys.argv[1], sys.argv[2:]
    if cmd == "list":
        cmd_list()
    elif cmd == "eval":
        cmd_eval(argv)
    elif cmd == "reload":
        cmd_reload(argv)
    elif cmd == "wait-ready":
        cmd_wait_ready(argv)
    elif cmd == "input":
        cmd_input(argv)
    elif cmd == "screenshot":
        cmd_screenshot(argv)
    else:
        raise SystemExit(f"cdp: unknown command {cmd!r}\n\n{__doc__.strip()}")


if __name__ == "__main__":
    main()
