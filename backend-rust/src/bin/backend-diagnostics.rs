use decky_metadata_backend::{
    http::{Http, RequestLog, RequestRecord},
    providers::{community, delisted, ign},
    updater::{
        discovery::{prevalidate_release_candidate, validate_release_candidate},
        models::{UpdateCandidate, parse_plugin_version},
    },
};
use reqwest::{Method, Url, header::CONTENT_TYPE};
use serde::Serialize;
use serde_json::{Value, json};
use std::{
    io::{self, Read, Write},
    process::{Child, Command, ExitCode, ExitStatus, Stdio},
    thread,
    time::{Duration, Instant},
};
use tokio_util::sync::CancellationToken;

const MEDIA_TIMEOUT: Duration = Duration::from_secs(12);
const GH_TIMEOUT: Duration = Duration::from_secs(60);
const GH_MAX_BYTES: usize = 32 * 1024 * 1024;
const GH_HEADER_MAX_BYTES: usize = 64 * 1024;
const GH_REPOSITORY: &str = "beallio/Decky-Metadata";
const GH_API: &str = "https://api.github.com";
const STEAM_COMMUNITY_APPID: i64 = 570;
const STORE_INPUT_MAX_BYTES: usize = 64 * 1024 * 1024;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum ProbeKind {
    IgnSearch,
    IgnMetadata,
    IgnTrailers,
    SteamCommunity,
    SteamTracker,
    GithubReleases,
    GithubReleaseAssets,
}

#[derive(Clone, Copy)]
struct ProbeDefinition {
    id: &'static str,
    name: &'static str,
    fixture: &'static str,
    kind: ProbeKind,
}

const PROBES: [ProbeDefinition; 7] = [
    ProbeDefinition {
        id: "ign-search",
        name: "IGN game search",
        fixture: "Bloodborne",
        kind: ProbeKind::IgnSearch,
    },
    ProbeDefinition {
        id: "ign-metadata",
        name: "IGN game metadata",
        fixture: "Hades",
        kind: ProbeKind::IgnMetadata,
    },
    ProbeDefinition {
        id: "ign-trailers",
        name: "IGN trailer discovery and MP4 delivery",
        fixture: "Deadpool and Bloodborne",
        kind: ProbeKind::IgnTrailers,
    },
    ProbeDefinition {
        id: "steam-community",
        name: "Steam Community screenshot cards",
        fixture: "Dota 2 (570), page 1",
        kind: ProbeKind::SteamCommunity,
    },
    ProbeDefinition {
        id: "steam-tracker",
        name: "Steam Tracker delisted index",
        fixture: "At least 100 games, including Metro 2033 (43110)",
        kind: ProbeKind::SteamTracker,
    },
    ProbeDefinition {
        id: "github-releases",
        name: "GitHub updater release discovery",
        fixture: "Latest published stable release",
        kind: ProbeKind::GithubReleases,
    },
    ProbeDefinition {
        id: "github-release-assets",
        name: "GitHub updater manifest and ZIP delivery",
        fixture: "Latest published stable release",
        kind: ProbeKind::GithubReleaseAssets,
    },
];

#[derive(Serialize)]
struct ErrorEnvelope {
    #[serde(rename = "type")]
    kind: String,
    message: String,
}

impl ErrorEnvelope {
    fn new(kind: &str, message: impl Into<String>) -> Self {
        Self {
            kind: kind.to_owned(),
            message: message.into(),
        }
    }
}

#[derive(Serialize)]
struct RequestEvidence {
    method: String,
    url: String,
    status: Option<u16>,
    content_type: String,
}

#[derive(Serialize)]
struct ProbeResult {
    id: &'static str,
    name: &'static str,
    fixture: &'static str,
    ok: bool,
    requests: Vec<RequestEvidence>,
    error: Option<ErrorEnvelope>,
}

impl ProbeResult {
    fn new(probe: ProbeDefinition) -> Self {
        Self {
            id: probe.id,
            name: probe.name,
            fixture: probe.fixture,
            ok: false,
            requests: Vec::new(),
            error: None,
        }
    }

    fn fail(&mut self, kind: &str, message: &str) {
        self.ok = false;
        self.error = Some(ErrorEnvelope::new(kind, message));
    }
}

enum NativeCommand {
    EndpointHealth { only: Option<Vec<String>> },
    IgnTrailers,
    CommunityFallback { appid: String, page: Option<String> },
}

