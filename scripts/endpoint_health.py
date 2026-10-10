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

    def mp4(self, url: str) -> None:
        from backend.providers import ign
        require(bool(ign._canonical_mp4_url(url)), "Trailer URL is not an allowed IGN MP4")
        response = self.fetch(url, headers={"Range": "bytes=0-31", "Origin": "https://steamloopback.host"},
                              max_bytes=32, prefix=True, allowed_url=lambda target: bool(ign._canonical_mp4_url(target)))
        require(response.content_type == "video/mp4", "Trailer response Content-Type is not video/mp4")
        require(len(response.body) >= 12 and response.body[4:8] == b"ftyp", "Trailer response lacks an MP4 ftyp header")

    def github_bytes(self, path: str, *, accept: str = "application/vnd.github+json") -> bytes:
        """Use gh for GitHub service access, including live asset contract probes."""
        require(path.startswith("repos/beallio/Decky-Metadata/"), "Unexpected GitHub repository")
        url = "https://api.github.com/" + path
        result = subprocess.run(["gh", "api", "--include", "--header", f"Accept: {accept}",
                                 "--header", "X-GitHub-Api-Version: 2026-03-10", path],
                                capture_output=True, timeout=max(self.timeout, 60))
        if result.returncode:
            match = re.search(rb"HTTP (\d{3})", result.stderr)
            status = int(match.group(1)) if match else None
            self.record("GET", url, status)
            raise ContractError(f"GitHub request failed: HTTP {status}" if status else "GitHub CLI request failed")
        # Separate gh's HTTP headers from the downloaded data.
        header, separator, body = result.stdout.partition(b"\r\n\r\n")
        if not separator:
            header, separator, body = result.stdout.partition(b"\n\n")
        require(bool(separator), "GitHub CLI returned no HTTP headers")
        status_match = re.match(rb"HTTP/\S+ (\d{3})", header)
        require(status_match is not None, "GitHub CLI returned an invalid HTTP status line")
        status = int(status_match.group(1))
        content_match = re.search(rb"(?im)^content-type:\s*([^\r\n;]+)", header)
        content_type = content_match.group(1).decode("ascii", errors="replace") if content_match else ""
        self.record("GET", url, status, content_type)
        require(status == 200, "GitHub API did not return HTTP 200")
        require(len(body) <= MAX_RESPONSE_BYTES, "GitHub response exceeds the size bound")
        return body

    def github_json(self, path: str) -> Any:
        try:
            return json.loads(self.github_bytes(path))
        except (ValueError, UnicodeError) as error:
            raise ContractError("GitHub response is not valid JSON") from error


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
