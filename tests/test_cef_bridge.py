from __future__ import annotations

import asyncio
import json
import socket
import struct
import threading
from unittest.mock import patch

from backend import cef_bridge


def _recv_exact(connection: socket.socket, count: int) -> bytes:
    data = b""
    while len(data) < count:
        chunk = connection.recv(count - len(data))
        if not chunk:
            raise ConnectionError("client disconnected")
        data += chunk
    return data


class _FakeCDP:
    def __init__(self, hold: bool = False) -> None:
        self.server = socket.socket()
        self.server.bind(("127.0.0.1", 0))
        self.server.listen(1)
        self.server.settimeout(3)
        self.url = f"ws://127.0.0.1:{self.server.getsockname()[1]}/devtools/page/fixture"
        self.connected = threading.Event()
        self.release = threading.Event()
        self.closed = threading.Event()
        self.hold = hold
        self.command = None
        self.error = None
        self.worker = threading.Thread(target=self._serve, daemon=True)

    def __enter__(self):
        self.worker.start()
        return self

    def __exit__(self, _type, _value, _traceback):
        self.release.set()
        self.server.close()
        self.worker.join(4)
        if self.error:
            raise self.error

    def _serve(self) -> None:
        try:
            connection, _address = self.server.accept()
            with connection:
                connection.settimeout(3)
                header = b""
                while b"\r\n\r\n" not in header:
                    header += connection.recv(4096)
                connection.sendall(b"HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n")
                self.connected.set()
                first, second = _recv_exact(connection, 2)
                count = second & 0x7F
                if count == 126:
                    count = struct.unpack("!H", _recv_exact(connection, 2))[0]
                elif count == 127:
                    count = struct.unpack("!Q", _recv_exact(connection, 8))[0]
                mask = _recv_exact(connection, 4)
                payload = _recv_exact(connection, count)
                self.command = json.loads(bytes(byte ^ mask[index % 4] for index, byte in enumerate(payload)))
                if self.hold:
                    self.release.wait(3)
                    try:
                        self.closed.set() if not connection.recv(1) else None
                    except (ConnectionResetError, OSError, socket.timeout):
                        self.closed.set()
                    return
                response = json.dumps({
                    "id": self.command["id"],
                    "result": {"result": {"value": {"status": "playing", "appId": 570}}},
                }).encode()
                frame = bytes([0x81, len(response)]) if len(response) < 126 else bytes([0x81, 126]) + struct.pack("!H", len(response))
                connection.sendall(frame + response)
        except (ConnectionResetError, OSError, ConnectionError) as error:
            if not self.release.is_set():
                self.error = error


def _target(url: str) -> dict[str, str]:
    return {"title": "Steam Big Picture Mode", "type": "page", "webSocketDebuggerUrl": url}


def test_target_discovery_skips_shared_context_and_has_three_second_timeout() -> None:
    evaluator = cef_bridge.BigPictureEvaluator()
    targets = [
        {"title": "SharedJSContext", "type": "page", "webSocketDebuggerUrl": "ws://127.0.0.1:1"},
        {"title": "QuickAccess_uid14", "type": "page", "webSocketDebuggerUrl": "ws://127.0.0.1:1"},
    ]
    response = type("Response", (), {"__enter__": lambda self: self, "__exit__": lambda *args: None,
                                     "read": lambda self: json.dumps(targets).encode()})()
    with patch.object(cef_bridge.urllib.request, "urlopen", return_value=response) as lookup:
        result = evaluator._find_big_picture_target()
    assert result is None
    assert lookup.call_args.kwargs["timeout"] == 3


def test_evaluator_sends_runtime_evaluate_and_returns_the_dictionary() -> None:
    with _FakeCDP() as endpoint:
        evaluator = cef_bridge.BigPictureEvaluator()
        with patch.object(evaluator, "_find_big_picture_target", return_value=_target(endpoint.url)):
            result = asyncio.run(evaluator.eval_in_big_picture("({status:'playing',appId:570})"))
    assert result == {"status": "playing", "appId": 570, "tab": "Steam Big Picture Mode"}
    assert endpoint.command["method"] == "Runtime.evaluate"
    assert endpoint.command["params"]["expression"] == "({status:'playing',appId:570})"
    assert not evaluator._active_cdp_sockets


def test_evaluation_errors_are_structured_and_transient_transport_errors_retry() -> None:
    evaluator = cef_bridge.BigPictureEvaluator()
    with patch.object(evaluator, "_eval_in_big_picture_sync", side_effect=ConnectionResetError("socket dropped")):
        result = asyncio.run(evaluator.eval_in_big_picture("true"))
    assert result["status"] == "Steam UI unavailable"
    assert result["retryable"] is True
    assert "socket dropped" in result["error"]


def test_unload_closes_a_socket_registered_before_connect_returns() -> None:
    with _FakeCDP(hold=True) as endpoint:
        evaluator = cef_bridge.BigPictureEvaluator()
        with patch.object(evaluator, "_find_big_picture_target", return_value=_target(endpoint.url)):
            async def run():
                pending = asyncio.create_task(evaluator.eval_in_big_picture("({status:'wait'})"))
                assert await asyncio.to_thread(endpoint.connected.wait, 2)
                evaluator.close_active()
                assert (await evaluator.eval_in_big_picture("true"))["runtimeMissing"] is True
                result = await asyncio.wait_for(pending, timeout=3)
                assert result["runtimeMissing"] is True
                endpoint.release.set()
                assert await asyncio.to_thread(endpoint.closed.wait, 2)
            asyncio.run(run())
    assert not evaluator._active_cdp_sockets