fn parse_args(arguments: &[String]) -> Result<NativeCommand, &'static str> {
    let Some(command) = arguments.first().map(String::as_str) else {
        return Err("missing command");
    };
    match command {
        "endpoint-health" => {
            let mut only = Vec::new();
            let mut index = 1;
            while index < arguments.len() {
                if arguments[index] != "--only" || index + 1 == arguments.len() {
                    return Err("endpoint-health accepts repeated --only ID arguments");
                }
                let id = &arguments[index + 1];
                if !PROBES.iter().any(|probe| probe.id == id) {
                    return Err("unknown endpoint ID");
                }
                only.push(id.clone());
                index += 2;
            }
            Ok(NativeCommand::EndpointHealth {
                only: (!only.is_empty()).then_some(only),
            })
        }
        "ign-trailers" if arguments.len() == 1 => Ok(NativeCommand::IgnTrailers),
        "community-fallback" => {
            let mut appid = None;
            let mut page = None;
            let mut input = None;
            let mut index = 1;
            while index < arguments.len() {
                let option = arguments[index].as_str();
                if index + 1 == arguments.len() {
                    return Err("community-fallback options require values");
                }
                let value = &arguments[index + 1];
                let slot = match option {
                    "--appid" => &mut appid,
                    "--page" => &mut page,
                    "--input" => &mut input,
                    _ => return Err("unknown community-fallback option"),
                };
                if slot.replace(value.clone()).is_some() {
                    return Err("duplicate community-fallback option");
                }
                index += 2;
            }
            let appid = appid.ok_or("community-fallback requires --appid")?;
            if appid.parse::<i64>().ok().is_none_or(|value| value <= 0) {
                return Err("appid must be a positive integer");
            }
            if page.as_deref().is_some_and(|value| !integer_text(value)) {
                return Err("page must be an integer");
            }
            if input.as_deref() != Some("-") {
                return Err("community-fallback requires --input -");
            }
            Ok(NativeCommand::CommunityFallback { appid, page })
        }
        _ => Err("unknown command"),
    }
}

fn integer_text(value: &str) -> bool {
    let value = value.trim().as_bytes();
    let index = if value
        .first()
        .is_some_and(|byte| matches!(byte, b'+' | b'-'))
    {
        1
    } else {
        0
    };
    if index == value.len() {
        return false;
    }
    let mut previous_digit = false;
    for (offset, byte) in value[index..].iter().enumerate() {
        match byte {
            b'0'..=b'9' => previous_digit = true,
            b'_' if previous_digit
                && index + offset + 1 < value.len()
                && value[index + offset + 1].is_ascii_digit() =>
            {
                previous_digit = false
            }
            _ => return false,
        }
    }
    previous_digit
}

#[tokio::main]
async fn main() -> ExitCode {
    let arguments = std::env::args().skip(1).collect::<Vec<_>>();
    let command = match parse_args(&arguments) {
        Ok(command) => command,
        Err(message) => {
            eprintln!("backend-diagnostics: {message}");
            return ExitCode::from(2);
        }
    };
    match command {
        NativeCommand::EndpointHealth { only } => endpoint_health(only).await,
        NativeCommand::IgnTrailers => ign_trailers().await,
        NativeCommand::CommunityFallback { appid, page } => {
            community_fallback(&appid, page.as_deref()).await
        }
    }
}

async fn endpoint_health(only: Option<Vec<String>>) -> ExitCode {
    let mut results = Vec::with_capacity(PROBES.len());
    for probe in selected_probes(only.as_deref()) {
        results.push(run_probe(probe).await);
    }
    let status = probe_exit_code(&results);
    println!(
        "{}",
        serde_json::to_string(&results).expect("diagnostic results serialize")
    );
    status
}

fn selected_probes<'a>(only: Option<&'a [String]>) -> impl Iterator<Item = ProbeDefinition> + 'a {
    PROBES
        .into_iter()
        .filter(move |probe| only.is_none_or(|ids| ids.iter().any(|id| id == probe.id)))
}

fn probe_exit_code(results: &[ProbeResult]) -> ExitCode {
    if results.iter().any(|result| !result.ok) {
        ExitCode::from(1)
    } else {
        ExitCode::SUCCESS
    }
}

async fn run_probe(probe: ProbeDefinition) -> ProbeResult {
    let mut result = ProbeResult::new(probe);

    let (check, requests) = match probe.kind {
        ProbeKind::GithubReleases | ProbeKind::GithubReleaseAssets => {
            let requests = RequestLog::default();
            let check = match probe.kind {
                ProbeKind::GithubReleases => probe_github_releases(&requests),
                ProbeKind::GithubReleaseAssets => probe_github_release_assets(&requests),
                _ => unreachable!(),
            };
            (check, requests)
        }
        _ => {
            let (http, requests) =
                match Http::new_recording(CancellationToken::new(), env!("CARGO_PKG_VERSION")) {
                    Ok(value) => value,
                    Err(_) => {
                        result.fail("HttpError", "HTTP client initialization failed");
                        return result;
                    }
                };
            let check = match probe.kind {
                ProbeKind::IgnSearch => probe_ign_search(&http).await,
                ProbeKind::IgnMetadata => probe_ign_metadata(&http).await,
                ProbeKind::IgnTrailers => probe_ign_trailers(&http).await,
                ProbeKind::SteamCommunity => probe_steam_community(&http).await,
                ProbeKind::SteamTracker => probe_steam_tracker(&http).await,
                ProbeKind::GithubReleases | ProbeKind::GithubReleaseAssets => unreachable!(),
            };
            (check, requests)
        }
    };
    match request_evidence(&requests) {
        Ok(evidence) => result.requests = evidence,
        Err(_) => {
            result.fail(
                "DiagnosticsError",
                "HTTP request evidence could not be read",
            );
            return result;
        }
    }
    match check {
        Ok(()) => {
            result.ok = true;
            result.error = None;
        }
        Err((kind, message)) => result.fail(kind, &message),
    }
    result
}

