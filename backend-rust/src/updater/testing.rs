use crate::updater::models::{parse_plugin_version, parse_release_manifest};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::{Cursor, Read},
    os::unix::fs::PermissionsExt,
    path::{Path, PathBuf},
};
use zip::ZipArchive;

pub const REPOSITORY: &str = "beallio/Decky-Metadata";
pub const TESTING_PR_LABEL: &str = "test-build";
pub const TESTING_WORKFLOW_NAME: &str = "CI";
pub const TESTING_ARTIFACT_NAME: &str = "decky-metadata-pr";
pub const TESTING_DOWNLOAD_ORIGIN: &str = "https://nightly.link";
pub const INNER_ZIP_NAME: &str = "Decky-Metadata.zip";
pub const INNER_SHA_NAME: &str = "Decky-Metadata.zip.sha256";
pub const INNER_MANIFEST_NAME: &str = "Decky-Metadata.manifest.json";
pub const MAX_TESTING_ARTIFACT_BYTES: usize = 64 * 1024 * 1024;
const MAX_SIDECAR_BYTES: usize = 16 * 1024;
const MAX_CANDIDATE_RUNS: usize = 5;

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
    let id = pull.get("number").and_then(Value::as_u64).filter(|n| *n > 0)?;
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

/// Returns up to `MAX_CANDIDATE_RUNS` passing `CI` workflow run IDs for the commit,
/// preferring `pull_request` runs first (newest first, as GitHub returns them).
pub fn select_candidate_run_ids(workflows: &[Value]) -> Result<Vec<u64>, &'static str> {
    let ci_runs: Vec<&Value> = workflows
        .iter()
        .filter(|run| run.get("name").and_then(Value::as_str) == Some(TESTING_WORKFLOW_NAME))
        .collect();
    if ci_runs.is_empty() {
        return Err("testing_build_not_found");
    }

    let is_passing = |run: &&Value| {
        run.get("status").and_then(Value::as_str) == Some("completed")
            && run.get("conclusion").and_then(Value::as_str) == Some("success")
    };
    let mut pr_runs = Vec::new();
    let mut other_runs = Vec::new();
    for run in ci_runs.iter().copied().filter(is_passing) {
        let Some(id) = run.get("id").and_then(Value::as_u64) else {
            continue;
        };
        if run.get("event").and_then(Value::as_str) == Some("pull_request") {
            pr_runs.push(id);
        } else {
            other_runs.push(id);
        }
    }
    pr_runs.extend(other_runs);
    pr_runs.truncate(MAX_CANDIDATE_RUNS);
    if !pr_runs.is_empty() {
        return Ok(pr_runs);
    }

    let any_pending = ci_runs
        .iter()
        .any(|run| run.get("status").and_then(Value::as_str) != Some("completed"));
    if any_pending {
        Err("testing_build_in_progress")
    } else {
        Err("testing_build_failed")
    }
}

pub fn select_testing_artifact(artifacts: &[Value]) -> Result<Option<u64>, &'static str> {
    let mut saw_expired = false;
    for artifact in artifacts {
        if artifact.get("name").and_then(Value::as_str) != Some(TESTING_ARTIFACT_NAME) {
            continue;
        }
        if artifact
            .get("expired")
            .and_then(Value::as_bool)
            .unwrap_or(false)
        {
            saw_expired = true;
            continue;
        }
        if let Some(id) = artifact.get("id").and_then(Value::as_u64).filter(|id| *id > 0) {
            return Ok(Some(id));
        }
    }
    if saw_expired {
        Err("testing_artifact_expired")
    } else {
        Ok(None)
    }
}

pub fn testing_artifact_download_url(artifact_id: u64) -> String {
    format!("{TESTING_DOWNLOAD_ORIGIN}/{REPOSITORY}/actions/artifacts/{artifact_id}.zip")
}

pub fn parse_checksum_sidecar(text: &str) -> Result<String, &'static str> {
    let line = text.trim_end_matches(['\r', '\n']);
    let (digest, name) = line
        .split_once("  ")
        .ok_or("testing_artifact_invalid")?;
    let valid_digest = digest.len() == 64
        && digest
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte));
    if !valid_digest || name != INNER_ZIP_NAME {
        return Err("testing_artifact_invalid");
    }
    Ok(digest.to_owned())
}

fn read_zip_entry_bounded(
    archive: &mut ZipArchive<Cursor<&[u8]>>,
    name: &str,
    max_bytes: usize,
) -> Result<Vec<u8>, &'static str> {
    let file = archive
        .by_name(name)
        .map_err(|_| "testing_artifact_invalid")?;
    if file.size() > max_bytes as u64 {
        return Err("testing_artifact_invalid");
    }
    let mut bytes = Vec::with_capacity((file.size() as usize).min(max_bytes));
    let mut reader = file.take((max_bytes as u64).saturating_add(1));
    reader
        .read_to_end(&mut bytes)
        .map_err(|_| "testing_artifact_invalid")?;
    if bytes.len() > max_bytes {
        return Err("testing_artifact_invalid");
    }
    Ok(bytes)
}

