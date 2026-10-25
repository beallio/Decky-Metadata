use crate::{
    matching::{py_string, py_truthy},
    updater::models::{
        ParsedPluginVersion, UpdateCandidate, parse_plugin_version, parse_release_manifest,
    },
};
use serde_json::Value;

#[derive(Clone, Debug)]
pub struct PrevalidatedRelease<'a> {
    pub record: &'a Value,
    pub tag_name: String,
    pub version: ParsedPluginVersion,
    pub published_at: String,
    pub prerelease: bool,
    pub manifest_asset: &'a Value,
    pub zip_asset: &'a Value,
}

fn string_field(record: &Value, field: &str, default: &str) -> String {
    record
        .get(field)
        .map(py_string)
        .unwrap_or_else(|| default.to_owned())
}

pub fn prevalidate_release_candidate(release: &Value) -> Option<PrevalidatedRelease<'_>> {
    let release_record = release.as_object()?;
    if release_record.get("draft").is_some_and(py_truthy) {
        return None;
    }
    let tag_name = string_field(release, "tag_name", "");
    let version = parse_plugin_version(tag_name.strip_prefix('v')?)?;
    let expected_manifest_name = format!("Decky-Metadata-{tag_name}.manifest.json");
    let assets = release_record.get("assets").unwrap_or(&Value::Null);
    let assets = assets.as_array()?;
    let mut manifest_asset = None;
    let mut zip_asset = None;
    let mut manifest_count = 0;
    let mut zip_count = 0;
    for asset in assets {
        if asset.as_object().is_none() {
            continue;
        }
        let name = string_field(asset, "name", "");
        if name == expected_manifest_name {
            manifest_count += 1;
            manifest_asset = Some(asset);
        } else if name.ends_with(".zip") {
            zip_count += 1;
            zip_asset = Some(asset);
        }
    }
    if manifest_count != 1 || zip_count != 1 {
        return None;
    }
    Some(PrevalidatedRelease {
        record: release,
        tag_name,
        version,
        published_at: string_field(release, "published_at", ""),
        prerelease: release_record.get("prerelease").is_some_and(py_truthy),
        manifest_asset: manifest_asset?,
        zip_asset: zip_asset?,
    })
}

pub fn manifest_url(prevalidated: &PrevalidatedRelease<'_>) -> String {
    prevalidated
        .manifest_asset
        .get("browser_download_url")
        .map(py_string)
        .unwrap_or_default()
}

pub fn validate_manifest_candidate(
    prevalidated: &PrevalidatedRelease<'_>,
    payload: &Value,
) -> Option<UpdateCandidate> {
    let manifest = parse_release_manifest(payload)?;
    if manifest.plugin_name != "Decky Metadata"
        || manifest.package_name != "decky-metadata"
        || manifest.tag != prevalidated.tag_name
        || format!("v{}", manifest.version) != prevalidated.tag_name
    {
        return None;
    }
    if manifest.channel == "stable" && prevalidated.prerelease {
        return None;
    }
    if manifest.channel == "dev" && !prevalidated.prerelease {
        return None;
    }
    if string_field(prevalidated.zip_asset, "name", "") != manifest.asset_name {
        return None;
    }
    Some(UpdateCandidate {
        version: manifest.version,
        tag: manifest.tag,
        channel: if manifest.channel == "stable" {
            "stable".to_owned()
        } else {
            "development".to_owned()
        },
        artifact_url: string_field(prevalidated.zip_asset, "browser_download_url", ""),
        sha256: manifest.sha256,
        release_url: string_field(prevalidated.record, "html_url", ""),
        published_at: prevalidated.published_at.clone(),
        action: "update".to_owned(),
    })
}

/// Fully validate a recorded release and manifest without making a network request.
pub fn validate_release_candidate(release: &Value, manifest: &Value) -> Option<UpdateCandidate> {
    validate_manifest_candidate(&prevalidate_release_candidate(release)?, manifest)
}