async fn probe_ign_search(http: &Http) -> Result<(), (&'static str, String)> {
    let matches = ign::search_metadata(http, &json!("Bloodborne"), &json!(8))
        .await
        .map_err(|_| ("ProviderError", "IGN search request failed".to_owned()))?;
    if matches.iter().any(|result| {
        result["slug"].as_str() == Some("bloodborne")
            && result["title"].as_str() == Some("Bloodborne")
    }) {
        Ok(())
    } else {
        Err((
            "ContractError",
            "IGN search has no usable Bloodborne match".to_owned(),
        ))
    }
}

async fn probe_ign_metadata(http: &Http) -> Result<(), (&'static str, String)> {
    let Some(metadata) = ign::fetch_metadata(http, "hades")
        .await
        .map_err(|_| ("ProviderError", "IGN metadata request failed".to_owned()))?
    else {
        return Err(("ContractError", "IGN Hades metadata is missing".to_owned()));
    };
    let nonempty = |value: &Value| value.as_str().is_some_and(|text| !text.trim().is_empty());
    if metadata["title"].as_str() != Some("Hades") {
        return Err((
            "ContractError",
            "IGN Hades metadata has no matching title".to_owned(),
        ));
    }
    if !nonempty(&metadata["description"]) && !nonempty(&metadata["short_description"]) {
        return Err((
            "ContractError",
            "IGN Hades metadata has no usable description".to_owned(),
        ));
    }
    for key in ["developers", "publishers"] {
        if !metadata[key]
            .as_array()
            .is_some_and(|rows| rows.iter().any(|row| nonempty(&row["name"])))
        {
            return Err((
                "ContractError",
                format!("IGN Hades metadata has no usable {key}"),
            ));
        }
    }
    if !metadata["screenshots"].as_array().is_some_and(|rows| {
        rows.iter().any(|row| {
            row["url"]
                .as_str()
                .is_some_and(|url| url.starts_with("https://"))
        })
    }) {
        return Err((
            "ContractError",
            "IGN Hades metadata has no usable screenshots".to_owned(),
        ));
    }
    Ok(())
}

async fn probe_ign_trailers(http: &Http) -> Result<(), (&'static str, String)> {
    check_ign_trailer(http, "Deadpool", Some("https://www.ign.com/games/deadpool")).await?;
    check_ign_trailer(http, "Bloodborne", None).await?;
    Ok(())
}

async fn check_ign_trailer(
    http: &Http,
    title: &str,
    game_url: Option<&str>,
) -> Result<String, (&'static str, String)> {
    let Some(result) = ign::find_trailer(http, title, game_url).await else {
        return Err((
            "ContractError",
            format!("{title}: no verified IGN game trailer was found"),
        ));
    };
    let mut candidates = result["candidates"]
        .as_array()
        .into_iter()
        .flatten()
        .collect::<Vec<_>>();
    candidates.sort_by_key(|candidate| candidate["height"].as_i64().unwrap_or(0).abs_diff(720));
    candidates.truncate(4);
    if candidates.is_empty() {
        return Err((
            "ContractError",
            format!("{title}: no verified IGN MP4 candidate was found"),
        ));
    }
    let name = result["name"].as_str().unwrap_or(title);
    let candidate_count = candidates.len();
    let mut last_error = "request failed";
    for candidate in &candidates {
        let height = candidate["height"].as_i64().unwrap_or(0);
        let Some(raw_url) = candidate["url"].as_str() else {
            continue;
        };
        let Some(url) = ign::canonical_mp4_url(raw_url) else {
            last_error = "invalid MP4 URL";
            continue;
        };
        match inspect_mp4(http, &url).await {
            Ok(()) => return Ok(redact(&format!("{title}: {name} ({height}p MP4)"))),
            Err(error) => last_error = error,
        }
    }
    Err((
        "ContractError",
        format!(
            "{title}: no accessible IGN MP4 ({candidate_count} qualities; last error: {last_error})"
        ),
    ))
}

async fn inspect_mp4(http: &Http, url: &str) -> Result<(), &'static str> {
    let response = http
        .get_prefix_following_ign_mp4(
            url,
            &[
                ("Range", "bytes=0-31"),
                ("Origin", "https://steamloopback.host"),
            ],
            MEDIA_TIMEOUT,
            32,
        )
        .await
        .map_err(|_| "request failed")?;
    let content_type = response
        .headers
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default();
    validate_mp4_response(response.status, content_type, &response.body)
}

fn validate_mp4_response(status: u16, content_type: &str, body: &[u8]) -> Result<(), &'static str> {
    if !matches!(status, 200 | 206) {
        return Err("request returned an HTTP error");
    }
    if !content_type
        .split(';')
        .next()
        .unwrap_or_default()
        .trim()
        .eq_ignore_ascii_case("video/mp4")
    {
        return Err("response is not video/mp4");
    }
    if body.len() < 12 || body.get(4..8) != Some(b"ftyp") {
        return Err("MP4 header is invalid");
    }
    Ok(())
}