fn sha256_hex(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    let mut hex = String::with_capacity(64);
    for byte in digest {
        hex.push_str(&format!("{byte:02x}"));
    }
    hex
}

pub fn prune_staging_dir(staging_dir: &Path) {
    let Ok(entries) = fs::read_dir(staging_dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
            continue;
        };
        if (name.starts_with("Decky-Metadata-pr-") || name.starts_with(".Decky-Metadata-pr-"))
            && (name.ends_with(".zip") || name.ends_with(".tmp"))
        {
            let _ = fs::remove_file(&path);
        }
    }
}

pub fn extract_and_verify_testing_artifact(
    archive_bytes: &[u8],
    pr_id: u64,
    head_sha: &str,
    staging_dir: &Path,
) -> Result<PreparedTestingBuild, &'static str> {
    if pr_id == 0 || !is_valid_sha(head_sha) {
        return Err("testing_invalid_request");
    }
    let mut archive = ZipArchive::new(Cursor::new(archive_bytes))
        .map_err(|_| "testing_artifact_invalid")?;
    let manifest_bytes =
        read_zip_entry_bounded(&mut archive, INNER_MANIFEST_NAME, MAX_SIDECAR_BYTES)?;
    let checksum_bytes = read_zip_entry_bounded(&mut archive, INNER_SHA_NAME, MAX_SIDECAR_BYTES)?;
    let zip_bytes =
        read_zip_entry_bounded(&mut archive, INNER_ZIP_NAME, MAX_TESTING_ARTIFACT_BYTES)?;

    let manifest_value: Value =
        serde_json::from_slice(&manifest_bytes).map_err(|_| "testing_artifact_invalid")?;
    let manifest = parse_release_manifest(&manifest_value).ok_or("testing_artifact_invalid")?;
    if manifest.plugin_name != "Decky Metadata"
        || manifest.package_name != "decky-metadata"
        || manifest.asset_name != INNER_ZIP_NAME
        || manifest.channel != "dev"
        || format!("v{}", manifest.version) != manifest.tag
        || parse_plugin_version(&manifest.version).is_none()
    {
        return Err("testing_artifact_invalid");
    }

    let checksum_text =
        std::str::from_utf8(&checksum_bytes).map_err(|_| "testing_artifact_invalid")?;
    let sidecar_sha = parse_checksum_sidecar(checksum_text)?;
    let expected_sha = manifest.sha256.to_ascii_lowercase();
    if sidecar_sha != expected_sha {
        return Err("testing_artifact_sha_mismatch");
    }

    let actual_sha = sha256_hex(&zip_bytes);
    if actual_sha != expected_sha {
        return Err("testing_artifact_sha_mismatch");
    }

    let staged_path = stage_verified_zip(staging_dir, pr_id, head_sha, &zip_bytes)
        .map_err(|_| "testing_staging_failed")?;
    let artifact_url = format!("file://{}", staged_path.display());

    Ok(PreparedTestingBuild {
        pr_id,
        version: manifest.version,
        tag: manifest.tag,
        channel: "development".to_owned(),
        artifact_url,
        sha256: expected_sha,
        published_at: manifest.generated_at,
    })
}