/// Select the baseline's highest eligible release and preserve its stable/dev handoff actions.
pub fn select_candidate(
    candidates: &[UpdateCandidate],
    installed_version: &str,
    preferred_channel: &str,
) -> Option<UpdateCandidate> {
    let installed = parse_plugin_version(installed_version)?;
    let mut best: Option<(&UpdateCandidate, ParsedPluginVersion)> = None;
    for candidate in candidates {
        if preferred_channel == "stable" && candidate.channel != "stable" {
            continue;
        }
        let Some(version) = parse_plugin_version(&candidate.version) else {
            continue;
        };
        let replace = best.as_ref().is_none_or(|(best_candidate, best_version)| {
            version
                .cmp(best_version)
                .then_with(|| candidate.published_at.cmp(&best_candidate.published_at))
                != std::cmp::Ordering::Less
        });
        if replace {
            best = Some((candidate, version));
        }
    }
    let (best_candidate, best_version) = best?;
    let same_base = best_version.major == installed.major
        && best_version.minor == installed.minor
        && best_version.patch == installed.patch;
    let mut action = "update";
    let upgrade = if preferred_channel == "stable" && installed.is_dev {
        action = if same_base {
            "move_to_stable"
        } else if best_version < installed {
            "downgrade_to_stable"
        } else {
            "update"
        };
        true
    } else if best_version > installed {
        if !best_version.is_dev && installed.is_dev && same_base {
            action = "move_to_stable";
        }
        true
    } else if best_version == installed {
        if best_candidate.channel == "stable"
            && !best_version.is_dev
            && best_version.build_metadata.is_none()
            && installed.build_metadata.is_some()
        {
            action = "move_to_stable";
            true
        } else if best_version.is_dev && installed.is_dev {
            if best_candidate.version != installed_version {
                action = "update";
                true
            } else {
                false
            }
        } else if !best_version.is_dev && installed.is_dev {
            action = "move_to_stable";
            true
        } else {
            false
        }
    } else {
        false
    };
    upgrade.then(|| UpdateCandidate {
        version: best_candidate.version.clone(),
        tag: best_candidate.tag.clone(),
        channel: best_candidate.channel.clone(),
        artifact_url: best_candidate.artifact_url.clone(),
        sha256: best_candidate.sha256.clone(),
        release_url: best_candidate.release_url.clone(),
        published_at: best_candidate.published_at.clone(),
        action: action.to_owned(),
    })
}