async fn probe_steam_community(http: &Http) -> Result<(), (&'static str, String)> {
    let items = community::fetch_steam_fallback_items(http, STEAM_COMMUNITY_APPID, 1)
        .await
        .map_err(|_| ("ProviderError", "Steam Community request failed".to_owned()))?;
    if items.is_empty() {
        return Err((
            "ContractError",
            "Steam Community has no usable screenshot cards".to_owned(),
        ));
    }
    if items.iter().any(|item| {
        !item["id"].as_str().is_some_and(|value| !value.is_empty())
            || !item["image_url"]
                .as_str()
                .is_some_and(|value| value.starts_with("https://"))
            || !item["link"]
                .as_str()
                .is_some_and(|value| value.starts_with("https://"))
    }) {
        return Err((
            "ContractError",
            "Steam Community cards lack safe id/image/link fields".to_owned(),
        ));
    }
    Ok(())
}

async fn probe_steam_tracker(http: &Http) -> Result<(), (&'static str, String)> {
    let html = http
        .text(
            delisted::STEAM_TRACKER_DELISTED_URL,
            Duration::from_secs(30),
            delisted::DELISTED_INDEX_MAX_BYTES,
        )
        .await
        .map_err(|_| ("ProviderError", "Steam Tracker request failed".to_owned()))?;
    let rows = delisted::parse_delisted_html(&html);
    if rows.len() < 100 {
        return Err((
            "ContractError",
            "Steam Tracker returned fewer than 100 delisted games".to_owned(),
        ));
    }
    if !rows.iter().any(|row| {
        row[0].as_i64() == Some(43110)
            && row[1].as_str().is_some_and(|name| !name.trim().is_empty())
    }) {
        return Err((
            "ContractError",
            "Steam Tracker has no usable Metro 2033 fixture".to_owned(),
        ));
    }
    Ok(())
}

fn probe_github_releases(requests: &RequestLog) -> Result<(), (&'static str, String)> {
    let release = latest_stable_release(requests)?;
    let prevalidated = prevalidate_release_candidate(&release).ok_or((
        "ContractError",
        "Latest stable release lacks updater assets".to_owned(),
    ))?;
    let tag = prevalidated.tag_name.clone();
    let path = format!(
        "repos/{GH_REPOSITORY}/releases/tags/{}",
        encode_path_segment(&tag)
    );
    let tagged = gh_json(&path, "application/vnd.github+json", GH_MAX_BYTES, requests)?;
    if tagged["tag_name"].as_str() != Some(tag.as_str())
        || prevalidate_release_candidate(&tagged).is_none()
    {
        return Err((
            "ContractError",
            "GitHub tagged release does not satisfy updater discovery".to_owned(),
        ));
    }
    Ok(())
}

fn probe_github_release_assets(requests: &RequestLog) -> Result<(), (&'static str, String)> {
    let release = latest_stable_release(requests)?;
    let prevalidated = prevalidate_release_candidate(&release).ok_or((
        "ContractError",
        "Latest stable release lacks updater assets".to_owned(),
    ))?;
    let manifest_asset = bounded_asset(prevalidated.manifest_asset, 1024 * 1024)?;
    let zip_asset = bounded_asset(prevalidated.zip_asset, GH_MAX_BYTES)?;
    let manifest_path = format!(
        "repos/{GH_REPOSITORY}/releases/assets/{}",
        manifest_asset.id
    );
    let manifest_bytes = gh_bytes(
        &manifest_path,
        "application/octet-stream",
        manifest_asset.size,
        requests,
    )?;
    let manifest: Value = serde_json::from_slice(&manifest_bytes).map_err(|_| {
        (
            "ContractError",
            "GitHub updater manifest is not valid JSON".to_owned(),
        )
    })?;
    let candidate = validate_release_candidate(&release, &manifest).ok_or((
        "ContractError",
        "GitHub updater manifest identity/version/tag/channel/asset/SHA contract is invalid"
            .to_owned(),
    ))?;
    let zip_path = format!("repos/{GH_REPOSITORY}/releases/assets/{}", zip_asset.id);
    let archive = gh_bytes(
        &zip_path,
        "application/octet-stream",
        zip_asset.size,
        requests,
    )?;
    verify_archive(&archive, &candidate)
}

fn latest_stable_release(requests: &RequestLog) -> Result<Value, (&'static str, String)> {
    let releases = gh_json(
        &format!("repos/{GH_REPOSITORY}/releases?per_page=100"),
        "application/vnd.github+json",
        GH_MAX_BYTES,
        requests,
    )?;
    latest_stable_release_from(&releases).ok_or((
        "ContractError",
        "GitHub releases has no published stable semver release".to_owned(),
    ))
}

fn latest_stable_release_from(releases: &Value) -> Option<Value> {
    let mut latest: Option<(
        decky_metadata_backend::updater::models::ParsedPluginVersion,
        &Value,
    )> = None;
    for release in releases.as_array()?.iter().filter(|release| {
        !release["draft"].as_bool().unwrap_or(false)
            && !release["prerelease"].as_bool().unwrap_or(false)
    }) {
        let Some(tag) = release["tag_name"]
            .as_str()
            .and_then(|tag| tag.strip_prefix('v'))
        else {
            continue;
        };
        let Some(version) = parse_plugin_version(tag).filter(|version| !version.is_dev) else {
            continue;
        };
        if latest
            .as_ref()
            .is_none_or(|(current, _)| version.cmp(current).is_gt())
        {
            latest = Some((version, release));
        }
    }
    latest.map(|(_, release)| release.clone())
}

