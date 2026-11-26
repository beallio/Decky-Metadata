use crate::updater::models::{parse_plugin_version, parse_release_manifest};
use serde_json::{Value, json};

pub const REPOSITORY: &str = "beallio/Decky-Metadata";
pub const TESTING_PR_LABEL: &str = "test-build";
pub const TESTING_WORKFLOW_NAME: &str = "CI";
pub const PR_BUILDS_RELEASE_TAG: &str = "pr-builds";
pub const MAX_SIDECAR_BYTES: usize = 16 * 1024;
const PR_RELEASE_DOWNLOAD_PREFIX: &str =
    "https://github.com/beallio/Decky-Metadata/releases/download/";

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PrReleaseAssetUrls {
    pub zip_url: String,
    pub sha_url: String,
    pub manifest_url: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TestingPullRequest {
    pub id: u64,
    pub name: String,
    pub link: String,
    pub head_sha: String,
    pub created_at: String,
    pub updated_at: String,
    pub author: String,
    pub is_fork: bool,
    pub draft: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PreparedTestingBuild {
    pub pr_id: u64,
    pub version: String,
    pub tag: String,
    pub channel: String,
    pub artifact_url: String,
    pub sha256: String,
    pub published_at: String,
}

impl TestingPullRequest {
    pub fn to_value(&self) -> Value {
        json!({
            "id": self.id,
            "name": self.name,
            "link": self.link,
            "head_sha": self.head_sha,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "author": self.author,
            "is_fork": self.is_fork,
            "draft": self.draft,
        })
    }
}

impl PreparedTestingBuild {
    pub fn to_value(&self) -> Value {
        json!({
            "status": "ready",
            "pr_id": self.pr_id,
            "version": self.version,
            "tag": self.tag,
            "channel": self.channel,
            "artifact_url": self.artifact_url,
            "sha256": self.sha256,
            "published_at": self.published_at,
        })
    }
}

pub fn is_valid_sha(sha: &str) -> bool {
    sha.len() == 40 && sha.bytes().all(|byte| byte.is_ascii_hexdigit())
}

pub fn is_same_repo_pull(pull: &Value) -> bool {
    pull.get("head")
        .and_then(|head| head.get("repo"))
        .and_then(|repo| repo.get("full_name"))
        .and_then(Value::as_str)
        .is_some_and(|full_name| full_name.eq_ignore_ascii_case(REPOSITORY))
}

pub fn has_opt_in_label(pull: &Value) -> bool {
    pull.get("labels")
        .and_then(Value::as_array)
        .is_some_and(|labels| {
            labels.iter().any(|label| {
                label
                    .get("name")
                    .and_then(Value::as_str)
                    .is_some_and(|name| name.eq_ignore_ascii_case(TESTING_PR_LABEL))
            })
        })
}

/// A PR is eligible when it is open (or omits state in list replies) and either
/// comes from `beallio/Decky-Metadata` or carries the opt-in `test-build` label.
pub fn is_eligible_pull(pull: &Value) -> bool {
    let state_ok = pull
        .get("state")
        .and_then(Value::as_str)
        .is_none_or(|state| state.eq_ignore_ascii_case("open"));
    state_ok && (is_same_repo_pull(pull) || has_opt_in_label(pull))
}

pub fn parse_testing_pull(pull: &Value) -> Option<TestingPullRequest> {
    if !is_eligible_pull(pull) {
        return None;
    }
    let id = pull
        .get("number")
        .and_then(Value::as_u64)
        .filter(|n| *n > 0)?;
    let name = pull
        .get("title")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())?
        .to_owned();
    let link = pull
        .get("html_url")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())?
        .to_owned();
    let head_sha = pull
        .get("head")
        .and_then(|head| head.get("sha"))
        .and_then(Value::as_str)
        .filter(|sha| is_valid_sha(sha))?
        .to_ascii_lowercase();
    let created_at = pull
        .get("created_at")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())?
        .to_owned();
    let updated_at = pull
        .get("updated_at")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())?
        .to_owned();
    let author = pull
        .get("user")
        .and_then(|user| user.get("login"))
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_owned();
    let is_fork = !is_same_repo_pull(pull);
    let draft = pull.get("draft").and_then(Value::as_bool).unwrap_or(false);
    Some(TestingPullRequest {
        id,
        name,
        link,
        head_sha,
        created_at,
        updated_at,
        author,
        is_fork,
        draft,
    })
}