pub fn format_candidate_log(candidate: Option<&UpdateCandidate>) -> String {
    let Some(candidate) = candidate else {
        return "none".to_owned();
    };
    let prefix = candidate.sha256.get(..8).unwrap_or("unknown");
    format!(
        "version={}, tag={}, channel={}, sha256_prefix={prefix}",
        candidate.version, candidate.tag, candidate.channel
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{Value, json};

    fn release(version: &str, prerelease: bool) -> Value {
        let tag = format!("v{version}");
        json!({
            "draft": false,
            "prerelease": prerelease,
            "tag_name": tag,
            "html_url": format!("https://example.test/releases/{tag}"),
            "published_at": "2026-07-17T12:00:00Z",
            "assets": [
                {"name": format!("Decky-Metadata-{tag}.manifest.json"), "browser_download_url": "https://example.test/manifest"},
                {"name": format!("Decky-Metadata-{tag}.zip"), "browser_download_url": "https://example.test/plugin.zip"}
            ]
        })
    }

    fn manifest(version: &str, channel: &str) -> Value {
        let tag = format!("v{version}");
        json!({
            "schemaVersion": 1,
            "pluginName": "Decky Metadata",
            "packageName": "decky-metadata",
            "version": version,
            "sourceVersion": version,
            "tag": tag,
            "channel": channel,
            "assetName": format!("Decky-Metadata-{tag}.zip"),
            "sha256": "a".repeat(64),
            "generatedAt": "raw-publication-metadata"
        })
    }

    #[test]
    fn recorded_release_identity_and_duplicate_assets_are_validated() {
        let release = release("0.4.0", false);
        let candidate = validate_release_candidate(&release, &manifest("0.4.0", "stable")).unwrap();
        assert_eq!(candidate.published_at, "2026-07-17T12:00:00Z");
        assert_eq!(candidate.action, "update");

        let mut duplicate_zip = release.clone();
        let repeated_zip = duplicate_zip["assets"][1].clone();
        duplicate_zip["assets"]
            .as_array_mut()
            .unwrap()
            .push(repeated_zip);
        assert!(prevalidate_release_candidate(&duplicate_zip).is_none());
        let mut duplicate_manifest = release.clone();
        let repeated_manifest = duplicate_manifest["assets"][0].clone();
        duplicate_manifest["assets"]
            .as_array_mut()
            .unwrap()
            .push(repeated_manifest);
        assert!(prevalidate_release_candidate(&duplicate_manifest).is_none());

        let mut wrong_identity = manifest("0.4.0", "stable");
        wrong_identity["pluginName"] = json!("Other");
        assert!(validate_release_candidate(&release, &wrong_identity).is_none());
        let mut wrong_tag = manifest("0.4.0", "stable");
        wrong_tag["tag"] = json!("v0.4.1");
        assert!(validate_release_candidate(&release, &wrong_tag).is_none());
        let mut wrong_asset_hash = manifest("0.4.0", "stable");
        wrong_asset_hash["sha256"] = json!("bad");
        assert!(validate_release_candidate(&release, &wrong_asset_hash).is_none());
    }

    fn candidate(version: &str, channel: &str, published_at: &str) -> UpdateCandidate {
        UpdateCandidate {
            version: version.to_owned(),
            tag: format!("v{version}"),
            channel: channel.to_owned(),
            artifact_url: "https://example.test/plugin.zip".to_owned(),
            sha256: "a".repeat(64),
            release_url: "https://example.test/release".to_owned(),
            published_at: published_at.to_owned(),
            action: "update".to_owned(),
        }
    }

    #[test]
    fn release_order_and_stable_development_handoffs_match_python_rules() {
        let candidates = [
            candidate("0.3.1", "stable", "2026-07-16"),
            candidate("0.3.2", "stable", "2026-07-17"),
            candidate("0.3.3-dev.g1", "development", "2026-07-18"),
        ];
        assert_eq!(
            select_candidate(&candidates, "0.3.1", "stable")
                .unwrap()
                .action,
            "update"
        );
        assert_eq!(
            select_candidate(&candidates, "0.3.2-dev.g1", "stable")
                .unwrap()
                .action,
            "move_to_stable"
        );
        assert_eq!(
            select_candidate(&candidates, "0.3.3-dev.g1", "stable")
                .unwrap()
                .action,
            "downgrade_to_stable"
        );
        assert!(select_candidate(&candidates, "0.3.2", "stable").is_none());
        assert!(select_candidate(&candidates, "0.3.3-dev.g1", "development").is_none());

        let local = [candidate("0.3.2", "stable", "2026-07-17")];
        assert_eq!(
            select_candidate(&local, "0.3.2+local", "stable")
                .unwrap()
                .action,
            "move_to_stable"
        );
        assert_eq!(select_candidate(&local, "0.3.3+local", "stable"), None);
        let huge = [candidate(
            "1000000000000000000000000000000.0.0",
            "stable",
            "raw",
        )];
        assert_eq!(
            select_candidate(&huge, "999999999999999999999999999999.0.0", "stable")
                .unwrap()
                .version,
            huge[0].version
        );
    }

    #[test]
    fn equal_version_candidates_use_raw_publication_string_order() {
        let candidates = [
            candidate("0.4.0-dev.first", "development", "2026-07-16T12:00:00Z"),
            candidate("0.4.0-dev.second", "development", "2026-07-17T12:00:00Z"),
        ];
        let selected = select_candidate(&candidates, "0.4.0-dev.first", "development").unwrap();
        assert_eq!(selected.version, "0.4.0-dev.second");
    }
}
