"""Bounded evaluator for the Steam Big Picture default-world renderer."""

from __future__ import annotations

import asyncio
import base64
import http.client
import json
import os
import socket
import struct
import threading
import time
import urllib.error
from typing import Any
from urllib.parse import urlparse

MAX_EVALUATION_BYTES = 512 * 1024
MAX_RESPONSE_FRAME_BYTES = 16 * 1024 * 1024
MAX_DISCOVERY_BYTES = 1024 * 1024
MAX_UPGRADE_HEADER_BYTES = 64 * 1024
DISCOVERY_TIMEOUT_SECONDS = 3
UPGRADE_TIMEOUT_SECONDS = 5


class BigPictureEvaluator:
    def __init__(self, logger: Any = None) -> None:
        self._unloading = False
        self._last_debugger_warning = 0.0
        self._active_cdp_sockets: set[socket.socket] = set()
        self._active_discovery_connections: dict[
            http.client.HTTPConnection, list[Any | None]
        ] = {}
        self._active_cdp_lock = threading.Lock()
        self._logger = logger

    @staticmethod
    def unavailable() -> dict[str, Any]:
        return {"status": "Steam UI unavailable", "error": "Plugin is unloading", "runtimeMissing": True}

    def close_active(self) -> None:
        with self._active_cdp_lock:
            self._unloading = True
            sockets = tuple(self._active_cdp_sockets)
            connections = tuple(self._active_discovery_connections.items())
        for connection, response_reference in connections:
            self._interrupt_discovery_connection(connection, response_reference)
        for sock in sockets:
            try:
                sock.shutdown(socket.SHUT_RDWR)
            except OSError:
                pass
            try:
                sock.close()
            except OSError:
                pass

    async def eval_in_big_picture(self, code: str) -> dict[str, Any]:
        if not isinstance(code, str) or len(code.encode("utf-8")) > MAX_EVALUATION_BYTES:
            return {"status": "Steam UI unavailable", "error": "Evaluation script is invalid or too large"}
        if self._unloading:
            return self.unavailable()
        try:
            result = await asyncio.to_thread(self._eval_in_big_picture_sync, code)
            return self.unavailable() if self._unloading else result
        except (OSError, EOFError, TimeoutError, ConnectionError, urllib.error.URLError) as error:
            if self._unloading:
                return self.unavailable()
            now = time.monotonic()
            if now - self._last_debugger_warning >= 30:
                self._last_debugger_warning = now
                if self._logger:
                    self._logger.warning("Steam Big Picture evaluator temporarily unavailable: %s", error)
            return {"status": "Steam UI unavailable", "error": str(error), "retryable": True}
        except Exception as error:
            if self._unloading:
                return self.unavailable()
            if self._logger:
                self._logger.exception("Failed to evaluate code in Steam Big Picture")
            return {"status": "Steam UI unavailable", "error": str(error)}

    def _eval_in_big_picture_sync(self, code: str) -> dict[str, Any]:
        if self._unloading:
            return self.unavailable()
        target = self._find_big_picture_target()
        if self._unloading:
            return self.unavailable()
        if not target:
            return {"status": "Steam UI unavailable", "error": "No Big Picture DevTools target found"}
        payload = {
            "id": 1,
            "method": "Runtime.evaluate",
            "params": {"expression": code, "returnByValue": True, "awaitPromise": False},
        }
        response = self._websocket_json_request(target["webSocketDebuggerUrl"], payload)
        if self._unloading:
            return self.unavailable()
        evaluation = response.get("result", {})
        if "exceptionDetails" in evaluation:
            exception = evaluation["exceptionDetails"]
            error_object = exception.get("exception") or {}
            return {
                "status": "Steam script error",
                "error": error_object.get("description") or error_object.get("value")
                or exception.get("text") or "Runtime.evaluate exception",
            }
        value = evaluation.get("result", {}).get("value")
        if isinstance(value, dict):
            return {**value, "tab": target.get("title")}
        return {
            "status": "Unexpected Steam response",
            "error": "Runtime.evaluate returned no object value",
            "tab": target.get("title"),
        }

    def _find_big_picture_target(self) -> dict[str, Any] | None:
        connection = http.client.HTTPConnection(
            "127.0.0.1", 8080, timeout=DISCOVERY_TIMEOUT_SECONDS
        )
        response_reference: list[Any | None] = [None, None]
        with self._active_cdp_lock:
            if self._unloading:
                connection.close()
                raise ConnectionError("Plugin is unloading")
            self._active_discovery_connections[connection] = response_reference
        deadline = time.monotonic() + DISCOVERY_TIMEOUT_SECONDS
        deadline_interrupt = threading.Timer(
            DISCOVERY_TIMEOUT_SECONDS,
            self._interrupt_discovery_connection,
            args=(connection, response_reference),
        )
        deadline_interrupt.daemon = True
        deadline_interrupt.start()
        try:
            connection.request("GET", "/json")
            response_reference[1] = connection.sock
            response = connection.getresponse()
            # HTTPConnection transfers ownership of the socket to HTTPResponse
            # for close-delimited bodies and clears connection.sock. Keep both
            # references so a deadline can interrupt even during that transfer.
            response_reference[0] = response
            body = self._read_discovery_body(response, connection, deadline)
            targets = json.loads(body.decode("utf-8"))
        finally:
            deadline_interrupt.cancel()
            with self._active_cdp_lock:
                self._active_discovery_connections.pop(connection, None)
            response = response_reference[0]
            try:
                if response is not None and callable(getattr(response, "close", None)):
                    response.close()
            finally:
                connection.close()

        def score(target: dict[str, Any]) -> int:
            title = (target.get("title") or "").lower()
            url = (target.get("url") or "").lower()
            if "sharedjscontext" in title or any(
                text in title for text in ("quickaccess", "mainmenu", "notification")
            ):
                return -100
            if "big picture" in title or "modalit" in title:
                return 100
            if "browsertype=3" in url and "browserviewpopup" not in url:
                return 60
            return 0

        candidates = [
            target for target in targets
            if target.get("type") == "page" and target.get("webSocketDebuggerUrl")
        ]
        candidates.sort(key=score, reverse=True)
        return candidates[0] if candidates and score(candidates[0]) > 0 else None

    @staticmethod
    def _read_discovery_body(response: Any, connection: http.client.HTTPConnection,
                             deadline: float) -> bytes:
        length_header = response.getheader("Content-Length")
        if length_header is not None:
            try:
                if int(length_header) > MAX_DISCOVERY_BYTES:
                    raise ValueError("DevTools discovery response is too large")
            except ValueError as error:
                if "too large" in str(error):
                    raise
                raise ValueError("Invalid DevTools discovery length") from error
        data = bytearray()
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError("DevTools discovery timed out")
            transport = BigPictureEvaluator._response_transport(response) or connection.sock
            if transport is not None:
                transport.settimeout(remaining)
            chunk = response.read(min(8192, MAX_DISCOVERY_BYTES + 1 - len(data)))
            if not chunk:
                return bytes(data)
            data.extend(chunk)
            if len(data) > MAX_DISCOVERY_BYTES:
                raise ValueError("DevTools discovery response is too large")

    @staticmethod
    def _response_transport(response: Any) -> socket.socket | None:
        file_pointer = getattr(response, "fp", None)
        raw = getattr(file_pointer, "raw", None)
        transport = getattr(raw, "_sock", None) or getattr(file_pointer, "_sock", None)
        return transport if isinstance(transport, socket.socket) else None

    @staticmethod
    def _interrupt_discovery_connection(
        connection: http.client.HTTPConnection,
        response_reference: list[Any | None] | None = None,
    ) -> None:
        response = response_reference[0] if response_reference else None
        sock = BigPictureEvaluator._response_transport(response) if response is not None else None
        if sock is None and response_reference and len(response_reference) > 1 and isinstance(
            response_reference[1], socket.socket
        ):
            sock = response_reference[1]
        sock = sock or connection.sock
        if sock is not None:
            try:
                sock.shutdown(socket.SHUT_RDWR)
            except OSError:
                pass
        try:
            connection.close()
        except OSError:
            pass
        try:
            sock.close() if sock is not None else None
        except OSError:
            pass

    def _websocket_json_request(self, ws_url: str, payload: dict[str, Any]) -> dict[str, Any]:
        parsed = urlparse(ws_url)
        host = parsed.hostname or "127.0.0.1"
        if parsed.scheme not in {"ws", "wss"} or host not in {"127.0.0.1", "localhost", "::1"}:
            raise ConnectionError("DevTools WebSocket target is not local")
        port = parsed.port or 80
        path = parsed.path + (f"?{parsed.query}" if parsed.query else "")
        sock = socket.socket(socket.AF_INET6 if ":" in host else socket.AF_INET, socket.SOCK_STREAM)
        with self._active_cdp_lock:
            if self._unloading:
                sock.close()
                raise ConnectionError("Plugin is unloading")
            self._active_cdp_sockets.add(sock)
        try:
            sock.settimeout(5)
            sock.connect((host, port))
            sock.settimeout(5)
            self._websocket_handshake(sock, host, port, path)
            sock.settimeout(8)
            self._websocket_send_text(sock, json.dumps(payload))
            deadline = time.monotonic() + 8
            while True:
                response = json.loads(self._websocket_recv_text(sock, deadline))
                if response.get("id") == payload["id"]:
                    return response
        finally:
            with self._active_cdp_lock:
                self._active_cdp_sockets.discard(sock)
            sock.close()

    def _websocket_handshake(self, sock: socket.socket, host: str, port: int, path: str) -> None:
        key = base64.b64encode(os.urandom(16)).decode("ascii")
        request = (
            f"GET {path} HTTP/1.1\r\n"
            f"Host: {host}:{port}\r\n"
            "Upgrade: websocket\r\n"
            "Connection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {key}\r\n"
            "Sec-WebSocket-Version: 13\r\n"
            "\r\n"
        )
        sock.sendall(request.encode("ascii"))
        response = self._recv_until(
            sock,
            b"\r\n\r\n",
            time.monotonic() + UPGRADE_TIMEOUT_SECONDS,
            max_bytes=MAX_UPGRADE_HEADER_BYTES,
        )
        if b" 101 " not in response.split(b"\r\n", 1)[0]:
            raise ConnectionError("DevTools WebSocket handshake failed")

    def _websocket_send_text(self, sock: socket.socket, text: str) -> None:
        payload = text.encode("utf-8")
        header = bytearray([0x81])
        length = len(payload)
        if length < 126:
            header.append(0x80 | length)
        elif length < 65536:
            header.append(0x80 | 126)
            header.extend(struct.pack("!H", length))
        else:
            header.append(0x80 | 127)
            header.extend(struct.pack("!Q", length))
        mask = os.urandom(4)
        masked = bytes(byte ^ mask[index % 4] for index, byte in enumerate(payload))
        sock.sendall(bytes(header) + mask + masked)

    def _websocket_recv_text(self, sock: socket.socket, deadline: float) -> str:
        chunks: list[bytes] = []
        while True:
            first, second = self._recv_exact(sock, 2, deadline)
            opcode = first & 0x0F
            masked = bool(second & 0x80)
            length = second & 0x7F
            if length == 126:
                length = struct.unpack("!H", self._recv_exact(sock, 2, deadline))[0]
            elif length == 127:
                length = struct.unpack("!Q", self._recv_exact(sock, 8, deadline))[0]
            if length > MAX_RESPONSE_FRAME_BYTES:
                raise ValueError("DevTools response frame is too large")
            mask = self._recv_exact(sock, 4, deadline) if masked else b""
            payload = self._recv_exact(sock, length, deadline) if length else b""
            if masked:
                payload = bytes(byte ^ mask[index % 4] for index, byte in enumerate(payload))
            if opcode == 0x8:
                raise ConnectionError("DevTools WebSocket closed")
            if opcode == 0x9:
                continue
            if opcode in (0x1, 0x0):
                chunks.append(payload)
                if sum(map(len, chunks)) > MAX_RESPONSE_FRAME_BYTES:
                    raise ValueError("DevTools response is too large")
                if first & 0x80:
                    return b"".join(chunks).decode("utf-8")

    @staticmethod
    def _recv_exact(sock: socket.socket, length: int, deadline: float | None = None) -> bytes:
        data = bytearray()
        while len(data) < length:
            if deadline is not None:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise TimeoutError("DevTools WebSocket read timed out")
                sock.settimeout(remaining)
            chunk = sock.recv(length - len(data))
            if not chunk:
                raise ConnectionError("Unexpected socket close")
            data.extend(chunk)
        return bytes(data)

    @classmethod
    def _recv_until(cls, sock: socket.socket, marker: bytes, deadline: float,
                    max_bytes: int = MAX_UPGRADE_HEADER_BYTES) -> bytes:
        data = bytearray()
        while marker not in data:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError("DevTools WebSocket upgrade header timed out")
            sock.settimeout(remaining)
            chunk = sock.recv(min(4096, max_bytes + 1 - len(data)))
            if not chunk:
                raise ConnectionError("Unexpected socket close")
            data.extend(chunk)
            if len(data) > max_bytes:
                raise ValueError("DevTools WebSocket upgrade header is too large")
        return bytes(data)
