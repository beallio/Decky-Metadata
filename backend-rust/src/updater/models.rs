use chrono::{DateTime, NaiveDate, NaiveDateTime, Utc};
use serde_json::{Map, Value};
use std::cmp::Ordering;

#[derive(Clone, Debug, PartialEq)]
pub struct JsonResponse {
    pub status: u16,
    pub headers: std::collections::HashMap<String, String>,
    pub body: Value,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ReleaseManifest {
    pub schema_version: u64,
    pub plugin_name: String,
    pub package_name: String,
    pub version: String,
    pub source_version: String,
    pub tag: String,
    pub channel: String,
    pub asset_name: String,
    pub sha256: String,
    pub generated_at: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct UpdateCandidate {
    pub version: String,
    pub tag: String,
    pub channel: String,
    pub artifact_url: String,
    pub sha256: String,
    pub release_url: String,
    pub published_at: String,
    pub action: String,
}

/// Python-compatible version ordering for the updater's deliberately small grammar.
/// Numeric components are normalized strings, so their size is not bounded by a machine integer.
#[derive(Clone, Debug)]
pub struct ParsedPluginVersion {
    pub major: String,
    pub minor: String,
    pub patch: String,
    pub is_dev: bool,
    pub dev_suffix: Option<String>,
    pub build_metadata: Option<String>,
}

impl PartialEq for ParsedPluginVersion {
    fn eq(&self, other: &Self) -> bool {
        self.major == other.major
            && self.minor == other.minor
            && self.patch == other.patch
            && self.is_dev == other.is_dev
    }
}

impl Eq for ParsedPluginVersion {}

impl PartialOrd for ParsedPluginVersion {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for ParsedPluginVersion {
    fn cmp(&self, other: &Self) -> Ordering {
        compare_digits(&self.major, &other.major)
            .then_with(|| compare_digits(&self.minor, &other.minor))
            .then_with(|| compare_digits(&self.patch, &other.patch))
            // Development versions sort below stable versions; suffix and build are ignored.
            .then_with(|| other.is_dev.cmp(&self.is_dev))
    }
}

fn compare_digits(left: &str, right: &str) -> Ordering {
    left.len().cmp(&right.len()).then_with(|| left.cmp(right))
}

fn normalize_digits(value: &str) -> Option<String> {
    if value.is_empty() {
        return None;
    }
    let mut normalized = String::with_capacity(value.len());
    for character in value.chars() {
        let digit = crate::matching::decimal_digit(character)?;
        if digit != 0 || !normalized.is_empty() {
            normalized.push(char::from(b'0' + digit));
        }
    }
    if normalized.is_empty() {
        normalized.push('0');
    }
    Some(normalized)
}

fn valid_suffix(value: &str) -> bool {
    !value.is_empty()
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'-'))
}

pub fn parse_plugin_version(version: &str) -> Option<ParsedPluginVersion> {
    let version = version.strip_suffix('\n').unwrap_or(version);
    let (version, build_metadata) = match version.split_once('+') {
        Some((version, build)) if valid_suffix(build) && !build.contains('+') => {
            (version, Some(build.to_owned()))
        }
        Some(_) => return None,
        None => (version, None),
    };
    let (numeric, dev_suffix) = match version.split_once("-dev.") {
        Some((numeric, suffix)) if valid_suffix(suffix) => (numeric, Some(suffix.to_owned())),
        Some(_) => return None,
        None => (version, None),
    };
    let mut components = numeric.split('.');
    let major = normalize_digits(components.next()?)?;
    let minor = normalize_digits(components.next()?)?;
    let patch = normalize_digits(components.next()?)?;
    if components.next().is_some() {
        return None;
    }
    Some(ParsedPluginVersion {
        major,
        minor,
        patch,
        is_dev: dev_suffix.is_some(),
        dev_suffix,
        build_metadata,
    })
}

pub fn as_string_key_mapping(value: &Value) -> Option<&Map<String, Value>> {
    value.as_object()
}

pub fn parse_release_manifest(value: &Value) -> Option<ReleaseManifest> {
    let record = as_string_key_mapping(value)?;
    let schema_value = record.get("schemaVersion")?;
    // Python's isinstance(value, int) includes bool, and True compares equal to 1.
    let schema_version = if schema_value.as_u64() == Some(1) || schema_value == &Value::Bool(true) {
        1
    } else {
        return None;
    };
    let plugin_name = record.get("pluginName")?.as_str()?;
    let package_name = record.get("packageName")?.as_str()?;
    let version = record.get("version")?.as_str()?;
    let source_version = record.get("sourceVersion")?.as_str()?;
    let tag = record.get("tag")?.as_str()?;
    let channel = record.get("channel")?.as_str()?;
    if !matches!(channel, "stable" | "dev") {
        return None;
    }
    let asset_name = record.get("assetName")?.as_str()?;
    let sha256 = record.get("sha256")?.as_str()?;
    if sha256.len() != 64 || !sha256.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return None;
    }
    let generated_at = record.get("generatedAt")?.as_str()?;
    Some(ReleaseManifest {
        schema_version,
        plugin_name: plugin_name.to_owned(),
        package_name: package_name.to_owned(),
        version: version.to_owned(),
        source_version: source_version.to_owned(),
        tag: tag.to_owned(),
        channel: channel.to_owned(),
        asset_name: asset_name.to_owned(),
        sha256: sha256.to_owned(),
        generated_at: generated_at.to_owned(),
    })
}