struct BoundedAsset {
    id: u64,
    size: usize,
}

fn bounded_asset(asset: &Value, maximum: usize) -> Result<BoundedAsset, (&'static str, String)> {
    let id = asset["id"].as_u64().filter(|id| *id > 0).ok_or((
        "ContractError",
        "GitHub release asset has no valid ID".to_owned(),
    ))?;
    let size = asset["size"]
        .as_u64()
        .filter(|size| *size > 0 && *size <= maximum as u64)
        .ok_or((
            "ContractError",
            "GitHub release asset exceeds its bounded size".to_owned(),
        ))?;
    Ok(BoundedAsset {
        id,
        size: size as usize,
    })
}

fn gh_json(
    path: &str,
    accept: &str,
    maximum: usize,
    requests: &RequestLog,
) -> Result<Value, (&'static str, String)> {
    let body = gh_bytes(path, accept, maximum, requests)?;
    serde_json::from_slice(&body).map_err(|_| {
        (
            "ContractError",
            "GitHub response is not valid JSON".to_owned(),
        )
    })
}

fn gh_bytes(
    path: &str,
    accept: &str,
    maximum: usize,
    requests: &RequestLog,
) -> Result<Vec<u8>, (&'static str, String)> {
    let url = format!("{GH_API}/{path}");
    let arguments = [
        "api".to_owned(),
        "--include".to_owned(),
        "--header".to_owned(),
        format!("Accept: {accept}"),
        "--header".to_owned(),
        "X-GitHub-Api-Version: 2022-11-28".to_owned(),
        path.to_owned(),
    ];
    let output = match run_gh(&arguments, maximum.saturating_add(GH_HEADER_MAX_BYTES)) {
        Ok(output) => output,
        Err(message) => return Err(("GitHubError", message.to_owned())),
    };
    let response = match parse_gh_response(output.stdout, maximum) {
        Ok(response) => response,
        Err(message) => {
            record_request(requests, "GET", &url, None, "")?;
            return Err(("GitHubError", message.to_owned()));
        }
    };
    record_request(
        requests,
        "GET",
        &url,
        Some(response.status),
        &response.content_type,
    )?;
    if !output.status.success() || response.status != 200 {
        return Err((
            "GitHubError",
            format!("GitHub CLI request failed with HTTP {}", response.status),
        ));
    }
    Ok(response.body)
}

struct GhOutput {
    status: ExitStatus,
    stdout: Vec<u8>,
}

fn run_gh(arguments: &[String], maximum: usize) -> Result<GhOutput, &'static str> {
    let mut child = Command::new("gh")
        .args(arguments)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|_| "GitHub CLI is unavailable")?;
    let Some(stdout) = child.stdout.take() else {
        stop_child(&mut child);
        return Err("GitHub CLI output is unavailable");
    };
    let reader = thread::spawn(move || read_limited(stdout, maximum));
    let deadline = Instant::now() + GH_TIMEOUT;
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if Instant::now() < deadline => thread::sleep(Duration::from_millis(20)),
            Ok(None) => {
                stop_child(&mut child);
                let _ = reader.join();
                return Err("GitHub CLI request timed out");
            }
            Err(_) => {
                stop_child(&mut child);
                let _ = reader.join();
                return Err("GitHub CLI request failed");
            }
        }
    };
    let stdout = reader
        .join()
        .map_err(|_| "GitHub CLI output failed")?
        .map_err(|_| "GitHub CLI output failed")?;
    if stdout.len() > maximum {
        return Err("GitHub response exceeds its bounded read limit");
    }
    Ok(GhOutput { status, stdout })
}

fn read_limited<R: Read>(reader: R, maximum: usize) -> io::Result<Vec<u8>> {
    let mut bytes = Vec::with_capacity(maximum.min(64 * 1024));
    reader
        .take(maximum.saturating_add(1) as u64)
        .read_to_end(&mut bytes)?;
    Ok(bytes)
}

fn stop_child(child: &mut Child) {
    let _ = child.kill();
    let _ = child.wait();
}

struct GhResponse {
    status: u16,
    content_type: String,
    body: Vec<u8>,
}

fn parse_gh_response(mut output: Vec<u8>, maximum: usize) -> Result<GhResponse, &'static str> {
    let (separator, separator_len) =
        if let Some(index) = output.windows(4).position(|bytes| bytes == b"\r\n\r\n") {
            (index, 4)
        } else if let Some(index) = output.windows(2).position(|bytes| bytes == b"\n\n") {
            (index, 2)
        } else {
            return Err("GitHub CLI returned no HTTP headers");
        };
    if separator > GH_HEADER_MAX_BYTES {
        return Err("GitHub HTTP headers exceed their bound");
    }
    let headers =
        std::str::from_utf8(&output[..separator]).map_err(|_| "GitHub HTTP headers are invalid")?;
    let status = headers
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .and_then(|value| value.parse::<u16>().ok())
        .filter(|status| (100..=599).contains(status))
        .ok_or("GitHub HTTP status is invalid")?;
    let content_type = headers
        .lines()
        .skip(1)
        .find_map(|line| {
            let (name, value) = line.split_once(':')?;
            name.eq_ignore_ascii_case("content-type").then(|| {
                value
                    .trim()
                    .split(';')
                    .next()
                    .unwrap_or_default()
                    .to_owned()
            })
        })
        .unwrap_or_default();
    let body = output.split_off(separator + separator_len);
    if body.len() > maximum {
        return Err("GitHub response exceeds its bounded read limit");
    }
    Ok(GhResponse {
        status,
        content_type,
        body,
    })
}

