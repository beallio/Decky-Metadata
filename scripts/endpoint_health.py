"""Bounded HTTP transport and result format for external endpoint health checks."""
from __future__ import annotations

import json
import os
import re
import subprocess
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

USER_AGENT = "DeckyMetadata/0.1 (+Decky Loader)"
MAX_RESPONSE_BYTES = 32 * 1024 * 1024


class ContractError(RuntimeError):
    """An upstream response no longer satisfies the plugin's contract."""


def require(condition: Any, message: str) -> None:
    if not condition:
        raise ContractError(message)


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def redact(value: str) -> str:
    """Remove credentials from diagnostics; never include request headers or bodies."""
    value = str(value)
    for name, secret in os.environ.items():
        if re.search(r"TOKEN|PASSWORD|SECRET|API_KEY", name, re.I) and len(secret) >= 6:
            value = value.replace(secret, "[REDACTED]")
    value = re.sub(r"(?i)\bBearer\s+[^\s\"'<>]+", "Bearer [REDACTED]", value)
    value = re.sub(
        r"(?i)((?:authorization|x-algolia-api-key|api[_-]?key|access[_-]?token|password|secret)[\"']?\s*[:=]\s*[\"']?)[^\s\"'&,}<>]+",
        r"\1[REDACTED]", value,
    )
    return value[:2000]


def safe_url(url: str) -> str:
    parsed = urllib.parse.urlsplit(url)
    host = parsed.hostname or ""
    if parsed.port:
        host += f":{parsed.port}"
    query = urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)
    query = [(key, "[REDACTED]" if re.search(r"token|key|secret|password|signature|credential", key, re.I) else value)
             for key, value in query]
    return redact(urllib.parse.urlunsplit((parsed.scheme, host, parsed.path, urllib.parse.urlencode(query), "")))


@dataclass(frozen=True)
class Probe:
    id: str
    name: str
    fixture: str
    check: Callable[["Client"], None]


@dataclass(frozen=True)
class Response:
    status: int
    content_type: str
    body: bytes


class _RestrictedRedirect(urllib.request.HTTPRedirectHandler):
    def __init__(self, allowed: Callable[[str], bool]):
        self.allowed = allowed

    def redirect_request(self, request, file_pointer, code, message, headers, new_url):
        require(self.allowed(new_url), "Response redirected to an unexpected origin")
        return super().redirect_request(request, file_pointer, code, message, headers, new_url)


class Client:
    """One probe's transport; collect safe request/status evidence without response bodies."""
    def __init__(self, timeout: int = 15):
        self.timeout = timeout
        self.requests: list[dict[str, Any]] = []

    def record(self, method: str, url: str, status: int | None, content_type: str = "") -> None:
        self.requests.append({"method": method, "url": safe_url(url), "status": status,
                              "content_type": redact(content_type)})

    def fetch(self, url: str, *, method: str = "GET", body: Any = None,
              headers: dict[str, str] | None = None, max_bytes: int = 2 * 1024 * 1024,
              prefix: bool = False, allowed_url: Callable[[str], bool] | None = None,
              timeout: int | None = None) -> Response:
        require(0 < max_bytes <= MAX_RESPONSE_BYTES, "Invalid response size bound")
        origin = urllib.parse.urlsplit(url)
        require(origin.scheme == "https" and bool(origin.hostname) and not origin.username,
                "Endpoint must use an HTTPS URL without credentials")
        allowed = allowed_url or (lambda target: urllib.parse.urlsplit(target).scheme == "https" and
                                  urllib.parse.urlsplit(target).netloc == origin.netloc)
        request_headers = {"User-Agent": USER_AGENT, "Accept-Language": "en-US,en;q=0.9"}
        if body is not None:
            request_headers["Content-Type"] = "application/json"
        request_headers.update(headers or {})
        data = json.dumps(body).encode("utf-8") if body is not None else None
        request = urllib.request.Request(url, data=data, headers=request_headers, method=method)
        opener = urllib.request.build_opener(_RestrictedRedirect(allowed))
        try:
            with opener.open(request, timeout=timeout or self.timeout) as response:
                status = response.status
                content_type = str(response.headers.get("Content-Type") or "").split(";", 1)[0].lower()
                self.record(method, url, status, content_type)
                require(status in ((200, 206) if prefix else (200,)), "Unexpected successful HTTP status")
                # Video checks need only the opening bytes, not the whole file.
                if not prefix:
                    length = response.headers.get("Content-Length")
                    require(length is None or (length.isdecimal() and int(length) <= max_bytes),
                            "Response Content-Length exceeds the size bound")
                payload = response.read(max_bytes if prefix else max_bytes + 1)
                require(len(payload) <= max_bytes, "Response exceeds the size bound")
                return Response(status, content_type, payload)
        except urllib.error.HTTPError as error:
            self.record(method, url, error.code)
            raise ContractError(f"HTTP {error.code}") from error
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            # Exceptions can contain credentials or remote response text. Report the class only.
            self.record(method, url, None)
            raise ContractError(f"Request failed: {type(error).__name__}") from error

    def json(self, url: str, **kwargs: Any) -> Any:
        response = self.fetch(url, **kwargs)
        try:
            return json.loads(response.body)
        except (ValueError, UnicodeError) as error:
            raise ContractError("Response is not valid JSON") from error

    def text(self, url: str, **kwargs: Any) -> str:
        return self.fetch(url, **kwargs).body.decode("utf-8", errors="replace")