pub fn isoformat_utc(value: DateTime<Utc>) -> String {
    let mut result = value.format("%Y-%m-%dT%H:%M:%S").to_string();
    let micros = value.timestamp_subsec_micros();
    if micros != 0 {
        result.push_str(&format!(".{micros:06}"));
    }
    result.push_str("+00:00");
    result
}

pub fn parse_iso_datetime(value: &str) -> Option<DateTime<Utc>> {
    let normalized = if let Some(prefix) = value.strip_suffix('Z') {
        format!("{prefix}+00:00")
    } else {
        value.to_owned()
    };
    let zoned = DateTime::parse_from_rfc3339(&normalized)
        .or_else(|_| DateTime::parse_from_str(&normalized, "%Y-%m-%dT%H:%M:%S%.f%z"))
        .map(|parsed| parsed.with_timezone(&Utc))
        .ok();
    zoned
        .or_else(|| {
            ["%Y-%m-%dT%H:%M:%S%.f", "%Y-%m-%d %H:%M:%S%.f"]
                .into_iter()
                .find_map(|format| {
                    NaiveDateTime::parse_from_str(&normalized, format)
                        .ok()
                        .map(|parsed| parsed.and_utc())
                })
        })
        .or_else(|| {
            NaiveDate::parse_from_str(&normalized, "%Y-%m-%d")
                .ok()
                .and_then(|date| date.and_hms_opt(0, 0, 0))
                .map(|parsed| parsed.and_utc())
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn custom_versions_compare_unbounded_digits_and_ignore_suffix_metadata() {
        let huge = parse_plugin_version("000999999999999999999999999999.2.3-dev.g1+local").unwrap();
        let larger = parse_plugin_version("1000000000000000000000000000000.0.0").unwrap();
        assert!(huge < larger);
        assert_eq!(
            parse_plugin_version("0001.02.003+one").unwrap(),
            parse_plugin_version("1.2.3+two").unwrap()
        );
        assert!(
            parse_plugin_version("1.2.3-dev.a").unwrap() < parse_plugin_version("1.2.3").unwrap()
        );
        for invalid in [
            "",
            "1.2",
            "v1.2.3",
            "1.2.3-rc.1",
            "1.2.3+",
            "1.2.3-dev.",
            "1.2.3+build+other",
        ] {
            assert!(parse_plugin_version(invalid).is_none(), "{invalid}");
        }
    }

    #[test]
    fn version_decimal_components_follow_python_unicode_digits() {
        assert_eq!(
            parse_plugin_version("١.٠٢.３").unwrap(),
            parse_plugin_version("1.2.3").unwrap()
        );
        assert_eq!(
            parse_plugin_version("1.2.3\n").unwrap(),
            parse_plugin_version("1.2.3").unwrap()
        );
        for invalid in ["¹.2.3", "1_0.2.3", "١.٢.٣-dev.g١", "1.2.3\n\n"] {
            assert!(parse_plugin_version(invalid).is_none(), "{invalid}");
        }
    }

    #[test]
    fn manifest_schema_checks_fields_without_enforcing_release_identity() {
        let manifest = json!({
            "schemaVersion": 1,
            "pluginName": "Other",
            "packageName": "other",
            "version": "0.4.0",
            "sourceVersion": "source",
            "tag": "not-a-matching-tag",
            "channel": "stable",
            "assetName": "other.zip",
            "sha256": "a".repeat(64),
            "generatedAt": "raw"
        });
        assert_eq!(
            parse_release_manifest(&manifest).unwrap().plugin_name,
            "Other"
        );
        for change in [
            json!({"schemaVersion": 2}),
            json!({"channel": "nightly"}),
            json!({"sha256": "bad"}),
            json!({"version": 1}),
            json!({"generatedAt": null}),
        ] {
            let mut invalid = manifest.clone();
            for (key, value) in change.as_object().unwrap() {
                invalid[key] = value.clone();
            }
            assert!(parse_release_manifest(&invalid).is_none());
        }
        let mut missing = manifest;
        missing.as_object_mut().unwrap().remove("tag");
        assert!(parse_release_manifest(&missing).is_none());
        assert!(parse_release_manifest(&json!([])).is_none());
    }
}
