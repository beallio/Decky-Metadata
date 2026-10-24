# SPDX-License-Identifier: 0BSD
"""Runs a native plugin backend on the upstream Python Decky Loader.

Copy this file next to plugin.json as main.py, and set "api_version": 1 and
"backend" in plugin.json. The Rust fork of Decky Loader starts the backend
itself and ignores this file. The upstream loader imports this file; it starts
the same backend and relays frontend calls and events over the native worker
protocol (newline-delimited JSON on DECKY_PLUGIN_SOCKET).
"""

import asyncio
import ctypes
import itertools
import json
import os
import shutil
import signal
import subprocess
import sys
import tempfile
import time

import decky

# Upstream sends SIGKILL to the worker 5 s after it asks it to stop; unload and
# uninstall must both finish before that.
STOP_SECONDS = 4.5
PR_SET_PDEATHSIG = 1
_prctl = ctypes.CDLL(None, use_errno=True).prctl
_malloc_trim = getattr(ctypes.CDLL(None), "malloc_trim", None)  # glibc only
TRIM_LINE_BYTES = 1024 * 1024
TRIM_DELAY_SECONDS = 1.0


def _park_at_socket_eof():
    # Upstream's worker reads its loader socket in a loop that never yields at
    # EOF. When the loader closes the socket before the worker handles SIGTERM,
    # the worker spins until SIGKILL and _unload/_uninstall never run
    # (SteamDeckHomebrew/decky-loader#975). Wait forever at EOF instead.
    # shortcut: patches an upstream internal; drop once upstream ships #972.
    module = sys.modules.get("decky_loader.localplatform.localsocket")
    socket = getattr(module, "UnixSocket", None)
    read = getattr(socket, "_read_single_line", None)
    if read is None or getattr(read, "parks_at_eof", False):
        return

    async def read_or_park(self, reader):
        line = await read(self, reader)
        if not line and reader.at_eof():
            await asyncio.get_running_loop().create_future()
        return line

    read_or_park.parks_at_eof = True
    socket._read_single_line = read_or_park


_park_at_socket_eof()


def _backend_path():
    with open(os.path.join(decky.DECKY_PLUGIN_DIR, "plugin.json")) as file:
        backend = json.load(file).get("backend")
    if not isinstance(backend, str) or not backend or os.path.isabs(backend):
        raise RuntimeError("plugin.json has no relative backend path")
    plugin = os.path.realpath(decky.DECKY_PLUGIN_DIR)
    path = os.path.realpath(os.path.join(plugin, backend))
    if os.path.commonpath([plugin, path]) != plugin or not os.access(path, os.X_OK):
        raise RuntimeError(f"backend {backend!r} is not an executable inside the plugin")
    return path


def _start(env):
    worker = os.getpid()

    def die_with_worker():
        # Last resort if the worker is killed. SIGKILL, because the SDK handles
        # only the first SIGTERM and then waits for its hooks without a limit.
        if _prctl(PR_SET_PDEATHSIG, signal.SIGKILL) != 0 or os.getppid() != worker:
            os._exit(1)

    # Run a copy, so the packaged file is never busy: upstream can extract a
    # ZIP update over the live plugin folder, and Linux refuses to overwrite a
    # running executable (ETXTBSY). Replace the copy by rename for the same
    # reason, and keep it while the backend runs, because a script backend's
    # interpreter opens it by path after exec.
    source = _backend_path()
    os.makedirs(decky.DECKY_PLUGIN_RUNTIME_DIR, exist_ok=True)
    fd, staged = tempfile.mkstemp(dir=decky.DECKY_PLUGIN_RUNTIME_DIR)
    try:
        with os.fdopen(fd, "wb") as target, open(source, "rb") as packaged:
            shutil.copyfileobj(packaged, target)
        os.chmod(staged, 0o700)
        os.replace(staged, _copy_path())
    except BaseException:
        os.unlink(staged)
        raise
    return subprocess.Popen(
        [_copy_path()], env={**os.environ, **env}, preexec_fn=die_with_worker
    )


def _copy_path():
    return os.path.join(decky.DECKY_PLUGIN_RUNTIME_DIR, ".decky-native-backend")


def _wait(process, deadline):
    # Blocks the event loop on purpose. When upstream closes the plugin socket
    # during stop, its listener spins on EOF without yielding, so an _unload
    # that awaits never resumes and the worker is killed after 5 s.
    try:
        process.wait(max(0, deadline - time.monotonic()))
    except subprocess.TimeoutExpired:
        decky.logger.warning("Backend did not stop in time; killing it")
        process.kill()
        process.wait()