fn encode_path_segment(value: &str) -> String {
    let mut encoded = String::with_capacity(value.len());
    for byte in value.bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'.' | b'_' | b'~') {
            encoded.push(char::from(byte));
        } else {
            encoded.push_str(&format!("%{byte:02X}"));
        }
    }
    encoded
}

fn verify_archive(
    archive: &[u8],
    candidate: &UpdateCandidate,
) -> Result<(), (&'static str, String)> {
    if !archive.starts_with(b"PK\x03\x04") {
        return Err((
            "ContractError",
            "GitHub updater asset is not a ZIP file".to_owned(),
        ));
    }
    let actual = sha256(archive).map_err(|message| ("DiagnosticsError", message.to_owned()))?;
    if actual.eq_ignore_ascii_case(&candidate.sha256) {
        Ok(())
    } else {
        Err((
            "ContractError",
            "GitHub updater ZIP SHA-256 does not match the manifest".to_owned(),
        ))
    }
}

fn sha256(bytes: &[u8]) -> Result<String, &'static str> {
    let mut child = Command::new("sha256sum")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|_| "SHA-256 utility is unavailable")?;
    child
        .stdin
        .take()
        .ok_or("SHA-256 input is unavailable")?
        .write_all(bytes)
        .map_err(|_| "SHA-256 calculation failed")?;
    let output = child
        .wait_with_output()
        .map_err(|_| "SHA-256 calculation failed")?;
    if !output.status.success() {
        return Err("SHA-256 calculation failed");
    }
    let digest = std::str::from_utf8(&output.stdout)
        .ok()
        .and_then(|line| line.split_whitespace().next())
        .filter(|digest| digest.len() == 64 && digest.bytes().all(|byte| byte.is_ascii_hexdigit()))
        .ok_or("SHA-256 utility returned an invalid digest")?;
    Ok(digest.to_ascii_lowercase())
}

fn record_request(
    requests: &RequestLog,
    method: &str,
    url: &str,
    status: Option<u16>,
    content_type: &str,
) -> Result<(), (&'static str, String)> {
    let mut entries = requests.lock().map_err(|_| {
        (
            "DiagnosticsError",
            "HTTP request evidence is unavailable".to_owned(),
        )
    })?;
    entries.push(RequestRecord {
        method: method.to_owned(),
        url: url.to_owned(),
        status,
        content_type: content_type.to_owned(),
    });
    Ok(())
}

fn request_evidence(requests: &RequestLog) -> Result<Vec<RequestEvidence>, &'static str> {
    let requests = requests
        .lock()
        .map_err(|_| "request evidence is unavailable")?;
    Ok(requests
        .iter()
        .map(|request| RequestEvidence {
            method: redact(&request.method),
            url: safe_url(&request.url),
            status: request.status,
            content_type: redact(
                request
                    .content_type
                    .split(';')
                    .next()
                    .unwrap_or_default()
                    .trim(),
            ),
        })
        .collect())
}

fn safe_url(value: &str) -> String {
    let Ok(mut url) = Url::parse(value) else {
        return "[invalid URL]".to_owned();
    };
    let _ = url.set_username("");
    let _ = url.set_password(None);
    url.set_fragment(None);
    let pairs = url
        .query_pairs()
        .map(|(key, value)| {
            let sensitive = key.to_ascii_lowercase();
            let secret = [
                "token",
                "key",
                "secret",
                "password",
                "signature",
                "credential",
            ]
            .iter()
            .any(|needle| sensitive.contains(needle));
            (
                key.into_owned(),
                if secret {
                    "[REDACTED]".to_owned()
                } else {
                    redact(&value)
                },
            )
        })
        .collect::<Vec<_>>();
    url.set_query(None);
    if !pairs.is_empty() {
        let mut query = url.query_pairs_mut();
        for (key, value) in pairs {
            query.append_pair(&key, &value);
        }
    }
    redact(&url.to_string())
}

fn redact(value: &str) -> String {
    let mut result = value.to_owned();
    for (name, secret) in std::env::vars() {
        if secret.len() >= 6
            && ["TOKEN", "PASSWORD", "SECRET", "API_KEY"]
                .iter()
                .any(|part| name.to_ascii_uppercase().contains(part))
        {
            result = result.replace(&secret, "[REDACTED]");
        }
    }
    result
}