class DiagnosticsError(ContractError):
    def __init__(self, error_type: str, message: str):
        super().__init__(message)
        self.error_type = error_type


def diagnostics_binary() -> Path:
    target = os.environ.get("CARGO_TARGET_DIR")
    if target:
        root = Path(target).expanduser()
    else:
        temporary = Path(os.environ.get("TMPDIR") or "/var/tmp/omp-1000")
        root = temporary / "cargo-target" / "Decky-Metadata"
    return (root / "debug" / "backend-diagnostics").resolve()


def run_diagnostics(command: str, *arguments: str, input_text: str | None = None) -> subprocess.CompletedProcess[str]:
    binary = diagnostics_binary()
    try:
        if not binary.is_file() or not os.access(binary, os.X_OK):
            raise DiagnosticsError("MissingDiagnosticsBinary", "backend-diagnostics is not available; build it explicitly first")
        result = subprocess.run(
            [str(binary), command, *arguments],
            input=input_text,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=900,
            check=False,
        )
    except DiagnosticsError:
        raise
    except subprocess.TimeoutExpired as error:
        raise DiagnosticsError("TimeoutExpired", "backend-diagnostics timed out") from error
    except OSError as error:
        raise DiagnosticsError(type(error).__name__, "backend-diagnostics could not be started") from error
    if len(result.stdout.encode("utf-8")) > 4 * 1024 * 1024:
        raise DiagnosticsError("OutputLimitError", "backend-diagnostics output exceeded its limit")
    return result


def native_probe_results(probes: list[tuple[str, str, str]]) -> list[dict[str, Any]]:
    if not probes:
        return []
    expected = [probe[0] for probe in probes]
    arguments = [argument for probe_id in expected for argument in ("--only", probe_id)]

    def failed(error_type: str, message: str) -> list[dict[str, Any]]:
        return [
            {"id": probe_id, "name": name, "fixture": fixture, "ok": False, "requests": [],
             "error": {"type": error_type, "message": redact(message)}}
            for probe_id, name, fixture in probes
        ]

    try:
        process = run_diagnostics("endpoint-health", *arguments)
    except DiagnosticsError as error:
        return failed(error.error_type, str(error))
    try:
        output = json.loads(process.stdout)
    except (ValueError, UnicodeError):
        return failed("MalformedOutput", "backend-diagnostics returned malformed JSON")
    if not isinstance(output, list) or [row.get("id") if isinstance(row, dict) else None for row in output] != expected:
        return failed("MalformedOutput", "backend-diagnostics returned an invalid endpoint result list")

    results: list[dict[str, Any]] = []
    for row, (probe_id, name, fixture) in zip(output, probes):
        if (not isinstance(row.get("name"), str) or not isinstance(row.get("fixture"), str)
                or row["name"] != name or row["fixture"] != fixture
                or type(row.get("ok")) is not bool or not isinstance(row.get("requests"), list)):
            return failed("MalformedOutput", "backend-diagnostics returned an invalid endpoint result")
        error = row.get("error")
        if (row["ok"] and error is not None) or (
            not row["ok"] and (not isinstance(error, dict)
                               or not isinstance(error.get("type"), str)
                               or not isinstance(error.get("message"), str))
        ):
            return failed("MalformedOutput", "backend-diagnostics returned an invalid endpoint error")
        requests: list[dict[str, Any]] = []
        for request in row["requests"]:
            if (not isinstance(request, dict) or not isinstance(request.get("method"), str)
                    or not isinstance(request.get("url"), str)
                    or "status" not in request
                    or (request["status"] is not None and type(request["status"]) is not int)
                    or not isinstance(request.get("content_type"), str)):
                return failed("MalformedOutput", "backend-diagnostics returned invalid request evidence")
            try:
                url = safe_url(request["url"])
            except (ValueError, UnicodeError):
                return failed("MalformedOutput", "backend-diagnostics returned invalid request evidence")
            requests.append({
                "method": redact(request["method"]),
                "url": url,
                "status": request["status"],
                "content_type": redact(request["content_type"]),
            })
        results.append({
            "id": probe_id,
            "name": redact(row["name"]),
            "fixture": redact(row["fixture"]),
            "ok": row["ok"],
            "requests": requests,
            "error": None if error is None else {
                "type": redact(error["type"]),
                "message": redact(error["message"]),
            },
        })

    failed_probes = any(not result["ok"] for result in results)
    if process.returncode not in (0, 1) or (process.returncode == 0 and failed_probes) or (
        process.returncode == 1 and not failed_probes
    ):
        return failed("DiagnosticsExitError", "backend-diagnostics returned an inconsistent exit status")
    return results


def run_probe(probe: Probe) -> dict[str, Any]:
    client = Client()
    result: dict[str, Any] = {"id": probe.id, "name": probe.name, "fixture": probe.fixture,
                              "ok": False, "requests": client.requests, "error": None}
    # A broken service must not stop checks of the other services.
    try:
        probe.check(client)
        result["ok"] = True
    except Exception as error:
        result["error"] = {"type": type(error).__name__,
                           "message": redact(str(error)) if isinstance(error, ContractError)
                           else f"Probe raised {type(error).__name__}"}
    return result
