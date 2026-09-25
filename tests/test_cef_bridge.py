from __future__ import annotations

import asyncio
import json
import http.client
import socket
import struct
import threading
import time
from unittest.mock import patch

import pytest

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
            if self.release.is_set():
                # The client may close the socket while this fixture is still
                # reading the command. That is the expected unload path too.
                self.closed.set()
            else:
                self.error = error


class _TrickleHttpServer:
    def __init__(self) -> None:
        self.server = socket.socket()
        self.server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self.server.bind(("127.0.0.1", 0))
        self.server.listen(1)
        self.port = self.server.getsockname()[1]
        self.headers_sent = threading.Event()
        self.disconnected = threading.Event()
        self.stop = threading.Event()
        self.client = None
        self.worker = threading.Thread(target=self._serve, daemon=True)

    def __enter__(self):
        self.worker.start()
        return self

    def __exit__(self, *_args):
        self.close()

    def close(self) -> None:
        self.stop.set()
        if self.client is not None:
            try:
                self.client.shutdown(socket.SHUT_RDWR)
            except OSError:
                pass
            try:
                self.client.close()
            except OSError:
                pass
        try:
            self.server.close()
        except OSError:
            pass
        self.worker.join(1)

    def _serve(self) -> None:
        try:
            client, _address = self.server.accept()
            self.client = client
            with client:
                request = b""
                while b"\r\n\r\n" not in request:
                    request += client.recv(4096)
                client.sendall(b"HTTP/1.1 200 OK\r\nConnection: close\r\n\r\n")
                self.headers_sent.set()
                while not self.stop.wait(0.01):
                    client.sendall(b" ")
        except (BrokenPipeError, ConnectionResetError, OSError):
            self.disconnected.set()
        finally:
            self.disconnected.set()
            try:
                self.server.close()
            except OSError:
                pass


def _route_discovery_to_local_server(monkeypatch, endpoint: _TrickleHttpServer) -> None:
    http_connection = cef_bridge.http.client.HTTPConnection
    monkeypatch.setattr(
        cef_bridge.http.client,
        "HTTPConnection",
        lambda host, _port, timeout: http_connection(host, endpoint.port, timeout),
    )


def _target(url: str) -> dict[str, str]:
    return {"title": "Steam Big Picture Mode", "type": "page", "webSocketDebuggerUrl": url}


def test_target_discovery_skips_shared_context_and_has_three_second_timeout() -> None:
    evaluator = cef_bridge.BigPictureEvaluator()
    targets = [
        {"title": "SharedJSContext", "type": "page", "webSocketDebuggerUrl": "ws://127.0.0.1:1"},
        {"title": "QuickAccess_uid14", "type": "page", "webSocketDebuggerUrl": "ws://127.0.0.1:1"},
    ]
    class Response:
        def __init__(self):
            self.done = False

        def getheader(self, _name):
            return None

        def read(self, _size):
            if self.done:
                return b""
            self.done = True
            return json.dumps(targets).encode()

    connections = []

    class Connection:
        sock = None

        def __init__(self, host, port, timeout):
            self.arguments = (host, port, timeout)
            connections.append(self)

        def request(self, method, path):
            assert (method, path) == ("GET", "/json")

        def getresponse(self):
            return Response()

        def close(self):
            return None

    with patch.object(cef_bridge.http.client, "HTTPConnection", Connection):
        result = evaluator._find_big_picture_target()
    assert result is None
    assert connections[0].arguments == ("127.0.0.1", 8080, 3)


def test_discovery_body_rejects_declared_oversize_and_trickled_body() -> None:
    class Connection:
        sock = None

    class LargeResponse:
        def getheader(self, _name):
            return str(cef_bridge.MAX_DISCOVERY_BYTES + 1)

        def read(self, _size):
            raise AssertionError("oversized body must be rejected before reading")

    with pytest.raises(ValueError, match="too large"):
        cef_bridge.BigPictureEvaluator._read_discovery_body(
            LargeResponse(), Connection(), time.monotonic() + 1
        )

    class TrickleResponse:
        def getheader(self, _name):
            return None

        def read(self, _size):
            time.sleep(0.01)
            return b"["

    started = time.monotonic()
    with pytest.raises(TimeoutError, match="discovery.*timed out"):
        cef_bridge.BigPictureEvaluator._read_discovery_body(
            TrickleResponse(), Connection(), started + 0.04
        )
    assert time.monotonic() - started < 0.2


