from __future__ import annotations

import datetime
from contextlib import AbstractContextManager
from typing import Any, Callable, Literal, Mapping, cast

from backend.updater.client import ReleaseClient
from backend.updater.models import (
    UpdateCandidate,
    as_string_key_mapping,
)
from backend.updater.rate_limit import parse_rate_limit_retry_after
from backend.updater.discovery import (
    PrevalidatedRelease,
    prevalidate_release_candidate,
    validate_prevalidated_candidate,
    validate_release_candidate,
    select_candidate,
    format_candidate_log,
)
from backend.updater.pending import (
    is_fresh_pending_install,
    pending_install_matches_loaded_version,
    effective_pending_install_version,
)

MAX_MANIFEST_FETCH_ATTEMPTS = 5


class PluginUpdater:
    def __init__(
        self,
        *,
        state_lock: AbstractContextManager[object],
        save_callback: Callable[[], None],
        log_callback: Callable[[str, str], None],
        release_client: ReleaseClient,
        version_resolver: Callable[[], str],
        now: Callable[[], datetime.datetime],
        monotonic: Callable[[], float],
    ) -> None:
        self._state_lock = state_lock
        self._save_callback = save_callback
        self._log = log_callback
        self._client = release_client
        self._resolve_version = version_resolver
        self._now = now
        self._monotonic = monotonic

        self._channel = "stable"
        self._automatic_checks = True
        self._cache: dict[str, Any] = {}
        self._rate_limited_until: datetime.datetime | None = None

    def load_state(
        self,
        settings: Mapping[str, object],
        cache: Mapping[str, object],
    ) -> None:
        channel = settings.get("update_channel")
        self._channel = str(channel) if channel in ("stable", "development") else "stable"

        auto = settings.get("automatic_update_checks")
        self._automatic_checks = bool(auto) if isinstance(auto, bool) else True

        self._adopt_cache(cache)

    def _adopt_cache(self, cache: Mapping[str, object]) -> None:
        c = cache.get("update_check_cache")
        if isinstance(c, dict):
            # Normalize cache fields
            self._cache = dict(c)
        else:
            self._cache = {}

        # Malformed pending install becomes absent
        pending = self._cache.get("pending_update_install")
        if pending is not None:
            if not isinstance(pending, dict) or "version" not in pending:
                self._cache.pop("pending_update_install", None)

        # Malformed timestamps
        for ts_key in ("last_checked_at", "installed_release_published_at"):
            ts_val = self._cache.get(ts_key)
            if ts_val is not None and not isinstance(ts_val, str):
                self._cache.pop(ts_key, None)

        # Invalid last_result
        if "last_result" in self._cache and not isinstance(self._cache["last_result"], dict):
            self._cache.pop("last_result", None)

    def settings_payload(self) -> dict[str, object]:
        return {
            "update_channel": self._channel,
            "automatic_update_checks": self._automatic_checks,
        }

    def cache_payload(self) -> dict[str, object]:
        return {
            "update_check_cache": self._cache,
        }

    def set_channel(self, channel: str) -> None:
        if channel not in ("stable", "development"):
            channel = "stable"
        self._channel = channel
        self._save_callback()
        self._log("info", f"Update channel set to {channel}")

    def set_automatic_checks(self, enabled: bool) -> None:
        self._automatic_checks = bool(enabled)
        self._save_callback()
        self._log("info", f"Automatic update checks {'enabled' if enabled else 'disabled'}")

    def get_context(self) -> dict[str, object]:
        with self._state_lock:
            rate_limited_until_str = None
            if self._rate_limited_until:
                if self._now() >= self._rate_limited_until:
                    self._rate_limited_until = None
                else:
                    rate_limited_until_str = self._rate_limited_until.isoformat()

            installed_version = self._resolve_version()
            pending_install = self._cache.get("pending_update_install")
            pending_version = effective_pending_install_version(pending_install, self._now)

            return {
                "update_channel": self._channel,
                "automatic_update_checks": self._automatic_checks,
                "installed_version": installed_version,
                "effective_installed_version": pending_version or installed_version,
                "last_checked_at": self._cache.get("last_checked_at"),
                "last_checked_channel": self._cache.get("last_checked_channel"),
                "last_available_tag": self._cache.get("last_available_tag"),
                "last_notified_tag": self._cache.get("last_notified_tag"),
                "installed_release_tag": self._cache.get("installed_release_tag"),
                "installed_release_published_at": self._cache.get("installed_release_published_at"),
                "pending_update_install": pending_install,
                "rate_limited_until": rate_limited_until_str,
            }

    def _clear_stale_cache(self) -> None:
        self._cache.pop("last_result", None)
        self._cache.pop("last_available_tag", None)
        self._cache.pop("last_checked_version", None)

    def check_for_update(
        self,
        current_version: str,
        force: bool = False,
    ) -> dict[str, object]:
        self._log("info", f"Update check started (version={current_version}, force={force})")
        t0 = self._monotonic()

        with self._state_lock:
            channel_snapshot = cast(
                Literal["stable", "development"], self._channel
            )
            if not force:
                pending_install = self._cache.get("pending_update_install")
                if pending_install:
                    effective_installed = effective_pending_install_version(
                        pending_install, self._now
                    )
                    if effective_installed and effective_installed == current_version:
                        elapsed_ms = round((self._monotonic() - t0) * 1000)
                        self._log(
                            "info",
                            f"Update check pending-install fast path: pending={pending_install.get('version')}, current={current_version}, effective={effective_installed}, channel={self._channel}, force={force}, elapsed_ms={elapsed_ms}",
                        )
                        return {
                            "status": "current",
                            "checked_at": self._now().isoformat(),
                            "channel": channel_snapshot,
                        }

            if self._rate_limited_until and self._now() < self._rate_limited_until:
                elapsed_ms = round((self._monotonic() - t0) * 1000)
                self._log(
                    "warning",
                    f"Update check blocked by rate-limit cooldown until {self._rate_limited_until.isoformat()}, elapsed_ms={elapsed_ms}",
                )
                return {
                    "status": "failed",
                    "checked_at": self._now().isoformat(),
                    "message": "Update check skipped due to rate-limit cooldown",
                    "retry_after": self._rate_limited_until.isoformat(),
                }

            if not force:
                last_checked_at_str = self._cache.get("last_checked_at")
                last_checked_channel = self._cache.get("last_checked_channel")
                last_checked_version = self._cache.get("last_checked_version")
                if isinstance(last_checked_at_str, str):
                    try:
                        last_checked_at = datetime.datetime.fromisoformat(last_checked_at_str)
                        if last_checked_at.tzinfo is None:
                            last_checked_at = last_checked_at.replace(tzinfo=datetime.timezone.utc)
                        if (
                            self._now() - last_checked_at < datetime.timedelta(hours=24)
                            and last_checked_channel == channel_snapshot
                            and last_checked_version == current_version
                        ):
                            last_result = self._cache.get("last_result")
                            if isinstance(last_result, dict):
                                elapsed_ms = round((self._monotonic() - t0) * 1000)
                                self._log(
                                    "info",
                                    f"Update check cache hit (within 24h, channel={last_checked_channel}, version={last_checked_version}), elapsed_ms={elapsed_ms}",
                                )
                                cached_result = dict(last_result)
                                cached_result.pop("checked_version", None)
                                return cached_result
                    except (ValueError, TypeError):
                        pass

        self._log("info", "Fetching GitHub releases")
        t0 = self._monotonic()
        resp = self._client.list_releases()
        elapsed_ms = round((self._monotonic() - t0) * 1000)
        self._log(
            "info", f"GitHub releases fetch response: status={resp.status}, elapsed_ms={elapsed_ms}"
        )

        checked_at = self._now().isoformat()

        if resp.status in (403, 429):
            retry_after_str = parse_rate_limit_retry_after(resp.headers, self._now())

            msg = "Rate limit exceeded"
            body_record = as_string_key_mapping(resp.body)
            if body_record is not None and "message" in body_record:
                msg = str(body_record["message"])

            self._log(
                "warning",
                f"GitHub releases fetch rate-limited (status={resp.status}, message={msg}), elapsed_ms={elapsed_ms}",
            )

            with self._state_lock:
                try:
                    self._rate_limited_until = datetime.datetime.fromisoformat(retry_after_str)
                # Intentionally broad
                except Exception:
                    pass
                # Cooldown handling: do not overwrite successful result, only transient cooldown

            return {
                "status": "failed",
                "checked_at": checked_at,
                "message": msg,
                "retry_after": retry_after_str,
            }

        if resp.status != 200 or not isinstance(resp.body, list):
            msg = "Failed to check for updates"
            body_record = as_string_key_mapping(resp.body)
            raw_msg = None
            if body_record is not None:
                if "message" in body_record:
                    raw_msg = str(body_record["message"])
                elif "error" in body_record:
                    raw_msg = str(body_record["error"])
            if raw_msg:
                msg = raw_msg
            # GitHub returns 404 (not 403) for repositories an unauthenticated
            # caller cannot see, so a private/missing repo surfaces as a bare
            # "Not Found". The updater is unauthenticated by design (end users
            # have no token, and Decky downloads release assets unauthenticated),
            # so make the cause actionable instead of cryptic.
            if resp.status == 404:
                msg = "Releases are not accessible — the repository may be private or missing."
            self._log(
                "error",
                f"GitHub releases fetch failed (status={resp.status}, message={raw_msg or msg}), elapsed_ms={elapsed_ms}",
            )
            return {
                "status": "failed",
                "checked_at": checked_at,
                "message": msg,
            }

        prevalidated: list[PrevalidatedRelease] = []
        t1 = self._monotonic()
        for r in resp.body:
            if not isinstance(r, dict):
                continue
            pre = prevalidate_release_candidate(r)
            if pre is None:
                continue
            if channel_snapshot == "stable" and pre.prerelease:
                continue
            prevalidated.append(pre)

        prevalidated.sort(
            key=lambda p: (
                p.version.major,
                p.version.minor,
                p.version.patch,
                not p.version.is_dev,
                p.published_at,
            ),
            reverse=True,
        )

        candidates: list[UpdateCandidate] = []
        attempts = 0
        for pre in prevalidated:
            if attempts >= MAX_MANIFEST_FETCH_ATTEMPTS:
                self._log(
                    "warning",
                    f"Update check stopped after {MAX_MANIFEST_FETCH_ATTEMPTS} manifest validation attempts without a valid candidate",
                )
                break
            attempts += 1
            c = validate_prevalidated_candidate(pre, self._client)
            if c:
                candidates.append(c)
                break

        parse_elapsed_ms = round((self._monotonic() - t1) * 1000)

        self._log(
            "info",
            f"Prevalidated {len(prevalidated)} releases, manifest attempts={attempts}, valid={len(candidates)}, elapsed_ms={parse_elapsed_ms}",
        )

        t2 = self._monotonic()
        candidate = select_candidate(candidates, current_version, channel_snapshot)
        select_elapsed_ms = round((self._monotonic() - t2) * 1000)

        result: dict[str, Any]
        if candidate:
            self._log(
                "info",
                f"Selected update candidate: {format_candidate_log(candidate)}, elapsed_ms={select_elapsed_ms}",
            )
            result = {
                "status": "available",
                "checked_at": checked_at,
                "checked_version": current_version,
                "channel": channel_snapshot,
                "candidate": {
                    "version": candidate.version,
                    "tag": candidate.tag,
                    "channel": candidate.channel,
                    "artifact_url": candidate.artifact_url,
                    "sha256": candidate.sha256,
                    "release_url": candidate.release_url,
                    "published_at": candidate.published_at,
                    "action": candidate.action,
                },
            }
        else:
            self._log(
                "info",
                f"No upgrade candidate found (already up to date), elapsed_ms={select_elapsed_ms}",
            )
            result = {
                "status": "current",
                "checked_at": checked_at,
                "checked_version": current_version,
                "channel": channel_snapshot,
            }

        with self._state_lock:
            if self._channel == channel_snapshot:
                self._cache["last_checked_at"] = result["checked_at"]
                self._cache["last_checked_channel"] = channel_snapshot
                self._cache["last_checked_version"] = current_version
                self._cache["last_result"] = result
                if candidate:
                    self._cache["last_available_tag"] = candidate.tag
                self._save_callback()
            else:
                self._log(
                    "info",
                    "Update channel changed during check; stale result was not cached",
                )

        # Remove "checked_version" from returned payload to match previous API, it was only for caching.
        ret = dict(result)
        ret.pop("checked_version", None)
        return ret

    def revalidate(
        self,
        candidate: Mapping[str, object],
    ) -> dict[str, object]:
        t0 = self._monotonic()
        self._log("info", f"Revalidation started for candidate: {format_candidate_log(candidate)}")

        with self._state_lock:
            if self._rate_limited_until:
                if self._now() < self._rate_limited_until:
                    elapsed_ms = round((self._monotonic() - t0) * 1000)
                    self._log(
                        "warning",
                        f"Revalidation blocked by rate-limit cooldown until {self._rate_limited_until.isoformat()}, elapsed_ms={elapsed_ms}",
                    )
                    return {
                        "status": "failed",
                        "checked_at": self._now().isoformat(),
                        "message": "Rate limit cooldown active",
                        "retry_after": self._rate_limited_until.isoformat(),
                    }
                else:
                    self._rate_limited_until = None
                    self._save_callback()

        tag = candidate.get("tag")
        if not tag or not isinstance(tag, str):
            self._log("error", "Revalidation failed: Candidate missing tag")
            return {
                "status": "failed",
                "checked_at": self._now().isoformat(),
                "message": "Candidate missing tag",
            }

        self._log("info", f"Fetching candidate release for tag {tag}")
        t1 = self._monotonic()
        resp = self._client.get_release(tag)
        fetch_elapsed_ms = round((self._monotonic() - t1) * 1000)
        self._log(
            "info",
            f"Candidate release fetch response: status={resp.status}, elapsed_ms={fetch_elapsed_ms}",
        )

        if resp.status in (403, 429):
            retry_after_str = parse_rate_limit_retry_after(resp.headers, self._now())

            with self._state_lock:
                try:
                    self._rate_limited_until = datetime.datetime.fromisoformat(retry_after_str)
                # Intentionally broad
                except Exception:
                    pass
                self._save_callback()

            msg = "Rate limit exceeded"
            body_record = as_string_key_mapping(resp.body)
            if body_record is not None and "message" in body_record:
                msg = str(body_record["message"])

            self._log(
                "warning",
                f"Revalidation fetch rate-limited (status={resp.status}, message={msg}), elapsed_ms={fetch_elapsed_ms}",
            )

            return {
                "status": "failed",
                "checked_at": self._now().isoformat(),
                "message": msg,
                "retry_after": retry_after_str,
            }

        if resp.status != 200 or not isinstance(resp.body, dict):
            msg = f"Failed to fetch release for tag {tag}: {resp.status}"
            self._log("error", f"Revalidation check failed: {msg}, elapsed_ms={fetch_elapsed_ms}")
            return {
                "status": "failed",
                "checked_at": self._now().isoformat(),
                "message": msg,
            }

        validated = validate_release_candidate(resp.body, self._client)
        if not validated:
            msg = "Release validation failed during revalidation"
            elapsed_ms = round((self._monotonic() - t0) * 1000)
            self._log("error", f"{msg}, elapsed_ms={elapsed_ms}")
            return {
                "status": "failed",
                "checked_at": self._now().isoformat(),
                "message": msg,
            }

        cand_sha = candidate.get("sha256")
        cand_sha_prefix = cand_sha[:8] if isinstance(cand_sha, str) else "none"
        val_sha_prefix = validated.sha256[:8] if isinstance(validated.sha256, str) else "none"

        if validated.sha256 != candidate.get("sha256"):
            msg = f"SHA-256 mismatch during revalidation: candidate={cand_sha_prefix}, fetched={val_sha_prefix}"
            elapsed_ms = round((self._monotonic() - t0) * 1000)
            self._log("error", f"{msg}, elapsed_ms={elapsed_ms}")
            return {
                "status": "failed",
                "checked_at": self._now().isoformat(),
                "message": "SHA-256 mismatch during revalidation",
            }

        if validated.artifact_url != candidate.get("artifact_url"):
            cand_url = candidate.get("artifact_url")
            cand_url_prefix = str(cand_url)[:32] if cand_url else "none"
            val_url_prefix = validated.artifact_url[:32] if validated.artifact_url else "none"
            msg = f"Artifact URL mismatch during revalidation: candidate_prefix={cand_url_prefix}, fetched_prefix={val_url_prefix}"
            elapsed_ms = round((self._monotonic() - t0) * 1000)
            self._log("error", f"{msg}, elapsed_ms={elapsed_ms}")
            return {
                "status": "failed",
                "checked_at": self._now().isoformat(),
                "message": "Artifact URL mismatch during revalidation",
            }

        if validated.version != candidate.get("version"):
            msg = f"Version mismatch during revalidation: candidate={candidate.get('version')}, fetched={validated.version}"
            elapsed_ms = round((self._monotonic() - t0) * 1000)
            self._log("error", f"{msg}, elapsed_ms={elapsed_ms}")
            return {
                "status": "failed",
                "checked_at": self._now().isoformat(),
                "message": "Version mismatch during revalidation",
            }

        elapsed_ms = round((self._monotonic() - t0) * 1000)
        self._log(
            "info",
            f"Revalidation success for version v{validated.version}, elapsed_ms={elapsed_ms}",
        )
        return {
            "version": validated.version,
            "tag": validated.tag,
            "channel": validated.channel,
            "artifact_url": validated.artifact_url,
            "sha256": validated.sha256,
            "release_url": validated.release_url,
            "published_at": validated.published_at,
            "action": candidate.get("action", "update"),
        }

    def record_install_requested(
        self,
        candidate: Mapping[str, object],
    ) -> dict[str, object]:
        with self._state_lock:
            trace_id = candidate.get("updateTraceId")
            self._cache["pending_update_install"] = {
                "version": candidate.get("version"),
                "tag": candidate.get("tag"),
                "channel": candidate.get("channel"),
                "published_at": candidate.get("published_at"),
                "requested_at": self._now().isoformat(),
                "update_trace_id": trace_id,
            }
            self._clear_stale_cache()
            self._save_callback()
            self._log(
                "info",
                f"Pending install saved: version={candidate.get('version')}, "
                f"tag={candidate.get('tag')}, channel={candidate.get('channel')}, "
                f"action={candidate.get('action')}, trace_id={trace_id}",
            )
            return self.get_context()

    def confirm_install_handoff(self, version: str) -> dict[str, object]:
        with self._state_lock:
            pending = self._cache.get("pending_update_install")
            if isinstance(pending, dict) and pending.get("version") == version:
                pending["handoff_confirmed_at"] = self._now().isoformat()
                self._clear_stale_cache()
                self._save_callback()
                self._log("info", f"Pending install handoff confirmed: version={version}")
            else:
                self._log(
                    "warning", f"Pending install handoff confirmation ignored: version={version}"
                )
            return self.get_context()

    def clear_pending_install(self, version: str | None = None) -> dict[str, object]:
        with self._state_lock:
            pending = self._cache.get("pending_update_install")
            pending_version = pending.get("version") if isinstance(pending, dict) else None
            if pending and (version is None or pending_version == version):
                self._cache.pop("pending_update_install", None)
                self._clear_stale_cache()
                self._save_callback()
                self._log("info", f"Pending install cleared: version={pending_version}")
            return self.get_context()

    def reconcile_pending_install(self, current_version: str) -> None:
        with self._state_lock:
            pending = self._cache.get("pending_update_install")
            if pending:
                pending_version = pending.get("version")
                pending_tag = pending.get("tag")
                if pending_version and pending_install_matches_loaded_version(
                    pending_version, current_version
                ):
                    self._cache["installed_release_tag"] = pending_tag
                    self._cache["installed_release_published_at"] = pending.get("published_at")
                    self._log(
                        "info",
                        f"Startup reconciliation: Pending update promoted (version={pending_version}, tag={pending_tag})",
                    )
                    self._cache.pop("pending_update_install", None)
                    self._clear_stale_cache()
                    self._save_callback()
                elif is_fresh_pending_install(pending, self._now):
                    self._log(
                        "info",
                        f"Startup reconciliation: Pending update retained during reload grace window "
                        f"(pending={pending_version}, loaded={current_version})",
                    )
                else:
                    self._log(
                        "warning",
                        f"Startup reconciliation: Pending update cleared due to version mismatch "
                        f"(pending={pending_version}, loaded={current_version})",
                    )
                    self._cache.pop("pending_update_install", None)
                    self._clear_stale_cache()
                    self._save_callback()
            else:
                self._log("info", "Startup reconciliation: No pending update found")

    def has_pending_install(self) -> bool:
        with self._state_lock:
            pending = self._cache.get("pending_update_install")
            return effective_pending_install_version(pending, self._now) is not None