async fn ign_trailers() -> ExitCode {
    #[derive(Serialize)]
    struct ResultValue {
        checked: Vec<String>,
        error: Option<ErrorEnvelope>,
    }
    let (http, _) = match Http::new_recording(CancellationToken::new(), env!("CARGO_PKG_VERSION")) {
        Ok(value) => value,
        Err(_) => {
            println!(
                "{}",
                serde_json::to_string(&ResultValue {
                    checked: Vec::new(),
                    error: Some(ErrorEnvelope::new(
                        "HttpError",
                        "HTTP client initialization failed"
                    )),
                })
                .expect("trailer result serializes")
            );
            return ExitCode::from(1);
        }
    };
    let mut checked = Vec::new();
    let mut error = None;
    for (title, game_url) in [
        ("Deadpool", Some("https://www.ign.com/games/deadpool")),
        ("Bloodborne", None),
    ] {
        match check_ign_trailer(&http, title, game_url).await {
            Ok(summary) => checked.push(summary),
            Err((kind, message)) => {
                error = Some(ErrorEnvelope::new(kind, message));
                break;
            }
        }
    }
    let ok = error.is_none();
    println!(
        "{}",
        serde_json::to_string(&ResultValue { checked, error }).expect("trailer result serializes")
    );
    if ok {
        ExitCode::SUCCESS
    } else {
        ExitCode::from(1)
    }
}

#[derive(Serialize)]
struct AppSummary {
    appid: String,
    title: Value,
    source: Value,
    steam_appid: Value,
    screenshot_count: usize,
    source_url: Value,
}

#[derive(Serialize)]
struct CommunityPage {
    page: i64,
    items: Vec<Value>,
}

#[derive(Serialize)]
struct CommunityReport {
    app: AppSummary,
    pages: Vec<CommunityPage>,
}

async fn community_fallback(appid: &str, page: Option<&str>) -> ExitCode {
    let mut input = Vec::new();
    if io::stdin()
        .take((STORE_INPUT_MAX_BYTES + 1) as u64)
        .read_to_end(&mut input)
        .is_err()
        || input.len() > STORE_INPUT_MAX_BYTES
    {
        eprintln!("backend-diagnostics: metadata input exceeds its bounded read limit");
        return ExitCode::from(1);
    }
    let store: Value = match serde_json::from_slice(&input) {
        Ok(store) => store,
        Err(_) => {
            eprintln!("backend-diagnostics: metadata input is not valid JSON");
            return ExitCode::from(1);
        }
    };
    let Some(record) = store
        .get("metadata")
        .and_then(Value::as_object)
        .and_then(|rows| rows.get(appid))
        .filter(|record| record.is_object())
    else {
        eprintln!("backend-diagnostics: metadata record is missing for appid {appid}");
        return ExitCode::from(1);
    };
    let http = match Http::new(CancellationToken::new(), env!("CARGO_PKG_VERSION")) {
        Ok(value) => value,
        Err(_) => {
            eprintln!("backend-diagnostics: HTTP client initialization failed");
            return ExitCode::from(1);
        }
    };
    let pages = match page {
        Some(value) => vec![community::clamp_page(&Value::String(value.to_owned()))],
        None => vec![1, 2],
    };
    let mut results = Vec::with_capacity(pages.len());
    for requested_page in pages {
        let fallback = community::fallback_page(&http, Some(record), &json!(requested_page)).await;
        let page = fallback["page"].as_i64().unwrap_or(requested_page);
        let items = fallback["items"].as_array().cloned().unwrap_or_default();
        results.push(CommunityPage { page, items });
    }
    let screenshots = record["screenshots"].as_array().map_or(0, Vec::len);
    let report = CommunityReport {
        app: AppSummary {
            appid: appid.to_owned(),
            title: record.get("title").cloned().unwrap_or(Value::Null),
            source: record.get("source").cloned().unwrap_or(Value::Null),
            steam_appid: record.get("steam_appid").cloned().unwrap_or(Value::Null),
            screenshot_count: screenshots,
            source_url: record.get("source_url").cloned().unwrap_or(Value::Null),
        },
        pages: results,
    };
    println!(
        "{}",
        serde_json::to_string(&report).expect("community result serializes")
    );
    ExitCode::SUCCESS
}

#[cfg(test)]
mod tests {
    use super::*;

    fn release() -> Value {
        json!({
            "tag_name": "v1.2.3",
            "draft": false,
            "prerelease": false,
            "published_at": "2026-01-01T00:00:00Z",
            "html_url": "https://github.com/beallio/Decky-Metadata/releases/tag/v1.2.3",
            "assets": [
                {"id": 1, "size": 200, "name": "Decky-Metadata-v1.2.3.manifest.json", "browser_download_url": "https://github.com/manifest"},
                {"id": 2, "size": 12, "name": "Decky-Metadata.zip", "browser_download_url": "https://github.com/archive"}
            ]
        })
    }

    fn manifest() -> Value {
        json!({
            "schemaVersion": 1,
            "pluginName": "Decky Metadata",
            "packageName": "decky-metadata",
            "version": "1.2.3",
            "sourceVersion": "1.2.3",
            "tag": "v1.2.3",
            "channel": "stable",
            "assetName": "Decky-Metadata.zip",
            "sha256": "0".repeat(64),
            "generatedAt": "2026-01-01T00:00:00Z"
        })
    }

