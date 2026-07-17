from __future__ import annotations

import json
import ssl
import urllib.error
import urllib.request
from collections.abc import Callable
from typing import Protocol

from backend.updater.models import JsonResponse


def _get_ssl_context() -> ssl.SSLContext:
    from pathlib import Path

    context = ssl.create_default_context()
    standard_paths = [
        "/etc/ssl/certs/ca-certificates.crt",
        "/etc/pki/tls/certs/ca-bundle.crt",
        "/etc/ssl/ca-bundle.pem",
        "/etc/pki/tls/cacert.pem",
        "/etc/ssl/certs/ca-bundle.crt",
    ]
    for path_str in standard_paths:
        path = Path(path_str)
        if path.exists():
            try:
                context.load_verify_locations(cafile=str(path))
                break
            except Exception:
                pass
    return context


class ReleaseClient(Protocol):
    def list_releases(self) -> JsonResponse: ...
    def get_release(self, tag: str) -> JsonResponse: ...
    def get_manifest(self, url: str) -> JsonResponse: ...


class GitHubReleaseClient:
    def __init__(
        self,
        owner: str = "beallio",
        repo: str = "Decky-Metadata",
        *,
        version_resolver: Callable[[], str],
        ssl_context: ssl.SSLContext | None = None,
    ) -> None:
        self.owner = owner
        self.repo = repo
        try:
            version = version_resolver()
        except Exception:
            version = "0.1.0"
        self._user_agent = f"Decky-Metadata/{version}"
        self._ssl_context = ssl_context or _get_ssl_context()

    def _fetch_json(self, url: str, *, timeout_seconds: float = 15.0) -> JsonResponse:
        request = urllib.request.Request(
            url,
            headers={
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2026-03-10",
                "User-Agent": self._user_agent,
            },
        )
        try:
            with urllib.request.urlopen(
                request, timeout=timeout_seconds, context=self._ssl_context
            ) as response:
                headers = {key.lower(): value for key, value in response.headers.items()}
                body = json.loads(response.read().decode("utf-8"))
                return JsonResponse(status=response.status, headers=headers, body=body)
        except urllib.error.HTTPError as error:
            headers = {key.lower(): value for key, value in error.headers.items()}
            try:
                body = json.loads(error.read().decode("utf-8"))
            except Exception:
                body = {}
            return JsonResponse(status=error.code, headers=headers, body=body)
        except Exception as error:
            return JsonResponse(status=500, headers={}, body={"error": str(error)})

    def list_releases(self) -> JsonResponse:
        return self._fetch_json(
            f"https://api.github.com/repos/{self.owner}/{self.repo}/releases"
        )

    def get_release(self, tag: str) -> JsonResponse:
        return self._fetch_json(
            f"https://api.github.com/repos/{self.owner}/{self.repo}/releases/tags/{tag}"
        )

    def get_manifest(self, url: str) -> JsonResponse:
        return self._fetch_json(url)