fn stage_verified_zip(
    staging_dir: &Path,
    pr_id: u64,
    head_sha: &str,
    zip_bytes: &[u8],
) -> std::io::Result<PathBuf> {
    fs::create_dir_all(staging_dir)?;
    fs::set_permissions(staging_dir, fs::Permissions::from_mode(0o700))?;
    prune_staging_dir(staging_dir);
    let short_sha = &head_sha.to_ascii_lowercase()[..7];
    let final_path = staging_dir.join(format!("Decky-Metadata-pr-{pr_id}-{short_sha}.zip"));
    let temp_path = staging_dir.join(format!(
        ".Decky-Metadata-pr-{pr_id}-{short_sha}.{}.tmp",
        std::process::id()
    ));
    fs::write(&temp_path, zip_bytes)?;
    fs::set_permissions(&temp_path, fs::Permissions::from_mode(0o644))?;
    fs::rename(&temp_path, &final_path)?;
    Ok(final_path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use zip::{CompressionMethod, ZipWriter, write::SimpleFileOptions};

    const VALID_SHA: &str = "0123456789abcdef0123456789abcdef01234567";

    fn build_outer_artifact(zip_bytes: &[u8], sha_override: Option<&str>, manifest_override: Option<Value>) -> Vec<u8> {
        let actual_sha = sha256_hex(zip_bytes);
        let sha = sha_override.unwrap_or(&actual_sha);
        let manifest = manifest_override.unwrap_or_else(|| {
            json!({
                "schemaVersion": 1,
                "pluginName": "Decky Metadata",
                "packageName": "decky-metadata",
                "version": "0.6.8-dev.pr42.g0123456",
                "sourceVersion": "0.6.8-dev.pr42.g0123456",
                "tag": "v0.6.8-dev.pr42.g0123456",
                "channel": "dev",
                "assetName": INNER_ZIP_NAME,
                "sha256": sha,
                "generatedAt": "2026-11-25T00:00:00Z"
            })
        });
        let mut cursor = Cursor::new(Vec::new());
        {
            let mut writer = ZipWriter::new(&mut cursor);
            let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
            writer.start_file(INNER_ZIP_NAME, options).unwrap();
            writer.write_all(zip_bytes).unwrap();
            writer.start_file(INNER_SHA_NAME, options).unwrap();
            writer
                .write_all(format!("{sha}  {INNER_ZIP_NAME}\n").as_bytes())
                .unwrap();
            writer.start_file(INNER_MANIFEST_NAME, options).unwrap();
            writer
                .write_all(serde_json::to_vec(&manifest).unwrap().as_slice())
                .unwrap();
            writer.finish().unwrap();
        }
        cursor.into_inner()
    }

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

    #[test]
    fn eligibility_allows_same_repo_or_opt_in_label_only() {
        let pulls = vec![
            pull_json(10, "beallio/Decky-Metadata", &[]),
            pull_json(11, "stranger/Decky-Metadata", &[]),
            pull_json(12, "contributor/Decky-Metadata", &["bug", "test-build"]),
            pull_json(13, "contributor/Decky-Metadata", &["Test-Build"]),
        ];
        let parsed = filter_testing_pulls(&pulls);
        assert_eq!(parsed.iter().map(|pr| pr.id).collect::<Vec<_>>(), vec![10, 12, 13]);
        assert!(!parsed[0].is_fork);
        assert!(parsed[1].is_fork);
        assert!(parsed[2].is_fork);

        let mut closed = pull_json(14, "beallio/Decky-Metadata", &[]);
        closed["state"] = json!("closed");
        assert!(parse_testing_pull(&closed).is_none());
    }

    #[test]
    fn workflow_run_selection_prefers_passing_pr_runs_and_classifies_missing_states() {
        assert_eq!(select_candidate_run_ids(&[]), Err("testing_build_not_found"));
        assert_eq!(
            select_candidate_run_ids(&[json!({"id": 1, "name": "CI", "event": "pull_request", "status": "in_progress"})]),
            Err("testing_build_in_progress")
        );
        assert_eq!(
            select_candidate_run_ids(&[json!({"id": 2, "name": "CI", "event": "pull_request", "status": "completed", "conclusion": "failure"})]),
            Err("testing_build_failed")
        );
        let runs = vec![
            json!({"id": 100, "name": "CI", "event": "push", "status": "completed", "conclusion": "success"}),
            json!({"id": 101, "name": "CI", "event": "pull_request", "status": "completed", "conclusion": "success"}),
            json!({"id": 102, "name": "CI", "event": "pull_request", "status": "completed", "conclusion": "success"}),
            json!({"id": 103, "name": "Other", "event": "pull_request", "status": "completed", "conclusion": "success"}),
        ];
        assert_eq!(select_candidate_run_ids(&runs), Ok(vec![101, 102, 100]));
    }

    #[test]
    fn artifact_extraction_verifies_manifest_and_sha_and_stages_clean_file() {
        let base = std::env::var_os("TMPDIR")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("/var/tmp/omp-1000"));
        let dir = base.join(format!("decky-testing-stage-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let stale = dir.join("Decky-Metadata-pr-1-aaaaaaa.zip");
        fs::write(&stale, b"old").unwrap();

        let payload = b"fake-plugin-zip-bytes";
        let outer = build_outer_artifact(payload, None, None);
        let prepared = extract_and_verify_testing_artifact(&outer, 42, VALID_SHA, &dir).unwrap();
        assert_eq!(prepared.pr_id, 42);
        assert_eq!(prepared.version, "0.6.8-dev.pr42.g0123456");
        assert_eq!(prepared.sha256, sha256_hex(payload));
        assert!(!stale.exists());
        let staged_path = PathBuf::from(prepared.artifact_url.strip_prefix("file://").unwrap());
        assert_eq!(fs::read(&staged_path).unwrap(), payload);

        let tampered = build_outer_artifact(payload, Some(&"a".repeat(64)), None);
        assert_eq!(
            extract_and_verify_testing_artifact(&tampered, 42, VALID_SHA, &dir),
            Err("testing_artifact_sha_mismatch")
        );

        let wrong_plugin = build_outer_artifact(
            payload,
            None,
            Some(json!({
                "schemaVersion": 1,
                "pluginName": "Other Plugin",
                "packageName": "decky-metadata",
                "version": "0.6.8-dev.pr42.g0123456",
                "sourceVersion": "0.6.8-dev.pr42.g0123456",
                "tag": "v0.6.8-dev.pr42.g0123456",
                "channel": "dev",
                "assetName": INNER_ZIP_NAME,
                "sha256": sha256_hex(payload),
                "generatedAt": "2026-11-25T00:00:00Z"
            })),
        );
        assert_eq!(
            extract_and_verify_testing_artifact(&wrong_plugin, 42, VALID_SHA, &dir),
            Err("testing_artifact_invalid")
        );

        let _ = fs::remove_dir_all(&dir);
    }
}