pub fn filter_testing_pulls(pulls: &[Value]) -> Vec<TestingPullRequest> {
    pulls.iter().filter_map(parse_testing_pull).collect()
}

/// Classifies why a PR commit has no published `pr-builds` release asset yet by
/// inspecting GitHub Actions `CI` workflow runs for that commit SHA.
pub fn classify_missing_pr_build(workflows: &[Value]) -> &'static str {
    let ci_runs: Vec<&Value> = workflows
        .iter()
        .filter(|run| run.get("name").and_then(Value::as_str) == Some(TESTING_WORKFLOW_NAME))
        .collect();
    if ci_runs.is_empty() {
        return "testing_build_not_found";
    }
    if ci_runs
        .iter()
        .any(|run| run.get("status").and_then(Value::as_str) != Some("completed"))
    {
        return "testing_build_in_progress";
    }
    let any_passing = ci_runs.iter().any(|run| {
        run.get("status").and_then(Value::as_str) == Some("completed")
            && run.get("conclusion").and_then(Value::as_str) == Some("success")
    });
    if any_passing {
        "testing_artifact_not_found"
    } else {
        "testing_build_failed"
    }
}

pub fn parse_checksum_sidecar_for(
    text: &str,
    expected_asset_name: &str,
) -> Result<String, &'static str> {
    let line = text.trim_end_matches(['\r', '\n']);
    let (digest, name) = line.split_once("  ").ok_or("testing_artifact_invalid")?;
    let valid_digest = digest.len() == 64
        && digest
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte));
    if !valid_digest || name != expected_asset_name {
        return Err("testing_artifact_invalid");
    }
    Ok(digest.to_owned())
}

pub fn find_pr_release_assets(release: &Value, pr_id: u64) -> Option<PrReleaseAssetUrls> {
    if release
        .get("draft")
        .and_then(Value::as_bool)
        .unwrap_or(false)
    {
        return None;
    }
    let assets = release.get("assets")?.as_array()?;
    let expected_zip = format!("Decky-Metadata-pr-{pr_id}.zip");
    let expected_sha = format!("Decky-Metadata-pr-{pr_id}.zip.sha256");
    let expected_manifest = format!("Decky-Metadata-pr-{pr_id}.manifest.json");
    let mut zip_url = None;
    let mut sha_url = None;
    let mut manifest_url = None;
    for asset in assets {
        let Some(name) = asset.get("name").and_then(Value::as_str) else {
            continue;
        };
        let Some(url) = asset
            .get("browser_download_url")
            .and_then(Value::as_str)
            .filter(|url| url.starts_with(PR_RELEASE_DOWNLOAD_PREFIX))
        else {
            continue;
        };
        if name == expected_zip {
            zip_url = Some(url.to_owned());
        } else if name == expected_sha {
            sha_url = Some(url.to_owned());
        } else if name == expected_manifest {
            manifest_url = Some(url.to_owned());
        }
    }
    Some(PrReleaseAssetUrls {
        zip_url: zip_url?,
        sha_url: sha_url?,
        manifest_url: manifest_url?,
    })
}

