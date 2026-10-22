use crate::{http::Http, logging, matching, metadata};
use regex::Regex;
use serde_json::{Value, json};
use std::{
    collections::HashSet,
    path::{Path, PathBuf},
    sync::LazyLock,
    time::Duration,
};
use tokio_util::sync::CancellationToken;

pub const STEAM_TRACKER_DELISTED_URL: &str = "https://steam-tracker.com/apps/delisted";
pub const DELISTED_INDEX_TTL_SECONDS: i64 = 7 * 24 * 3600;
pub const DELISTED_INDEX_MAX_BYTES: usize = 30 * 1024 * 1024;
pub const DELISTED_INDEX_FILENAME: &str = "delisted_index.json";

static RX_DELISTED_APP: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)href='https://steam-tracker\.com/app/(\d+)/'[^>]*>\s*([^<]+?)\s*</a>")
        .expect("fixed Steam Tracker app regex")
});
static RX_NUMBERS: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\d+").expect("fixed decimal token regex"));

pub fn index_path(settings_dir: &Path) -> PathBuf {
    settings_dir.join(DELISTED_INDEX_FILENAME)
}

pub fn parse_delisted_html(html_text: &str) -> Vec<Value> {
    let mut rows = Vec::new();
    let mut seen = HashSet::new();
    for capture in RX_DELISTED_APP.captures_iter(html_text) {
        let Some(appid) = capture
            .get(1)
            .and_then(|value| matching::safe_int(&Value::String(value.as_str().to_owned())))
        else {
            continue;
        };
        let Some(raw_name) = capture.get(2) else {
            continue;
        };
        let name = matching::decode_html_entities(raw_name.as_str().trim()).into_owned();
        if appid == 0 || name.is_empty() || !seen.insert(appid) {
            continue;
        }
        rows.push(json!([appid, name]));
    }
    rows
}

fn log_warning(message: &str, fields: Value) {
    logging::event("steam", message, fields, log::Level::Warn);
}

async fn download_delisted_index(http: &Http) -> Option<Value> {
    let result = http
        .text(
            STEAM_TRACKER_DELISTED_URL,
            Duration::from_secs(30),
            DELISTED_INDEX_MAX_BYTES,
        )
        .await;
    let text = match result {
        Ok(text) => text,
        Err(error) => {
            log_warning("failed to download delisted index", json!({"error": error}));
            return None;
        }
    };
    let bytes = text.len();
    if bytes > DELISTED_INDEX_MAX_BYTES {
        log_warning(
            "delisted index download exceeded size cap",
            json!({"bytes": bytes, "max_bytes": DELISTED_INDEX_MAX_BYTES}),
        );
        return None;
    }
    let apps = parse_delisted_html(&text);
    if apps.len() < 100 {
        log_warning(
            "delisted index parse returned implausible count",
            json!({"count": apps.len()}),
        );
        return None;
    }
    Some(json!({
        "fetched_at": metadata::now(),
        "source": STEAM_TRACKER_DELISTED_URL,
        "apps": apps,
    }))
}

async fn save_delisted_index(
    path: &Path,
    index: &Value,
    cancel: &CancellationToken,
) -> Result<(), String> {
    let result = async {
        let parent = path
            .parent()
            .filter(|parent| !parent.as_os_str().is_empty())
            .unwrap_or(Path::new("."));
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|error| error.to_string())?;
        let bytes = serde_json::to_vec_pretty(index).map_err(|error| error.to_string())?;
        if cancel.is_cancelled() {
            return Err("backend stopping".to_owned());
        }
        let filename = path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or(DELISTED_INDEX_FILENAME);
        let temporary = path.with_file_name(format!("{filename}.tmp"));
        tokio::fs::write(&temporary, bytes)
            .await
            .map_err(|error| error.to_string())?;
        tokio::fs::rename(&temporary, path)
            .await
            .map_err(|error| error.to_string())
    }
    .await;
    if let Err(error) = &result {
        log_warning(
            "failed to save delisted index",
            json!({"path": path.display().to_string(), "error": error}),
        );
    }
    result.map_err(|error| error.to_string())
}

pub async fn load_delisted_index(path: &Path) -> Option<Value> {
    let payload: Value = serde_json::from_slice(&tokio::fs::read(path).await.ok()?).ok()?;
    let object = payload.as_object()?;
    let apps = object.get("apps")?.as_array()?;
    let mut cleaned_apps = Vec::new();
    for row in apps {
        let Some(row) = row.as_array().filter(|row| row.len() >= 2) else {
            continue;
        };
        let Some(appid) = matching::safe_int(&row[0]).filter(|appid| *appid != 0) else {
            continue;
        };
        let name = matching::clean_game_title(&metadata::text(&row[1]));
        if !name.is_empty() {
            cleaned_apps.push(json!([appid, name]));
        }
    }
    if cleaned_apps.is_empty() {
        return None;
    }
    let fetched_at =
        matching::safe_int(object.get("fetched_at").unwrap_or(&Value::Null)).unwrap_or(0);
    let source = {
        let source = metadata::text(object.get("source").unwrap_or(&Value::Null));
        if source.is_empty() {
            STEAM_TRACKER_DELISTED_URL.to_owned()
        } else {
            source
        }
    };
    Some(json!({"fetched_at":fetched_at,"source":source,"apps":cleaned_apps}))
}