class Plugin:
    def __init__(self):
        self._process = None
        self._writer = None
        self._directory = None
        self._ready = asyncio.Event()
        self._error = None
        self._pending = {}
        self._ids = itertools.count()
        self._deadline = None
        self._trim = None

    def __getattr__(self, name):
        # Upstream finds frontend methods with getattr; hooks start with "_".
        if name.startswith("_"):
            raise AttributeError(name)

        async def call(*args):
            return await self._call(name, list(args))

        return call

    async def _call(self, method, args):
        await self._ready.wait()
        if self._error is not None:
            raise RuntimeError(self._error)
        key = str(next(self._ids))
        reply = asyncio.get_running_loop().create_future()
        self._pending[key] = reply
        message = {"type": 0, "method": method, "id": key, "args": args}
        try:
            self._writer.write(json.dumps(message, ensure_ascii=False).encode("utf-8") + b"\n")
            await self._writer.drain()
            return await reply
        finally:
            self._pending.pop(key, None)

    async def _main(self):
        try:
            self._directory = tempfile.mkdtemp(prefix="decky-native-")
            socket = os.path.join(self._directory, "backend.sock")
            self._process = _start({"DECKY_PLUGIN_SOCKET": socket})
            # The backend listens only after its migration hook.
            while True:
                if self._process.poll() is not None:
                    raise RuntimeError(f"backend exited with {self._process.returncode}")
                try:
                    # No line cap: a whole reply is one line, and plugin data can be large.
                    reader, self._writer = await asyncio.open_unix_connection(
                        socket, limit=sys.maxsize
                    )
                    break
                except (FileNotFoundError, ConnectionRefusedError):
                    await asyncio.sleep(0.05)
        except Exception as error:
            decky.logger.error(f"Could not start the native backend: {error}")
            self._fail(f"native backend did not start: {error}")
            return
        self._ready.set()
        await self._relay(reader)

    async def _relay(self, reader):
        try:
            while line := await reader.readline():
                # Handled in its own frame, so no reference to a reply outlives it
                # while the relay waits for the next line.
                large = len(line) > TRIM_LINE_BYTES
                await self._handle(line)
                line = None
                if large:
                    self._schedule_trim()
        except Exception as error:
            self._fail(f"native backend relay failed: {error}")
        finally:
            self._writer.close()
            if self._error is None:
                self._fail("native backend stopped")

    async def _handle(self, line):
        message = json.loads(line)
        del line
        if message.get("type") == 1:
            reply = self._pending.get(message.get("id"))
            if reply is None or reply.done():
                return
            if message.get("success"):
                reply.set_result(message.get("res"))
            else:
                reply.set_exception(RuntimeError(message.get("res")))
        elif message.get("type") == 2:
            await decky.emit(message["event"], *message.get("args", []))

    def _schedule_trim(self):
        # glibc keeps freed reply memory in its arenas; give it back once the
        # large replies stop, rather than after each one.
        if _malloc_trim is None:
            return
        if self._trim is not None:
            self._trim.cancel()
        self._trim = asyncio.get_running_loop().call_later(TRIM_DELAY_SECONDS, _malloc_trim, 0)

    def _fail(self, error):
        self._error = error
        self._ready.set()
        for reply in self._pending.values():
            if not reply.done():
                reply.set_exception(RuntimeError(error))

    async def _unload(self):
        self._deadline = time.monotonic() + STOP_SECONDS
        if self._process is not None:
            self._process.send_signal(signal.SIGTERM)
            _wait(self._process, self._deadline)
        if self._directory is not None:
            shutil.rmtree(self._directory, ignore_errors=True)

    async def _uninstall(self):
        # Upstream reports an uninstall only after _unload, so run the backend's
        # uninstall hook alone in a second process.
        deadline = self._deadline or time.monotonic() + STOP_SECONDS
        try:
            process = _start({"DECKY_PLUGIN_HOOK": "uninstall"})
        except Exception as error:
            decky.logger.error(f"Could not run the backend uninstall hook: {error}")
        else:
            _wait(process, deadline)
            if process.returncode:
                decky.logger.error(f"Backend uninstall hook exited with {process.returncode}")
        # Upstream leaves the runtime directory in place after an uninstall.
        try:
            os.unlink(_copy_path())
        except FileNotFoundError:
            pass