    #[test]
    fn endpoint_results_keep_catalog_order_and_exit_envelopes() {
        let selected = vec!["github-release-assets".to_owned(), "ign-search".to_owned()];
        assert_eq!(
            selected_probes(Some(&selected))
                .map(|probe| probe.id)
                .collect::<Vec<_>>(),
            vec!["ign-search", "github-release-assets"]
        );

        let mut passed = ProbeResult::new(PROBES[0]);
        passed.ok = true;
        assert_eq!(
            serde_json::to_value(&passed).unwrap(),
            json!({
                "id": "ign-search", "name": "IGN game search", "fixture": "Bloodborne",
                "ok": true, "requests": [], "error": null
            })
        );
        assert_eq!(probe_exit_code(&[passed]), ExitCode::SUCCESS);

        let mut failed = ProbeResult::new(PROBES[0]);
        failed.fail("ProviderError", "request failed");
        assert_eq!(failed.error.as_ref().unwrap().kind, "ProviderError");
        assert_eq!(probe_exit_code(&[failed]), ExitCode::from(1));
    }

    #[test]
    fn updater_release_validation_rejects_tampered_identity_and_assets() {
        let release = release();
        assert!(validate_release_candidate(&release, &manifest()).is_some());
        let mut mismatched = manifest();
        mismatched["tag"] = json!("v9.9.9");
        assert!(validate_release_candidate(&release, &mismatched).is_none());
        let mut duplicated = release.clone();
        duplicated["assets"].as_array_mut().unwrap().push(json!({
            "id": 3, "size": 100, "name": "Decky-Metadata-v1.2.3.manifest.json"
        }));
        assert!(prevalidate_release_candidate(&duplicated).is_none());
    }

    #[test]
    fn native_commands_reject_unknown_and_malformed_arguments() {
        assert!(parse_args(&[]).is_err());
        assert!(
            parse_args(&["endpoint-health".into(), "--only".into(), "unknown".into()]).is_err()
        );
        assert!(parse_args(&["ign-trailers".into(), "--extra".into()]).is_err());
        assert!(
            parse_args(&[
                "community-fallback".into(),
                "--appid".into(),
                "0".into(),
                "--input".into(),
                "-".into()
            ])
            .is_err()
        );
        assert!(
            parse_args(&[
                "community-fallback".into(),
                "--appid".into(),
                "12".into(),
                "--page".into(),
                "bad".into(),
                "--input".into(),
                "-".into()
            ])
            .is_err()
        );
    }

    #[test]
    fn github_response_parser_extracts_headers_and_enforces_bounds() {
        let response = parse_gh_response(
            b"HTTP/1.1 200 OK\r\nContent-Type: application/json; charset=utf-8\r\n\r\n{}".to_vec(),
            2,
        )
        .unwrap();
        assert_eq!(response.status, 200);
        assert_eq!(response.content_type, "application/json");
        assert_eq!(response.body, b"{}");
        assert!(
            parse_gh_response(
                b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n{}!".to_vec(),
                2,
            )
            .is_err()
        );
        let mut oversized = b"HTTP/1.1 200 OK\r\n".to_vec();
        oversized.extend(std::iter::repeat_n(b'x', GH_HEADER_MAX_BYTES));
        oversized.extend_from_slice(b"\r\n\r\n{}");
        assert!(parse_gh_response(oversized, 2).is_err());
    }

    #[test]
    fn newest_stable_release_uses_production_version_ordering() {
        let releases = json!([
            {"tag_name":"v1.2.0","draft":false,"prerelease":false},
            {"tag_name":"v1.10.0","draft":false,"prerelease":false},
            {"tag_name":"v9.0.0","draft":false,"prerelease":true},
            {"tag_name":"v8.0.0","draft":true,"prerelease":false}
        ]);
        assert_eq!(
            latest_stable_release_from(&releases).unwrap()["tag_name"],
            "v1.10.0"
        );
    }

    #[test]
    fn page_cli_uses_production_clamping_without_integer_overflow() {
        assert_eq!(
            community::clamp_page(&Value::String("999999999999999999999".into())),
            100
        );
        assert_eq!(community::clamp_page(&Value::String("-3".into())), 1);
        assert!(!integer_text("1__0"));
        assert!(integer_text("1_000"));
    }

    #[test]
    fn url_evidence_redacts_userinfo_and_credential_query_values() {
        let value = safe_url(
            "https://user:password@service.example/a?access_token=private&term=Hades&signature=hidden#fragment",
        );
        assert!(!value.contains("user:"));
        assert!(!value.contains("password"));
        assert!(!value.contains("private"));
        assert!(!value.contains("hidden"));
        assert!(value.contains("term=Hades"));
    }

    #[test]
    fn mp4_delivery_requires_video_content_and_a_real_ftyp_header() {
        let valid = b"\x00\x00\x00\x18ftypisom\x00\x00\x00\x00isom";
        assert!(validate_mp4_response(206, "video/mp4; charset=binary", valid).is_ok());
        assert!(validate_mp4_response(200, "video/mp4", valid).is_ok());
        assert!(validate_mp4_response(404, "video/mp4", valid).is_err());
        assert!(validate_mp4_response(206, "text/html", valid).is_err());
        assert!(validate_mp4_response(206, "video/mp4", b"<html>blocked</html>").is_err());
    }

    #[test]
    fn updater_archive_integrity_rejects_a_wrong_manifest_digest() {
        let candidate = validate_release_candidate(&release(), &manifest()).unwrap();
        assert!(verify_archive(b"PK\x03\x04not-a-real-zip", &candidate).is_err());
    }
}
