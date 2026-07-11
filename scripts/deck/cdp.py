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

Targets are matched by exact title first, then substring
(e.g. "SharedJSContext", "Big Picture").

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
import json
import os
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
    else:
        raise SystemExit(f"cdp: unknown command {cmd!r}\n\n{__doc__.strip()}")


if __name__ == "__main__":
    main()