fn valid_index(index: &Value) -> bool {
    index.is_object()
}

fn index_is_fresh(index: &Value) -> bool {
    if !valid_index(index) {
        return false;
    }
    let fetched_at = matching::safe_int(&index["fetched_at"]).unwrap_or(0);
    fetched_at != 0
        && i128::from(metadata::now()) - i128::from(fetched_at)
            < i128::from(DELISTED_INDEX_TTL_SECONDS)
}

fn stale_fallback(disk: Option<Value>, current: Option<&Value>) -> Option<Value> {
    disk.filter(valid_index)
        .or_else(|| current.filter(|index| valid_index(index)).cloned())
}

pub async fn ensure_delisted_index(
    http: &Http,
    current: Option<&Value>,
    path: &Path,
    force: bool,
) -> Option<Value> {
    if let Some(current) = current.filter(|index| valid_index(index)) {
        if !force && index_is_fresh(current) {
            return Some(current.clone());
        }
    }
    let disk = load_delisted_index(path).await;
    if let Some(disk) = disk.as_ref() {
        if !force && index_is_fresh(disk) {
            return Some(disk.clone());
        }
    }
    let downloaded = download_delisted_index(http).await;
    if let Some(downloaded) = downloaded {
        if http.cancel.is_cancelled() {
            return stale_fallback(disk, current);
        }
        match save_delisted_index(path, &downloaded, &http.cancel).await {
            Err(error) if error == "backend stopping" => return stale_fallback(disk, current),
            Err(_) | Ok(()) => return Some(downloaded),
        }
    }
    stale_fallback(disk, current)
}