/// Validates assets published under the rolling `pr-builds` GitHub Release.
/// Returns `Ok(None)` when the published asset is for a different commit SHA
/// (so the caller can inspect CI status for the newer commit).
pub fn validate_pr_release_assets(
    pr_id: u64,
    head_sha: &str,
    zip_url: &str,
    manifest_value: &Value,
    sha_text: &str,
) -> Result<Option<PreparedTestingBuild>, &'static str> {
    let manifest = parse_release_manifest(manifest_value).ok_or("testing_artifact_invalid")?;
    let expected_zip = format!("Decky-Metadata-pr-{pr_id}.zip");
    if manifest.plugin_name != "Decky Metadata"
        || manifest.package_name != "decky-metadata"
        || manifest.asset_name != expected_zip
        || manifest.channel != "dev"
        || format!("v{}", manifest.version) != manifest.tag
        || parse_plugin_version(&manifest.version).is_none()
    {
        return Err("testing_artifact_invalid");
    }
    if manifest_value.get("prNumber").and_then(Value::as_u64) != Some(pr_id) {
        return Err("testing_artifact_invalid");
    }
    let Some(manifest_sha) = manifest_value
        .get("headSha")
        .and_then(Value::as_str)
        .filter(|sha| is_valid_sha(sha))
        .map(str::to_ascii_lowercase)
    else {
        return Err("testing_artifact_invalid");
    };
    if manifest_sha != head_sha.to_ascii_lowercase() {
        return Ok(None);
    }
    let sidecar_sha = parse_checksum_sidecar_for(sha_text, &expected_zip)?;
    let expected_sha = manifest.sha256.to_ascii_lowercase();
    if sidecar_sha != expected_sha {
        return Err("testing_artifact_sha_mismatch");
    }
    Ok(Some(PreparedTestingBuild {
        pr_id,
        version: manifest.version,
        tag: manifest.tag,
        channel: "development".to_owned(),
        artifact_url: zip_url.to_owned(),
        sha256: expected_sha,
        published_at: manifest.generated_at,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    const VALID_SHA: &str = "0123456789abcdef0123456789abcdef01234567";
    const OLDER_SHA: &str = "fedcba9876543210fedcba9876543210fedcba98";

    fn pull_json(number: u64, repo: &str, labels: &[&str]) -> Value {
        json!({
            "number": number,
            "state": "open",
            "title": format!("PR {number}"),
            "html_url": format!("https://github.com/beallio/Decky-Metadata/pull/{number}"),
            "created_at": "2026-11-20T10:00:00Z",
            "updated_at": "2026-11-24T12:00:00Z",
            "draft": false,
            "user": {"login": "tester"},
            "head": {
                "sha": VALID_SHA,
                "repo": {"full_name": repo}
            },
            "labels": labels.iter().map(|name| json!({"name": name})).collect::<Vec<_>>()
        })
    }

    fn valid_manifest(pr_id: u64, sha: &str, digest: &str) -> Value {
        json!({
            "schemaVersion": 1,
            "pluginName": "Decky Metadata",
            "packageName": "decky-metadata",
            "version": format!("0.6.8-dev.pr{pr_id}.g0123456"),
            "sourceVersion": format!("0.6.8-dev.pr{pr_id}.g0123456"),
            "tag": format!("v0.6.8-dev.pr{pr_id}.g0123456"),
            "channel": "dev",
            "assetName": format!("Decky-Metadata-pr-{pr_id}.zip"),
            "sha256": digest,
            "generatedAt": "2026-11-25T00:00:00Z",
            "prNumber": pr_id,
            "headSha": sha
        })
    }

    #[test]
    fn eligibility_allows_same_repo_or_opt_in_label_only() {
        let pulls = vec![
            pull_json(10, "beallio/Decky-Metadata", &[]),
            pull_json(11, "stranger/Decky-Metadata", &[]),
            pull_json(12, "contributor/Decky-Metadata", &["bug", "test-build"]),
            pull_json(13, "contributor/Decky-Metadata", &["Test-Build"]),
        ];
        let parsed = filter_testing_pulls(&pulls);
        assert_eq!(
            parsed.iter().map(|pr| pr.id).collect::<Vec<_>>(),
            vec![10, 12, 13]
        );
        assert!(!parsed[0].is_fork);
        assert!(parsed[1].is_fork);
        assert!(parsed[2].is_fork);

        let mut closed = pull_json(14, "beallio/Decky-Metadata", &[]);
        closed["state"] = json!("closed");
        assert!(parse_testing_pull(&closed).is_none());
    }

    #[test]
    fn classify_missing_pr_build_distinguishes_ci_states() {
        assert_eq!(classify_missing_pr_build(&[]), "testing_build_not_found");
        assert_eq!(
            classify_missing_pr_build(&[
                json!({"id": 1, "name": "Other", "status": "completed", "conclusion": "success"})
            ]),
            "testing_build_not_found"
        );
        assert_eq!(
            classify_missing_pr_build(&[
                json!({"id": 2, "name": "CI", "status": "in_progress"}),
                json!({"id": 3, "name": "CI", "status": "completed", "conclusion": "failure"})
            ]),
            "testing_build_in_progress"
        );
        assert_eq!(
            classify_missing_pr_build(&[
                json!({"id": 4, "name": "CI", "status": "completed", "conclusion": "failure"})
            ]),
            "testing_build_failed"
        );
        assert_eq!(
            classify_missing_pr_build(&[
                json!({"id": 5, "name": "CI", "status": "completed", "conclusion": "success"})
            ]),
            "testing_artifact_not_found"
        );
    }

    #[test]
    fn pr_release_asset_lookup_and_validation_enforce_github_host_and_metadata() {
        let zip_url =
            "https://github.com/beallio/Decky-Metadata/releases/download/pr-builds/Decky-Metadata-pr-42.zip";
        let sha_url =
            "https://github.com/beallio/Decky-Metadata/releases/download/pr-builds/Decky-Metadata-pr-42.zip.sha256";
        let manifest_url =
            "https://github.com/beallio/Decky-Metadata/releases/download/pr-builds/Decky-Metadata-pr-42.manifest.json";

        let release = json!({
            "draft": false,
            "assets": [
                {"name": "Decky-Metadata-pr-42.zip", "browser_download_url": zip_url},
                {"name": "Decky-Metadata-pr-42.zip.sha256", "browser_download_url": sha_url},
                {"name": "Decky-Metadata-pr-42.manifest.json", "browser_download_url": manifest_url}
            ]
        });
        let found = find_pr_release_assets(&release, 42).unwrap();
        assert_eq!(found.zip_url, zip_url);
        assert!(find_pr_release_assets(&release, 99).is_none());

        let foreign_host = json!({
            "draft": false,
            "assets": [
                {"name": "Decky-Metadata-pr-42.zip", "browser_download_url": "https://evil.example/Decky-Metadata-pr-42.zip"},
                {"name": "Decky-Metadata-pr-42.zip.sha256", "browser_download_url": sha_url},
                {"name": "Decky-Metadata-pr-42.manifest.json", "browser_download_url": manifest_url}
            ]
        });
        assert!(find_pr_release_assets(&foreign_host, 42).is_none());

        let digest = "a".repeat(64);
        let sidecar = format!("{digest}  Decky-Metadata-pr-42.zip\n");
        let manifest = valid_manifest(42, VALID_SHA, &digest);
        let prepared =
            validate_pr_release_assets(42, VALID_SHA, zip_url, &manifest, &sidecar)
                .unwrap()
                .unwrap();
        assert_eq!(prepared.pr_id, 42);
        assert_eq!(prepared.artifact_url, zip_url);
        assert_eq!(prepared.sha256, digest);

        let stale_manifest = valid_manifest(42, OLDER_SHA, &digest);
        assert_eq!(
            validate_pr_release_assets(42, VALID_SHA, zip_url, &stale_manifest, &sidecar),
            Ok(None)
        );

        let mismatched_sidecar = format!("{}  Decky-Metadata-pr-42.zip\n", "b".repeat(64));
        assert_eq!(
            validate_pr_release_assets(42, VALID_SHA, zip_url, &manifest, &mismatched_sidecar),
            Err("testing_artifact_sha_mismatch")
        );

        let mut wrong_plugin = manifest.clone();
        wrong_plugin["pluginName"] = json!("Other Plugin");
        assert_eq!(
            validate_pr_release_assets(42, VALID_SHA, zip_url, &wrong_plugin, &sidecar),
            Err("testing_artifact_invalid")
        );

        let mut wrong_pr = manifest;
        wrong_pr["prNumber"] = json!(99);
        assert_eq!(
            validate_pr_release_assets(42, VALID_SHA, zip_url, &wrong_pr, &sidecar),
            Err("testing_artifact_invalid")
        );
    }
}
