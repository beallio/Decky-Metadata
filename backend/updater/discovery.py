from __future__ import annotations

from typing import Any, List, Literal, Mapping

from backend.updater.client import ReleaseClient
from backend.updater.models import (
    ParsedPluginVersion,
    UpdateCandidate,
    parse_plugin_version,
    parse_release_manifest,
    as_string_key_mapping,
)

from dataclasses import dataclass


@dataclass(frozen=True)
class PrevalidatedRelease:
    record: Mapping[str, object]  # the original release JSON mapping
    tag_name: str
    version: ParsedPluginVersion  # parsed from tag_name[1:]
    published_at: str  # str(record.get("published_at", ""))
    prerelease: bool  # bool(record.get("prerelease", False))
    manifest_asset: Mapping[str, object]
    zip_asset: Mapping[str, object]


def prevalidate_release_candidate(release: object) -> PrevalidatedRelease | None:
    release_record = as_string_key_mapping(release)
    if release_record is None:
        return None
    if release_record.get("draft", False):
        return None

    tag_name = str(release_record.get("tag_name", ""))
    if not tag_name or not tag_name.startswith("v"):
        return None

    version_part = tag_name[1:]
    parsed_version = parse_plugin_version(version_part)
    if parsed_version is None:
        return None

    expected_manifest_name = f"Decky-Metadata-{tag_name}.manifest.json"

    assets = release_record.get("assets", [])
    if not isinstance(assets, list):
        return None
    manifest_assets = []
    zip_assets = []
    for a in assets:
        a_dict = as_string_key_mapping(a)
        if a_dict is not None:
            name = str(a_dict.get("name", ""))
            if name == expected_manifest_name:
                manifest_assets.append(a_dict)
            elif name.endswith(".zip"):
                zip_assets.append(a_dict)
    if len(manifest_assets) != 1:
        return None
    if len(zip_assets) != 1:
        return None

    manifest_asset = manifest_assets[0]
    zip_asset = zip_assets[0]

    published_at = str(release_record.get("published_at", ""))
    prerelease = bool(release_record.get("prerelease", False))

    return PrevalidatedRelease(
        record=release_record,
        tag_name=tag_name,
        version=parsed_version,
        published_at=published_at,
        prerelease=prerelease,
        manifest_asset=manifest_asset,
        zip_asset=zip_asset,
    )


def validate_prevalidated_candidate(
    pre: PrevalidatedRelease, client: ReleaseClient
) -> UpdateCandidate | None:
    resp = client.get_manifest(str(pre.manifest_asset.get("browser_download_url", "")))
    if resp.status != 200:
        return None

    manifest = parse_release_manifest(resp.body)
    if manifest is None:
        return None

    if manifest.plugin_name != "Decky-Metadata":
        return None
    if manifest.package_name != "decky-metadata":
        return None
    if manifest.tag != pre.tag_name:
        return None
    if "v" + manifest.version != pre.tag_name:
        return None

    if manifest.channel == "stable" and pre.prerelease:
        return None
    if manifest.channel == "dev" and not pre.prerelease:
        return None

    if str(pre.zip_asset.get("name", "")) != manifest.asset_name:
        return None

    channel: Literal["stable", "development"] = (
        "stable" if manifest.channel == "stable" else "development"
    )
    return UpdateCandidate(
        version=manifest.version,
        tag=manifest.tag,
        channel=channel,
        artifact_url=str(pre.zip_asset.get("browser_download_url", "")),
        sha256=manifest.sha256,
        release_url=str(pre.record.get("html_url", "")),
        published_at=pre.published_at,
        action="update",
    )


def validate_release_candidate(release: object, client: ReleaseClient) -> UpdateCandidate | None:
    pre = prevalidate_release_candidate(release)
    if pre is None:
        return None
    return validate_prevalidated_candidate(pre, client)


def select_candidate(
    candidates: List[UpdateCandidate],
    installed_version_str: str,
    preferred_channel: Literal["stable", "development"],
) -> UpdateCandidate | None:
    installed_version = parse_plugin_version(installed_version_str)
    if not installed_version:
        return None

    eligible: List[UpdateCandidate] = []
    for c in candidates:
        if preferred_channel == "stable" and c.channel != "stable":
            continue
        c_ver = parse_plugin_version(c.version)
        if not c_ver:
            continue
        eligible.append(c)

    if not eligible:
        return None

    def get_sort_key(c: UpdateCandidate) -> tuple[int, int, int, bool, str]:
        c_ver = parse_plugin_version(c.version)
        assert c_ver is not None
        return (c_ver.major, c_ver.minor, c_ver.patch, not c_ver.is_dev, c.published_at)

    eligible.sort(key=get_sort_key)
    best_candidate = eligible[-1]
    best_ver = parse_plugin_version(best_candidate.version)
    assert best_ver is not None

    is_upgrade = False
    action: Literal["update", "move_to_stable", "downgrade_to_stable"] = "update"

    best_base = (best_ver.major, best_ver.minor, best_ver.patch)
    installed_base = (installed_version.major, installed_version.minor, installed_version.patch)

    if preferred_channel == "stable" and installed_version.is_dev:
        is_upgrade = True
        if best_base == installed_base:
            action = "move_to_stable"
        elif best_base < installed_base:
            action = "downgrade_to_stable"
        else:
            action = "update"
    else:
        if best_ver > installed_version:
            is_upgrade = True
            if not best_ver.is_dev and installed_version.is_dev and best_base == installed_base:
                action = "move_to_stable"
        elif best_ver == installed_version:
            if best_ver.is_dev and installed_version.is_dev:
                if best_candidate.version != installed_version_str:
                    is_upgrade = True
                    action = "update"
            elif not best_ver.is_dev and installed_version.is_dev:
                is_upgrade = True
                action = "move_to_stable"

    if is_upgrade:
        return UpdateCandidate(
            version=best_candidate.version,
            tag=best_candidate.tag,
            channel=best_candidate.channel,
            artifact_url=best_candidate.artifact_url,
            sha256=best_candidate.sha256,
            release_url=best_candidate.release_url,
            published_at=best_candidate.published_at,
            action=action,
        )

    return None


def format_candidate_log(candidate: Any) -> str:
    if not candidate:
        return "none"
    if not isinstance(candidate, dict):
        try:
            version = getattr(candidate, "version", "unknown")
            tag = getattr(candidate, "tag", "unknown")
            channel = getattr(candidate, "channel", "unknown")
            sha256 = getattr(candidate, "sha256", None)
            sha_prefix = sha256[:8] if (isinstance(sha256, str) and len(sha256) >= 8) else "unknown"
            return f"version={version}, tag={tag}, channel={channel}, sha256_prefix={sha_prefix}"
        # Intentionally broad
        except Exception:
            return "malformed candidate"
    version = candidate.get("version", "unknown")
    tag = candidate.get("tag", "unknown")
    channel = candidate.get("channel", "unknown")
    sha256 = candidate.get("sha256")
    sha_prefix = sha256[:8] if (isinstance(sha256, str) and len(sha256) >= 8) else "unknown"
    return f"version={version}, tag={tag}, channel={channel}, sha256_prefix={sha_prefix}"