pub fn resolve_delisted_appid_for_title(title: &str, apps: &Value) -> i64 {
    let Some(apps) = apps.as_array().filter(|apps| !apps.is_empty()) else {
        return 0;
    };
    let clean = matching::clean_game_title(title);
    if clean.is_empty() {
        return 0;
    }
    let query = matching::normalise_match_title(&clean);
    if query.is_empty() {
        return 0;
    }
    let query_numbers: HashSet<String> = RX_NUMBERS
        .find_iter(&query)
        .map(|number| number.as_str().to_owned())
        .collect();
    let mut best: Option<(i64, i64)> = None;
    for row in apps {
        let Some(row) = row.as_array().filter(|row| row.len() >= 2) else {
            continue;
        };
        let Some(appid) = matching::safe_int(&row[0]).filter(|appid| *appid != 0) else {
            continue;
        };
        let name = matching::clean_game_title(&metadata::text(&row[1]));
        if name.is_empty() {
            continue;
        }
        let candidate = matching::normalise_match_title(&name);
        if candidate.is_empty() || !matching::distinctive_tokens_present(&query, &candidate) {
            continue;
        }
        let mut score = if candidate == query {
            1000
        } else {
            let ratio = matching::sequence_ratio(&query, &candidate);
            if ratio < 0.72 {
                continue;
            }
            (ratio * 500.0) as i64
        };
        if matching::is_non_primary_steam_title(&name, &clean) {
            score -= 800;
        }
        let candidate_has_new_number = RX_NUMBERS
            .find_iter(&candidate)
            .any(|number| !query_numbers.contains(number.as_str()));
        if candidate_has_new_number {
            score -= 120;
        }
        if best.is_none_or(|(best_score, _)| score > best_score) {
            best = Some((score, appid));
        }
    }
    best.filter(|(score, _)| *score >= 300)
        .map_or(0, |(_, appid)| appid)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::http::Fixture;
    use std::sync::atomic::{AtomicU64, Ordering};

    static NEXT_DIR: AtomicU64 = AtomicU64::new(0);

    struct TempDir(PathBuf);
    impl TempDir {
        fn new() -> Self {
            let id = NEXT_DIR.fetch_add(1, Ordering::Relaxed);
            let path = std::env::temp_dir().join(format!(
                "metadata-delisted-provider-{}-{id}",
                std::process::id()
            ));
            std::fs::create_dir_all(&path).unwrap();
            Self(path)
        }
    }
    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    fn delisted_rows(count: usize) -> String {
        (0..count)
            .map(|index| {
                format!(
                    "<a href='https://steam-tracker.com/app/{}/'>Fixture Game {index}</a>",
                    500_000 + index
                )
            })
            .collect::<Vec<_>>()
            .join("\n")
    }

    #[test]
    fn delisted_parser_extracts_name_anchors_decodes_entities_and_deduplicates() {
        let html = "<a href='https://steam-tracker.com/app/338930/'> TRANSFORMERS: Devastation</a>\n<a href='https://steam-tracker.com/app/224060/'> Deadpool &amp; Friends</a>\n<a href='https://steam-tracker.com/app/338930/'>Duplicate</a>";
        assert_eq!(
            parse_delisted_html(html),
            vec![
                json!([338930, "TRANSFORMERS: Devastation"]),
                json!([224060, "Deadpool & Friends"]),
            ]
        );
    }

    #[tokio::test]
    async fn delisted_download_preserves_source_url_shape_and_one_hundred_row_minimum() {
        let html = format!(
            "<a href='https://steam-tracker.com/app/338930/'>TRANSFORMERS: Devastation</a>\n<a href='https://steam-tracker.com/app/224060/'>Deadpool &amp; Friends</a>\n{}",
            delisted_rows(98),
        );
        let http = Http::fixtures(vec![Fixture::text(STEAM_TRACKER_DELISTED_URL, &html)]);
        let index = download_delisted_index(&http).await.unwrap();
        assert_eq!(index["source"], STEAM_TRACKER_DELISTED_URL);
        assert_eq!(index["apps"].as_array().unwrap().len(), 100);
        assert_eq!(
            index["apps"][0],
            json!([338930, "TRANSFORMERS: Devastation"])
        );
        assert_eq!(index["apps"][1], json!([224060, "Deadpool & Friends"]));
        assert_eq!(index.as_object().unwrap().len(), 3);
        http.assert_drained();

        let http = Http::fixtures(vec![Fixture::text(
            STEAM_TRACKER_DELISTED_URL,
            &delisted_rows(99),
        )]);
        assert!(download_delisted_index(&http).await.is_none());
        http.assert_drained();
    }

    #[tokio::test]
    async fn delisted_download_rejects_payloads_over_thirty_mib() {
        let oversized = format!(
            "{}{}",
            delisted_rows(100),
            "x".repeat(DELISTED_INDEX_MAX_BYTES + 1)
        );
        let http = Http::fixtures(vec![Fixture::text(STEAM_TRACKER_DELISTED_URL, &oversized)]);
        assert!(download_delisted_index(&http).await.is_none());
        http.assert_drained();
    }

    #[tokio::test]
    async fn delisted_disk_load_normalizes_the_exact_index_shape() {
        let directory = TempDir::new();
        let path = directory.0.join(DELISTED_INDEX_FILENAME);
        tokio::fs::write(
            &path,
            r#"{"extra":true,"fetched_at":"1710000000","source":"","apps":[[338930," TRANSFORMERS: Devastation™ "],["bad","skip"],[0,"zero"],[224060,"Deadpool &amp; Friends", "extra"]]}"#.as_bytes(),
        )
        .await
        .unwrap();
        let index = load_delisted_index(&path).await.unwrap();
        assert_eq!(
            index,
            json!({
                "fetched_at":1710000000,
                "source":STEAM_TRACKER_DELISTED_URL,
                "apps":[[338930,"TRANSFORMERS: Devastation"],[224060,"Deadpool & Friends"]],
            })
        );
        tokio::fs::write(&path, b"not JSON").await.unwrap();
        assert!(load_delisted_index(&path).await.is_none());
        tokio::fs::write(&path, br#"{"apps":[]}"#).await.unwrap();
        assert!(load_delisted_index(&path).await.is_none());
    }

    #[test]
    fn delisted_resolver_matches_fuzzy_titles_and_rejects_misses() {
        let apps = json!([
            [338930, "TRANSFORMERS: Devastation"],
            [111, "Some Other Game"]
        ]);
        assert_eq!(
            resolve_delisted_appid_for_title("Transformers Devastation", &apps),
            338930
        );
        assert_eq!(resolve_delisted_appid_for_title("Halo Infinite", &apps), 0);
    }

    #[test]
    fn delisted_resolver_keeps_prototype_and_score_penalty_boundaries() {
        let prototype = json!([[700001, "Prototype"], [700002, "Prototype 2"]]);
        assert_eq!(
            resolve_delisted_appid_for_title("Prototype", &prototype),
            700001
        );
        assert_eq!(
            resolve_delisted_appid_for_title("Prototype", &json!([[700002, "Prototype 2"]])),
            700002
        );
        assert_eq!(
            resolve_delisted_appid_for_title(
                "Transformers Devastation",
                &json!([[338930, "TRANSFORMERS: Devastation Demo"]]),
            ),
            0
        );
        assert_eq!(
            resolve_delisted_appid_for_title("Prototype", &json!([[700003, "Prototype 4 5"]]),),
            0
        );
    }

    #[tokio::test]
    async fn delisted_cache_keeps_memory_and_disk_freshness_and_failure_priority() {
        let directory = TempDir::new();
        let path = directory.0.join(DELISTED_INDEX_FILENAME);
        let now = metadata::now();
        let fresh_memory = json!({"fetched_at":now,"source":"memory-fresh","apps":[[1,"Memory"]]});
        let no_requests = Http::fixtures(vec![]);
        assert_eq!(
            ensure_delisted_index(&no_requests, Some(&fresh_memory), &path, false).await,
            Some(fresh_memory.clone())
        );
        no_requests.assert_drained();

        let disk = json!({"fetched_at":now - DELISTED_INDEX_TTL_SECONDS - 1,"source":"disk-stale","apps":[[2,"Disk"]]});
        let memory = json!({"fetched_at":now - DELISTED_INDEX_TTL_SECONDS - 2,"source":"memory-stale","apps":[[3,"Memory"]]});
        tokio::fs::write(&path, serde_json::to_vec(&disk).unwrap())
            .await
            .unwrap();
        let http = Http::fixtures(vec![Fixture::failure(STEAM_TRACKER_DELISTED_URL)]);
        assert_eq!(
            ensure_delisted_index(&http, Some(&memory), &path, false).await,
            Some(json!({
                "fetched_at":disk["fetched_at"],"source":"disk-stale","apps":[[2,"Disk"]],
            }))
        );
        http.assert_drained();

        let fresh_disk = json!({"fetched_at":now - DELISTED_INDEX_TTL_SECONDS + 1,"source":"disk-fresh","apps":[[4,"Disk"]]});
        tokio::fs::write(&path, serde_json::to_vec(&fresh_disk).unwrap())
            .await
            .unwrap();
        let no_requests = Http::fixtures(vec![]);
        assert_eq!(
            ensure_delisted_index(&no_requests, Some(&memory), &path, false).await,
            Some(fresh_disk)
        );
        no_requests.assert_drained();
        let memory_only_path = directory
            .0
            .join("without-disk")
            .join(DELISTED_INDEX_FILENAME);
        let http = Http::fixtures(vec![Fixture::failure(STEAM_TRACKER_DELISTED_URL)]);
        assert_eq!(
            ensure_delisted_index(&http, Some(&memory), &memory_only_path, false).await,
            Some(memory)
        );
        http.assert_drained();
    }

    #[tokio::test]
    async fn delisted_cache_force_refresh_writes_atomically_and_cancelled_work_does_not_write() {
        let directory = TempDir::new();
        let path = directory.0.join(DELISTED_INDEX_FILENAME);
        let html = delisted_rows(100);
        let http = Http::fixtures(vec![Fixture::text(STEAM_TRACKER_DELISTED_URL, &html)]);
        let index = ensure_delisted_index(&http, None, &path, true)
            .await
            .unwrap();
        http.assert_drained();
        let stored: Value = serde_json::from_slice(&tokio::fs::read(&path).await.unwrap()).unwrap();
        assert_eq!(stored, index);
        assert!(
            !path
                .with_file_name(format!("{DELISTED_INDEX_FILENAME}.tmp"))
                .exists()
        );

        let cancelled_http = Http::new(CancellationToken::new(), "test").unwrap();
        cancelled_http.cancel.cancel();
        let cancelled_path = directory.0.join("cancelled").join(DELISTED_INDEX_FILENAME);
        assert!(
            ensure_delisted_index(&cancelled_http, None, &cancelled_path, true)
                .await
                .is_none()
        );
        assert!(!cancelled_path.exists());

        let token = CancellationToken::new();
        token.cancel();
        let direct_path = directory.0.join("direct").join(DELISTED_INDEX_FILENAME);
        assert_eq!(
            save_delisted_index(&direct_path, &index, &token)
                .await
                .unwrap_err(),
            "backend stopping"
        );
        assert!(!direct_path.exists());
        let blocked_path = directory.0.join("blocked-index");
        std::fs::create_dir(&blocked_path).unwrap();
        let http = Http::fixtures(vec![Fixture::text(STEAM_TRACKER_DELISTED_URL, &html)]);
        let refreshed = ensure_delisted_index(&http, None, &blocked_path, true)
            .await
            .unwrap();
        assert_eq!(refreshed["source"], STEAM_TRACKER_DELISTED_URL);
        assert!(blocked_path.is_dir());
        http.assert_drained();
    }
}