def test_websocket_upgrade_header_has_absolute_deadline_and_byte_limit() -> None:
    class TrickleSocket:
        timeout = None

        def settimeout(self, value):
            self.timeout = value

        def recv(self, _count):
            time.sleep(0.01)
            return b"x"

    sock = TrickleSocket()
    started = time.monotonic()
    with pytest.raises(TimeoutError, match="header.*timed out"):
        cef_bridge.BigPictureEvaluator._recv_until(
            sock, b"\r\n\r\n", started + 0.04, max_bytes=64
        )
    assert time.monotonic() - started < 0.2

    with pytest.raises(ValueError, match="header.*too large"):
        cef_bridge.BigPictureEvaluator._recv_until(
            sock, b"\r\n\r\n", time.monotonic() + 1, max_bytes=4
        )


def test_unload_closes_a_registered_discovery_connection() -> None:
    entered = threading.Event()
    closed = threading.Event()

    class DiscoveryConnection:
        def __init__(self, *_args, **_kwargs):
            self.sock = None

        def request(self, *_args, **_kwargs):
            return None

        def getresponse(self):
            entered.set()
            closed.wait(2)
            raise OSError("discovery connection closed")

        def close(self):
            closed.set()

    evaluator = cef_bridge.BigPictureEvaluator()
    failures = []

    def find_target():
        try:
            evaluator._find_big_picture_target()
        except OSError as error:
            failures.append(error)

    with patch.object(cef_bridge.http.client, "HTTPConnection", DiscoveryConnection):
        worker = threading.Thread(target=find_target)
        worker.start()
        assert entered.wait(1)
        evaluator.close_active()
        worker.join(1)

    assert not worker.is_alive()
    assert closed.is_set()
    assert failures
    assert not evaluator._active_discovery_connections


def test_connection_close_discovery_trickle_is_interrupted_by_its_deadline(monkeypatch) -> None:
    with _TrickleHttpServer() as endpoint:
        _route_discovery_to_local_server(monkeypatch, endpoint)
        monkeypatch.setattr(cef_bridge, "DISCOVERY_TIMEOUT_SECONDS", 0.2)
        evaluator = cef_bridge.BigPictureEvaluator()
        failures = []
        finished = threading.Event()

        def find_target():
            try:
                evaluator._find_big_picture_target()
            except BaseException as error:
                failures.append(error)
            finally:
                finished.set()

        started = time.monotonic()
        worker = threading.Thread(target=find_target, daemon=True)
        worker.start()
        completed_promptly = finished.wait(0.8)
        elapsed = time.monotonic() - started
        if not completed_promptly:
            endpoint.close()
            worker.join(1)

        assert completed_promptly, "the real close-delimited response read outlived its deadline"
        assert elapsed < 0.8
        assert failures
        assert endpoint.headers_sent.is_set()
        assert endpoint.disconnected.wait(1)
        assert not evaluator._active_discovery_connections


def test_unload_interrupts_a_real_connection_close_discovery_trickle(monkeypatch) -> None:
    with _TrickleHttpServer() as endpoint:
        _route_discovery_to_local_server(monkeypatch, endpoint)
        evaluator = cef_bridge.BigPictureEvaluator()
        failures = []
        finished = threading.Event()

        def find_target():
            try:
                evaluator._find_big_picture_target()
            except BaseException as error:
                failures.append(error)
            finally:
                finished.set()

        worker = threading.Thread(target=find_target, daemon=True)
        worker.start()
        assert endpoint.headers_sent.wait(1)
        time.sleep(0.03)
        evaluator.close_active()
        completed_promptly = finished.wait(0.5)
        if not completed_promptly:
            endpoint.close()
            worker.join(1)

        assert completed_promptly, "unload did not close the response-owned transport"
        assert failures
        assert endpoint.disconnected.wait(1)
        assert not evaluator._active_discovery_connections


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
                # Closing the WebSocket can interrupt the peer before it reads
                # a complete CDP command. Mark that expected disconnect first.
                endpoint.release.set()
                evaluator.close_active()
                assert (await evaluator.eval_in_big_picture("true"))["runtimeMissing"] is True
                result = await asyncio.wait_for(pending, timeout=3)
                assert result["runtimeMissing"] is True
                assert await asyncio.to_thread(endpoint.closed.wait, 2)
            asyncio.run(run())
    assert not evaluator._active_cdp_sockets
