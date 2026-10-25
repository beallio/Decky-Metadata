use crate::{logging, matching, metadata, providers::delisted, state::AppState};
use serde_json::{Number, Value, json};
use std::sync::Arc;
use tokio::{sync::Mutex, task::JoinHandle};

pub struct Jobs {
    metadata: Mutex<PipelineJob>,
    activity: Mutex<PipelineJob>,
}

impl Jobs {
    pub fn new() -> Self {
        Self {
            metadata: Mutex::new(PipelineJob::new()),
            activity: Mutex::new(PipelineJob::new()),
        }
    }

    pub async fn drain(&self) {
        let (metadata, activity) =
            tokio::join!(take_job(&self.metadata), take_job(&self.activity),);
        let _ = tokio::join!(wait_job(metadata), wait_job(activity));
    }
}

struct PipelineJob {
    progress: Value,
    task: Option<JoinHandle<()>>,
}

impl PipelineJob {
    fn new() -> Self {
        Self {
            progress: new_progress("idle"),
            task: None,
        }
    }
}

async fn take_job(job: &Mutex<PipelineJob>) -> Option<JoinHandle<()>> {
    job.lock().await.task.take()
}

async fn wait_job(job: Option<JoinHandle<()>>) {
    if let Some(job) = job {
        let _ = job.await;
    }
}

#[derive(Clone, Copy)]
enum Pipeline {
    Metadata,
    Activity,
}

fn pipeline_job(state: &AppState, pipeline: Pipeline) -> &Mutex<PipelineJob> {
    match pipeline {
        Pipeline::Metadata => &state.jobs.metadata,
        Pipeline::Activity => &state.jobs.activity,
    }
}

fn new_progress(status: &str) -> Value {
    json!({
        "running": status == "running",
        "status": status,
        "total": 0,
        "completed": 0,
        "assigned": 0,
        "failed": 0,
        "current": "",
        "message": "",
        "error": "",
    })
}

async fn start(state: Arc<AppState>, games: &Value, pipeline: Pipeline) -> Result<Value, String> {
    if state.cancel.is_cancelled() {
        return Err("backend stopping".into());
    }
    let mut job = pipeline_job(&state, pipeline).lock().await;
    if state.cancel.is_cancelled() {
        return Err("backend stopping".into());
    }
    if job.task.as_ref().is_some_and(|task| !task.is_finished()) {
        return Ok(job.progress.clone());
    }
    let games = game_inputs(games)?;
    // A target-load failure rejects the start instead of reporting an empty completed run.
    let targets = match pipeline {
        Pipeline::Metadata => metadata_targets(&state, &games).await?,
        Pipeline::Activity => activity_targets(&state, &games).await?,
    };
    job.progress = new_progress("running");
    let progress = job.progress.clone();
    let state = Arc::clone(&state);
    job.task = Some(tokio::spawn(async move {
        let finished_state = Arc::clone(&state);
        run_targets(state, pipeline, targets).await;
        finish_if_running(&finished_state, pipeline).await;
    }));
    Ok(progress)
}

async fn finish_if_running(state: &AppState, pipeline: Pipeline) {
    let mut job = pipeline_job(state, pipeline).lock().await;
    if job.progress["running"].as_bool() == Some(true) {
        job.progress["running"] = Value::Bool(false);
        job.progress["status"] = json!("completed");
        job.progress["current"] = json!("");
    }
}

pub async fn start_scan_missing(state: Arc<AppState>, games: &Value) -> Result<Value, String> {
    start(state, games, Pipeline::Metadata).await
}

pub async fn get_scan_progress(state: &AppState) -> Value {
    pipeline_job(state, Pipeline::Metadata)
        .lock()
        .await
        .progress
        .clone()
}

pub async fn get_missing_metadata_count(state: &AppState, games: &Value) -> Result<i64, String> {
    let games = game_array(games)?;
    let storage = state.store().await?;
    let records = storage.data()["metadata"].as_object();
    let mut count = 0;
    for game in games {
        let Some(game) = game.as_object() else {
            continue;
        };
        let Some(app_id) = parse_game_id(game.get("appid")) else {
            continue;
        };
        let key = app_id.to_string();
        if !records
            .and_then(|records| records.get(&key))
            .is_some_and(metadata::complete)
        {
            count += 1;
        }
    }
    Ok(count)
}

pub async fn start_refresh_steam_activities(
    state: Arc<AppState>,
    games: &Value,
) -> Result<Value, String> {
    start(state, games, Pipeline::Activity).await
}

pub async fn get_activity_refresh_progress(state: &AppState) -> Value {
    pipeline_job(state, Pipeline::Activity)
        .lock()
        .await
        .progress
        .clone()
}

pub async fn refresh_steam_activity_for_app(
    state: &AppState,
    app_id: &Value,
) -> Result<Option<Value>, String> {
    if state.cancel.is_cancelled() {
        return Err("backend stopping".into());
    }
    {
        let job = state.jobs.activity.lock().await;
        if job.task.as_ref().is_some_and(|task| !task.is_finished()) {
            return Ok(None);
        }
    }

    let key = matching::py_string(app_id);
    let value = state.store().await?.data()["metadata"][&key].clone();
    if !value.is_object() {
        return Ok(None);
    }
    let app_id = python_int_argument(app_id)?;
    let raw_title = if matching::py_truthy(&value["title"]) {
        matching::py_string(&value["title"])
    } else {
        String::new()
    };
    let title = matching::clean_game_title(&raw_title);
    let result = activity_match(state, value.clone(), &title).await?;
    if state.cancel.is_cancelled() {
        return Err("backend stopping".into());
    }
    if let Some(refreshed) = result
        .metadata
        .as_ref()
        .filter(|refreshed| matching::py_truthy(refreshed))
    {
        if !save_activity(state, &app_id, refreshed.clone(), &value).await? {
            return Ok(None);
        }
    }
    if state.cancel.is_cancelled() {
        return Err("backend stopping".into());
    }
    if result.status == ResultStatus::Matched {
        Ok(result.metadata)
    } else {
        Ok(None)
    }
}

struct GameInput {
    app_id: Number,
    name: Option<String>,
}

struct Target {
    app_id: Number,
    title: String,
    /// The stored record when the target was chosen; a changed record discards the result.
    metadata: Option<Value>,
}

fn game_array(games: &Value) -> Result<&[Value], String> {
    if !matching::py_truthy(games) {
        return Ok(&[]);
    }
    match games {
        Value::Array(games) => Ok(games),
        Value::Object(_) | Value::String(_) => Ok(&[]),
        _ => Err("games must be an array".to_owned()),
    }
}

fn parse_game_id(value: Option<&Value>) -> Option<Number> {
    let raw = matching::py_string(value?);
    matching::integer_string(matching::py_strip(&raw))?
        .parse()
        .ok()
}

fn python_int_argument(value: &Value) -> Result<Number, String> {
    match value {
        Value::Bool(value) => Ok(Number::from(u8::from(*value))),
        Value::Number(value) if !value.is_f64() => Ok(value.clone()),
        Value::Number(value) => {
            let number = value
                .as_f64()
                .filter(|number| number.is_finite())
                .ok_or("invalid app_id")?
                .trunc();
            let integer = format!("{number:.0}");
            matching::integer_string(&integer)
                .and_then(|value| value.parse().ok())
                .ok_or_else(|| "invalid app_id".into())
        }
        Value::String(value) => matching::integer_string(value)
            .and_then(|value| value.parse().ok())
            .ok_or_else(|| format!("invalid literal for int() with base 10: '{value}'")),
        _ => Err("invalid app_id".into()),
    }
}

fn game_input_id(value: Option<&Value>) -> Result<Option<Number>, String> {
    let Some(value) = value else {
        return Ok(None);
    };
    if matching::py_strip(&matching::py_string(value)).is_empty() {
        return Ok(None);
    }
    python_int_argument(value).map(Some)
}

fn game_inputs(games: &Value) -> Result<Vec<GameInput>, String> {
    let mut inputs = Vec::new();
    for game in game_array(games)? {
        let Some(game) = game.as_object() else {
            continue;
        };
        let Some(app_id) = game_input_id(game.get("appid"))? else {
            continue;
        };
        let name = game
            .get("name")
            .filter(|value| matching::py_truthy(value))
            .map(matching::py_string);
        inputs.push(GameInput { app_id, name });
    }
    Ok(inputs)
}

async fn metadata_targets(state: &AppState, games: &[GameInput]) -> Result<Vec<Target>, String> {
    let storage = state.store().await?;
    let records = storage.data()["metadata"].as_object();
    Ok(games
        .iter()
        .filter(|game| {
            !records
                .and_then(|records| records.get(&game.app_id.to_string()))
                .is_some_and(metadata::complete)
        })
        .map(|game| Target {
            app_id: game.app_id.clone(),
            title: matching::clean_game_title(game.name.as_deref().unwrap_or_default()),
            metadata: records.and_then(|records| records.get(&game.app_id.to_string()).cloned()),
        })
        .collect())
}

async fn activity_targets(state: &AppState, games: &[GameInput]) -> Result<Vec<Target>, String> {
    let storage = state.store().await?;
    let records = storage.data()["metadata"].as_object();
    Ok(games
        .iter()
        .filter_map(|game| {
            let value = records?
                .get(&game.app_id.to_string())
                .filter(|value| value.is_object())?;
            let raw_title = game.name.as_deref().map(str::to_owned).unwrap_or_else(|| {
                if matching::py_truthy(&value["title"]) {
                    matching::py_string(&value["title"])
                } else {
                    String::new()
                }
            });
            Some(Target {
                app_id: game.app_id.clone(),
                title: matching::clean_game_title(&raw_title),
                metadata: Some(value.clone()),
            })
        })
        .collect())
}

async fn run_targets(state: Arc<AppState>, pipeline: Pipeline, targets: Vec<Target>) {
    if state.cancel.is_cancelled() {
        return;
    }
    {
        let mut job = pipeline_job(&state, pipeline).lock().await;
        if state.cancel.is_cancelled() {
            return;
        }
        job.progress["total"] = json!(targets.len());
        job.progress["completed"] = json!(0);
    }
    let total = targets.len();
    let mut delisted_refreshed = false;
    for (index, mut target) in targets.into_iter().enumerate() {
        if state.cancel.is_cancelled() {
            return;
        }
        let position = index + 1;
        let current = if target.title.is_empty() {
            format!("{position}/{total}")
        } else {
            format!("{position}/{total} - {}", target.title)
        };
        let initial_message = match pipeline {
            Pipeline::Metadata => format!("Matching metadata for {}", target.title),
            Pipeline::Activity => format!("Refreshing Steam Activity for {}", target.title),
        };
        {
            let mut job = pipeline_job(&state, pipeline).lock().await;
            if state.cancel.is_cancelled() {
                return;
            }
            job.progress["current"] = json!(current);
            job.progress["message"] = json!(initial_message);
        }

        let snapshot = target.metadata.take().unwrap_or(Value::Null);
        let result = match pipeline {
            Pipeline::Metadata => metadata_match(&state, &target, &mut delisted_refreshed).await,
            Pipeline::Activity => activity_match(&state, snapshot.clone(), &target.title).await,
        };
        let mut result = match result {
            Ok(result) => result,
            Err(_) if state.cancel.is_cancelled() => return,
            Err(error) => {
                log_target_error(pipeline, &target, &error);
                finish_target(&state, pipeline, &target, None, Some(error)).await;
                continue;
            }
        };
        if state.cancel.is_cancelled() {
            return;
        }
        if let Some(value) = result.metadata.as_ref() {
            let save_result = match pipeline {
                Pipeline::Metadata => {
                    let trusted_app_id = matching::safe_int(&value["steam_appid"]);
                    metadata::save_guarded(
                        &state,
                        &json!(target.app_id),
                        value.clone(),
                        true,
                        trusted_app_id,
                        Some(&snapshot),
                    )
                    .await
                    .map(|saved| saved.is_some())
                }
                Pipeline::Activity => {
                    save_activity(&state, &target.app_id, value.clone(), &snapshot).await
                }
            };
            match save_result {
                Ok(true) => {}
                Ok(false) => result = ScanResult::miss(None, "stale"),
                Err(error) => {
                    if state.cancel.is_cancelled() {
                        return;
                    }
                    log_target_error(pipeline, &target, &error);
                    finish_target(&state, pipeline, &target, None, Some(error)).await;
                    continue;
                }
            }
        }
        if state.cancel.is_cancelled() {
            return;
        }
        finish_target(&state, pipeline, &target, Some(result), None).await;
    }
    let mut job = pipeline_job(&state, pipeline).lock().await;
    if state.cancel.is_cancelled() {
        return;
    }
    job.progress["running"] = Value::Bool(false);
    job.progress["status"] = json!("completed");
    job.progress["current"] = json!("");
}

async fn finish_target(
    state: &AppState,
    pipeline: Pipeline,
    target: &Target,
    result: Option<ScanResult>,
    error: Option<String>,
) {
    let mut job = pipeline_job(state, pipeline).lock().await;
    if state.cancel.is_cancelled() {
        return;
    }
    if let Some(error) = error {
        let failed = job.progress["failed"].as_i64().unwrap_or(0) + 1;
        job.progress["failed"] = json!(failed);
        job.progress["message"] = json!(format!("Failed: {}", target.title));
        job.progress["error"] = json!(error);
    } else if let Some(result) = result {
        let key = if result.status == ResultStatus::Matched {
            "assigned"
        } else {
            "failed"
        };
        let count = job.progress[key].as_i64().unwrap_or(0) + 1;
        job.progress[key] = json!(count);
        job.progress["message"] = json!(result.message(&target.title, pipeline));
    }
    let completed = job.progress["completed"].as_i64().unwrap_or(0) + 1;
    job.progress["completed"] = json!(completed);
}

fn log_target_error(pipeline: Pipeline, target: &Target, error: &str) {
    let log_message = match pipeline {
        Pipeline::Metadata => "metadata scan failed",
        Pipeline::Activity => "Steam Activity refresh failed",
    };
    logging::event(
        "load",
        log_message,
        json!({"exc": true, "title": target.title, "app_id": target.app_id, "error": error}),
        log::Level::Error,
    );
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum ResultStatus {
    Matched,
    Miss,
}

struct ScanResult {
    status: ResultStatus,
    metadata: Option<Value>,
    source: &'static str,
}

impl ScanResult {
    fn matched(metadata: Value, source: &'static str) -> Self {
        Self {
            status: ResultStatus::Matched,
            metadata: Some(metadata),
            source,
        }
    }

    fn miss(metadata: Option<Value>, source: &'static str) -> Self {
        Self {
            status: ResultStatus::Miss,
            metadata,
            source,
        }
    }

    fn message(&self, title: &str, pipeline: Pipeline) -> String {
        match (pipeline, self.status, self.source) {
            (_, ResultStatus::Miss, "stale") => {
                format!("Skipped {title}: metadata changed during refresh")
            }
            (Pipeline::Metadata, ResultStatus::Matched, "steam") => {
                format!("Matched Steam for {title}")
            }
            (Pipeline::Metadata, ResultStatus::Matched, "delisted") => {
                format!("Matched delisted Steam app for {title}")
            }
            (Pipeline::Metadata, ResultStatus::Matched, "ign") => {
                format!("Saved metadata for {title}")
            }
            (Pipeline::Metadata, ResultStatus::Miss, _) => {
                format!("No metadata match for {title}")
            }
            (Pipeline::Activity, ResultStatus::Matched, _) => {
                format!("Updated Steam Activity for {title}")
            }
            (Pipeline::Activity, ResultStatus::Miss, _) => {
                format!("No Steam Activity found for {title}")
            }
            (Pipeline::Metadata, ResultStatus::Matched, _) => {
                format!("Saved metadata for {title}")
            }
        }
    }
}

async fn metadata_match(
    state: &AppState,
    target: &Target,
    delisted_refreshed: &mut bool,
) -> Result<ScanResult, String> {
    let title = &target.title;
    let steam_shell = json!({"title": title, "source": "Manual", "id": title});
    let steam = metadata::with_steam_news(state, steam_shell, title, 10, true).await?;
    if metadata::complete(&steam) {
        return Ok(ScanResult::matched(steam, "steam"));
    }
    let mut best_partial = if matching::safe_int(&steam["steam_appid"]).is_some_and(|id| id != 0)
        || matching::py_truthy(&steam["steam_news"])
    {
        Some(steam)
    } else {
        None
    };

    // One refresh attempt per scan; a failed or stale refresh must not cost each later target a timeout.
    let index = if std::mem::replace(delisted_refreshed, true) {
        state.delisted.lock().await.clone()
    } else {
        state.ensure_delisted_index(false).await
    };
    if state.cancel.is_cancelled() {
        return Err("backend stopping".into());
    }
    let delisted_app_id = delisted::resolve_delisted_appid_for_title(
        title,
        index
            .as_deref()
            .and_then(|index| index.get("apps"))
            .unwrap_or(&Value::Null),
    );
    if delisted_app_id != 0 {
        let pinned = json!({
            "title": title,
            "source": "Manual",
            "id": title,
            "steam_appid": delisted_app_id,
            "steam_store_state": "delisted",
        });
        let delisted = metadata::with_steam_news(state, pinned, title, 10, true).await?;
        if metadata::complete(&delisted) {
            return Ok(ScanResult::matched(delisted, "delisted"));
        }
        if matching::py_truthy(&delisted)
            && (best_partial
                .as_ref()
                .is_none_or(|best| !matching::py_truthy(best))
                || matching::safe_int(&delisted["steam_appid"]).is_some_and(|id| id != 0))
        {
            best_partial = Some(delisted);
        }
    }

    if let Some(mut partial) = best_partial.filter(matching::py_truthy) {
        if let Some(fetched) = metadata::auto_fetch(state, title)
            .await?
            .filter(matching::py_truthy)
        {
            if let (Some(existing), Some(fetched)) = (partial.as_object_mut(), fetched.as_object())
            {
                for (key, value) in fetched {
                    let current = existing.get(key);
                    let manual_source = key == "source"
                        && current.is_some_and(matching::py_truthy)
                        && matching::py_string(current.unwrap())
                            .trim()
                            .eq_ignore_ascii_case("manual");
                    if current.is_none()
                        || !current.is_some_and(matching::py_truthy)
                        || manual_source
                    {
                        existing.insert(key.clone(), value.clone());
                    }
                }
            }
            let enriched = metadata::with_steam_news(state, partial, title, 10, true).await?;
            if metadata::complete(&enriched) {
                return Ok(ScanResult::matched(enriched, "ign"));
            }
            partial = enriched;
        }
        return Ok(ScanResult::miss(Some(partial), "metadata"));
    }

    let Some(fetched) = metadata::auto_fetch(state, title)
        .await?
        .filter(matching::py_truthy)
    else {
        return Ok(ScanResult::miss(None, "ign"));
    };
    let enriched = metadata::with_steam_news(state, fetched, title, 10, true).await?;
    Ok(ScanResult::matched(enriched, "ign"))
}

async fn activity_match(state: &AppState, value: Value, title: &str) -> Result<ScanResult, String> {
    let refreshed = metadata::with_steam_news(state, value, title, 10, false).await?;
    if !matching::py_truthy(&refreshed) {
        return Ok(ScanResult::miss(None, "steam_activity"));
    }
    let has_news = !metadata::sanitize_news(&refreshed["steam_news"])?.is_empty();
    Ok(if has_news {
        ScanResult::matched(refreshed, "steam_activity")
    } else {
        ScanResult::miss(Some(refreshed), "steam_activity")
    })
}

/// Returns false, without writing, when the record no longer equals `expected`.
async fn save_activity(
    state: &AppState,
    app_id: &Number,
    value: Value,
    expected: &Value,
) -> Result<bool, String> {
    let key = app_id.to_string();
    state
        .change(move |transaction| {
            if transaction.get(&["metadata", &key]).unwrap_or(&Value::Null) != expected {
                return Ok(false);
            }
            transaction.set(&["metadata", &key], value)?;
            Ok(true)
        })
        .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        http::{Fixture, Http, Response},
        providers::{ign::IGN_GRAPHQL_URL, steam},
        state::AppState,
    };
    use reqwest::{Method, Url, header::HeaderMap};
    use serde_json::json;
    use std::{
        path::PathBuf,
        sync::{
            Arc,
            atomic::{AtomicU64, Ordering},
        },
        time::Duration,
    };

    struct TestDirectory(PathBuf);

    impl TestDirectory {
        fn new() -> Self {
            use std::os::unix::fs::PermissionsExt;
            static NEXT: AtomicU64 = AtomicU64::new(0);
            let root = std::env::var_os("TMPDIR")
                .filter(|root| !root.is_empty())
                .map(PathBuf::from)
                .unwrap_or_else(|| PathBuf::from("/var/tmp/omp-1000"));
            if !root.exists() {
                std::fs::create_dir_all(&root).unwrap();
                std::fs::set_permissions(&root, std::fs::Permissions::from_mode(0o700)).unwrap();
            }
            let root = std::fs::canonicalize(root).unwrap();
            let path = root.join(format!(
                "metadata-scan-runner-test-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed)
            ));
            std::fs::create_dir(&path).unwrap();
            std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o700)).unwrap();
            Self(path)
        }

        fn env(&self) -> decky_plugin::Env {
            decky_plugin::Env {
                plugin_settings_dir: self.0.join("settings"),
                plugin_runtime_dir: self.0.join("runtime"),
                plugin_log_dir: self.0.join("logs"),
                plugin_version: "0.5.5".into(),
                ..Default::default()
            }
        }
    }

    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    async fn test_state(fixtures: Vec<Fixture>) -> (TestDirectory, Arc<AppState>) {
        let directory = TestDirectory::new();
        let http = Http::fixtures(fixtures);
        let mut state = AppState::new(directory.env()).unwrap();
        let inner = Arc::get_mut(&mut state).unwrap();
        inner.cancel = http.cancel.clone();
        inner.http = http;
        state.initialize().await.unwrap();
        set_delisted(&state, Vec::new()).await;
        (directory, state)
    }

    async fn set_delisted(state: &AppState, apps: Vec<Value>) {
        *state.delisted.lock().await = Some(Arc::new(json!({
            "fetched_at": metadata::now(),
            "source": "scan-runner-test",
            "apps": apps,
        })));
    }

    async fn set_record(state: &AppState, app_id: i64, value: Value) {
        let key = app_id.to_string();
        state
            .change(move |transaction| {
                transaction.set(&["metadata", &key], value)?;
                Ok(())
            })
            .await
            .unwrap();
    }

    fn store_search(title: &str, items: Value) -> Fixture {
        let mut url = Url::parse(steam::STEAM_STORE_SEARCH_URL).unwrap();
        url.query_pairs_mut()
            .append_pair("term", title)
            .append_pair("cc", "US")
            .append_pair("l", "english");
        Fixture::json(url.to_string(), json!({"items": items}))
    }

    fn steam_events(app_id: i64, events: Value) -> Fixture {
        let mut url = Url::parse(steam::STEAM_EVENTS_URL).unwrap();
        url.query_pairs_mut()
            .append_pair("appid", &app_id.to_string())
            .append_pair("offset", "0")
            .append_pair("count", "30")
            .append_pair("l", "english")
            .append_pair("origin", "https://store.steampowered.com");
        Fixture::json(url.to_string(), json!({"events": events}))
    }

    fn steam_news_url(app_id: i64) -> String {
        let feeds = "steam_community_announcements,steam_community_announcements_koreana,steam_community_announcements_japanese,steam_community_announcements_schinese,steam_community_announcements_tchinese,steam_community_announcements_french,steam_community_announcements_german,steam_community_announcements_spanish,steam_community_announcements_italian,steam_community_announcements_polish,steam_community_announcements_portuguese,steam_community_announcements_russian";
        let mut url = Url::parse(steam::STEAM_NEWS_URL).unwrap();
        url.query_pairs_mut()
            .append_pair("appid", &app_id.to_string())
            .append_pair("count", "10")
            .append_pair("maxlength", "600")
            .append_pair("format", "json")
            .append_pair("feeds", feeds);
        url.to_string()
    }

    fn steam_compatibility(app_id: i64, result: Result<Value, ()>) -> Fixture {
        let mut url = Url::parse(steam::STEAM_DECK_COMPAT_URL).unwrap();
        url.query_pairs_mut()
            .append_pair("nAppID", &app_id.to_string())
            .append_pair("l", "english");
        match result {
            Ok(payload) => Fixture::json(url.to_string(), payload),
            Err(()) => Fixture::failure(url.to_string()),
        }
    }

    fn steam_details(app_id: i64, result: Result<Value, ()>) -> Fixture {
        let mut url = Url::parse(steam::STEAM_APP_DETAILS_URL).unwrap();
        url.query_pairs_mut()
            .append_pair("appids", &app_id.to_string())
            .append_pair("l", "english");
        match result {
            Ok(details) => {
                let mut payload = json!({});
                payload.as_object_mut().unwrap().insert(
                    app_id.to_string(),
                    json!({"success": true, "data": details}),
                );
                Fixture::json(url.to_string(), payload)
            }
            Err(()) => Fixture::failure(url.to_string()),
        }
    }

    fn event(app_id: i64) -> Value {
        json!({
            "event_type": 28,
            "gid": format!("event-{app_id}"),
            "rtime_created": 1_700_000_000,
            "announcement_body": {
                "gid": format!("announcement-{app_id}"),
                "headline": format!("Update {app_id}"),
                "body": "Patch notes",
            },
        })
    }

    fn complete_steam_fixtures(title: &str, app_id: i64) -> Vec<Fixture> {
        vec![
            store_search(title, json!([{"id": app_id, "name": title}])),
            steam_events(app_id, json!([event(app_id)])),
            steam_compatibility(
                app_id,
                Ok(json!({"success": 1, "results": {"resolved_category": 3}})),
            ),
            steam_details(
                app_id,
                Ok(json!({"name": title, "short_description": "Steam description"})),
            ),
        ]
    }

    fn post_json(body: Value) -> Fixture {
        let url = IGN_GRAPHQL_URL.to_owned();
        Fixture {
            method: Method::POST,
            url: url.clone(),
            result: Ok(Response {
                status: 200,
                headers: HeaderMap::new(),
                body: serde_json::to_vec(&body).unwrap(),
                url,
            }),
        }
    }

    fn ign_metadata(title: &str, slug: &str) -> Fixture {
        post_json(json!({"data": {"objectSelectByTypeAndSlug": {
            "id": format!("game-{slug}"),
            "slug": slug,
            "url": format!("https://www.ign.com/games/{slug}"),
            "type": "Game",
            "metadata": {
                "names": {"name": title, "short": title},
                "descriptions": {"short": "IGN description", "long": ""},
            },
            "objectRegions": [],
        }}}))
    }

    fn empty_ign_search() -> Fixture {
        post_json(json!({"data": {"searchObjectsByName": {"edges": []}}}))
    }

    fn delisted_partial_fixtures(title: &str, app_id: i64, ign_match: bool) -> Vec<Fixture> {
        let mut fixtures = vec![
            store_search(title, json!([])),
            steam_events(app_id, json!([])),
            Fixture::failure(steam_news_url(app_id)),
            steam_compatibility(app_id, Err(())),
            steam_details(app_id, Err(())),
        ];
        let slugs = crate::providers::ign::slug_candidates(title);
        if ign_match {
            fixtures.push(ign_metadata(title, &slugs[0]));
            fixtures.extend([
                steam_events(app_id, json!([event(app_id)])),
                steam_compatibility(app_id, Err(())),
                steam_details(app_id, Err(())),
            ]);
        } else {
            fixtures.extend(
                slugs
                    .iter()
                    .map(|_| post_json(json!({"data": {"objectSelectByTypeAndSlug": null}}))),
            );
            fixtures.push(empty_ign_search());
        }
        fixtures
    }

    async fn wait_for_scan_completion(state: &AppState) -> Value {
        tokio::time::timeout(Duration::from_secs(3), async {
            loop {
                let progress = get_scan_progress(state).await;
                if progress["status"] == "completed" {
                    return progress;
                }
                tokio::task::yield_now().await;
            }
        })
        .await
        .unwrap()
    }

    #[tokio::test]
    async fn metadata_scan_preserves_provider_priority_and_saves_partial_misses() {
        let mut fixtures = complete_steam_fixtures("Steam Priority", 100);
        fixtures.extend(delisted_partial_fixtures("Backfill Match", 600, true));
        fixtures.extend(delisted_partial_fixtures("Partial Save", 601, false));
        let (_directory, state) = test_state(fixtures).await;
        set_record(
            &state,
            1,
            json!({
                "title":"Steam Priority",
                "source":"Manual",
                "steam_appid":9,
                "deck_compat_category":2,
                "deck_compat_override":"valve",
            }),
        )
        .await;
        set_delisted(
            &state,
            vec![
                json!([900, "Steam Priority"]),
                json!([600, "Backfill Match"]),
                json!([601, "Partial Save"]),
            ],
        )
        .await;

        start_scan_missing(
            Arc::clone(&state),
            &json!([
                {"appid": 1, "name": "Steam Priority"},
                {"appid": 2, "name": "Backfill Match"},
                {"appid": 3, "name": "Partial Save"},
            ]),
        )
        .await
        .unwrap();
        state.jobs.drain().await;

        let progress = get_scan_progress(&state).await;
        assert_eq!(progress["total"], 3);
        assert_eq!(progress["completed"], 3);
        assert_eq!(progress["assigned"], 2);
        assert_eq!(progress["failed"], 1);
        assert_eq!(
            progress["completed"],
            progress["assigned"].as_i64().unwrap() + progress["failed"].as_i64().unwrap()
        );
        assert_eq!(progress["message"], "No metadata match for Partial Save");
        let storage = state.store().await.unwrap();
        assert_eq!(storage.data()["metadata"]["1"]["steam_appid"], 100);
        assert_eq!(
            storage.data()["metadata"]["1"]["deck_compat_override"],
            "valve"
        );
        assert_eq!(storage.data()["metadata"]["1"]["deck_compat_category"], 3);
        assert_eq!(storage.data()["metadata"]["2"]["steam_appid"], 600);
        assert_eq!(storage.data()["metadata"]["2"]["source"], "IGN");
        assert_eq!(
            storage.data()["metadata"]["2"]["description"],
            "IGN description"
        );
        assert_eq!(storage.data()["metadata"]["3"]["steam_appid"], 601);
        assert_eq!(storage.data()["metadata"]["3"]["source"], "Manual");
        drop(storage);
        assert_eq!(
            get_missing_metadata_count(
                &state,
                &json!([
                    {"appid": 1, "name": "Steam Priority"},
                    {"appid": 2, "name": "Backfill Match"},
                    {"appid": 3, "name": "Partial Save"},
                ]),
            )
            .await
            .unwrap(),
            1
        );
        state.http.assert_drained();
        state.shutdown().await.unwrap();
    }

    #[tokio::test]
    async fn metadata_scan_continues_after_provider_failure() {
        let mut fixtures = vec![store_search("Broken Scan", json!([]))];
        for _ in 0..=crate::providers::ign::slug_candidates("Broken Scan").len() {
            fixtures.push(Fixture {
                method: Method::POST,
                url: IGN_GRAPHQL_URL.to_owned(),
                result: Err("connection failed".into()),
            });
        }
        fixtures.extend(complete_steam_fixtures("Good Scan", 500));
        let (_directory, state) = test_state(fixtures).await;

        start_scan_missing(
            Arc::clone(&state),
            &json!([
                {"appid": 1, "name": "Broken Scan"},
                {"appid": 2, "name": "Good Scan"},
            ]),
        )
        .await
        .unwrap();
        state.jobs.drain().await;

        let progress = get_scan_progress(&state).await;
        assert_eq!(progress["total"], 2);
        assert_eq!(progress["completed"], 2);
        assert_eq!(progress["assigned"], 1);
        assert_eq!(progress["failed"], 1);
        assert_eq!(progress["message"], "Matched Steam for Good Scan");
        assert!(!progress["error"].as_str().unwrap().is_empty());
        let storage = state.store().await.unwrap();
        assert!(storage.data()["metadata"].get("1").is_none());
        assert_eq!(storage.data()["metadata"]["2"]["steam_appid"], 500);
        drop(storage);
        state.http.assert_drained();
        state.shutdown().await.unwrap();
    }

    #[tokio::test]
    async fn metadata_scan_single_flight_returns_current_progress() {
        let fixtures = complete_steam_fixtures("Single Flight", 100);
        let (_directory, mut state) = test_state(fixtures).await;
        let gate = Arc::get_mut(&mut state).unwrap().http.gate_next_request();
        let games = json!([{"appid": 1, "name": "Single Flight"}]);
        start_scan_missing(Arc::clone(&state), &games)
            .await
            .unwrap();
        tokio::time::timeout(Duration::from_secs(2), gate.started.notified())
            .await
            .unwrap();
        let current = get_scan_progress(&state).await;
        let repeated = start_scan_missing(
            Arc::clone(&state),
            &json!([{"appid": 2, "name": "Must Not Start"}]),
        )
        .await
        .unwrap();
        assert_eq!(repeated, current);

        gate.resume.notify_one();
        state.jobs.drain().await;
        let progress = get_scan_progress(&state).await;
        assert_eq!(progress["total"], 1);
        assert_eq!(progress["completed"], 1);
        assert_eq!(progress["assigned"], 1);
        let storage = state.store().await.unwrap();
        assert_eq!(storage.data()["metadata"]["1"]["steam_appid"], 100);
        assert!(storage.data()["metadata"].get("2").is_none());
        drop(storage);
        state.http.assert_drained();
        state.shutdown().await.unwrap();
    }

    #[tokio::test]
    async fn scan_cancellation_stops_before_any_late_metadata_write() {
        let fixtures = vec![store_search(
            "Cancelled Scan",
            json!([{"id": 100, "name": "Cancelled Scan"}]),
        )];
        let (_directory, mut state) = test_state(fixtures).await;
        let gate = Arc::get_mut(&mut state).unwrap().http.gate_next_request();
        start_scan_missing(
            Arc::clone(&state),
            &json!([{"appid": 7, "name": "Cancelled Scan"}]),
        )
        .await
        .unwrap();
        tokio::time::timeout(Duration::from_secs(2), gate.started.notified())
            .await
            .unwrap();

        state.shutdown().await.unwrap();
        gate.resume.notify_one();
        state.jobs.drain().await;
        assert!(
            state.store().await.unwrap().data()["metadata"]
                .get("7")
                .is_none()
        );
        state.http.assert_drained();
    }

    #[tokio::test]
    async fn metadata_and_activity_pipelines_make_independent_progress() {
        let mut fixtures = vec![steam_events(400, json!([event(400)]))];
        fixtures.extend(complete_steam_fixtures("Independent Scan", 500));
        let (_directory, mut state) = test_state(fixtures).await;
        set_record(
            &state,
            1,
            json!({"title":"Activity Game","source":"Manual","steam_appid":400,"steam_news":[]}),
        )
        .await;
        let gate = Arc::get_mut(&mut state).unwrap().http.gate_next_request();
        start_refresh_steam_activities(
            Arc::clone(&state),
            &json!([{"appid": 1, "name": "Activity Game"}]),
        )
        .await
        .unwrap();
        tokio::time::timeout(Duration::from_secs(2), gate.started.notified())
            .await
            .unwrap();
        start_scan_missing(
            Arc::clone(&state),
            &json!([{"appid": 8, "name": "Independent Scan"}]),
        )
        .await
        .unwrap();

        let scan_progress = wait_for_scan_completion(&state).await;
        assert_eq!(scan_progress["assigned"], 1);
        assert_eq!(get_activity_refresh_progress(&state).await["running"], true);
        assert_eq!(
            state.store().await.unwrap().data()["metadata"]["8"]["steam_appid"],
            500
        );

        gate.resume.notify_one();
        state.jobs.drain().await;
        assert_eq!(get_activity_refresh_progress(&state).await["assigned"], 1);
        assert_eq!(get_activity_refresh_progress(&state).await["completed"], 1);
        state.http.assert_drained();
        state.shutdown().await.unwrap();
    }

    #[tokio::test]
    async fn activity_batch_suppresses_passive_refresh_for_covered_app() {
        let fixtures = vec![steam_events(400, json!([event(400)]))];
        let (_directory, mut state) = test_state(fixtures).await;
        set_record(
            &state,
            1,
            json!({"title":"Activity Game","source":"Manual","steam_appid":400,"steam_news":[]}),
        )
        .await;
        let gate = Arc::get_mut(&mut state).unwrap().http.gate_next_request();
        start_refresh_steam_activities(
            Arc::clone(&state),
            &json!([{"appid": 1, "name": "Activity Game"}]),
        )
        .await
        .unwrap();
        tokio::time::timeout(Duration::from_secs(2), gate.started.notified())
            .await
            .unwrap();
        assert_eq!(
            refresh_steam_activity_for_app(&state, &json!(1))
                .await
                .unwrap(),
            None
        );
        assert_eq!(get_activity_refresh_progress(&state).await["running"], true);

        gate.resume.notify_one();
        state.jobs.drain().await;
        assert_eq!(get_activity_refresh_progress(&state).await["assigned"], 1);
        state.http.assert_drained();
        state.shutdown().await.unwrap();
    }

    #[tokio::test]
    async fn activity_batch_reconciles_matched_and_missing_news() {
        let fixtures = vec![
            steam_events(400, json!([event(400)])),
            steam_events(401, json!([])),
            Fixture::failure(steam_news_url(401)),
        ];
        let (_directory, state) = test_state(fixtures).await;
        set_record(
            &state,
            1,
            json!({"title":"News Game","source":"Manual","steam_appid":400,"steam_news":[]}),
        )
        .await;
        set_record(
            &state,
            2,
            json!({"title":"Quiet Game","source":"Manual","steam_appid":401,"steam_news":[]}),
        )
        .await;

        start_refresh_steam_activities(
            Arc::clone(&state),
            &json!([
                {"appid":1,"name":"News Game"},
                {"appid":2,"name":"Quiet Game"},
            ]),
        )
        .await
        .unwrap();
        state.jobs.drain().await;
        let progress = get_activity_refresh_progress(&state).await;
        assert_eq!(progress["total"], 2);
        assert_eq!(progress["completed"], 2);
        assert_eq!(progress["assigned"], 1);
        assert_eq!(progress["failed"], 1);
        assert_eq!(progress["status"], "completed");
        let storage = state.store().await.unwrap();
        assert_eq!(
            storage.data()["metadata"]["1"]["steam_news"][0]["title"],
            "Update 400"
        );
        assert_eq!(storage.data()["metadata"]["2"]["steam_news"], json!([]));
        assert_eq!(
            storage.data()["metadata"]["2"]["steam_store_url"],
            "https://store.steampowered.com/app/401/"
        );
        drop(storage);
        state.http.assert_drained();
        state.shutdown().await.unwrap();
    }

    #[tokio::test]
    async fn per_app_activity_refresh_returns_news_and_saves_misses() {
        let fixtures = vec![
            steam_events(400, json!([event(400)])),
            steam_events(456, json!([])),
            Fixture::failure(steam_news_url(456)),
        ];
        let (_directory, state) = test_state(fixtures).await;
        set_record(
            &state,
            101,
            json!({"title":"Space Marine","source":"Manual","steam_appid":400,"steam_news":[]}),
        )
        .await;
        set_record(
            &state,
            202,
            json!({"title":"No News Game","source":"Manual","steam_appid":456,"steam_news":[]}),
        )
        .await;

        assert_eq!(
            refresh_steam_activity_for_app(&state, &json!(999))
                .await
                .unwrap(),
            None
        );
        let refreshed = refresh_steam_activity_for_app(&state, &json!(101))
            .await
            .unwrap()
            .unwrap();
        assert_eq!(refreshed["steam_news"][0]["title"], "Update 400");
        assert_eq!(
            refresh_steam_activity_for_app(&state, &json!(202))
                .await
                .unwrap(),
            None
        );
        let storage = state.store().await.unwrap();
        assert_eq!(
            storage.data()["metadata"]["101"]["steam_news"][0]["title"],
            "Update 400"
        );
        assert_eq!(storage.data()["metadata"]["202"]["steam_news"], json!([]));
        assert_eq!(
            storage.data()["metadata"]["202"]["steam_store_url"],
            "https://store.steampowered.com/app/456/"
        );
        drop(storage);
        state.http.assert_drained();
        state.shutdown().await.unwrap();
    }

    #[tokio::test]
    async fn scan_counters_reconcile_empty_titles_and_ignore_invalid_count_ids() {
        let (_directory, state) = test_state(Vec::new()).await;
        set_record(
            &state,
            3,
            json!({"title":"Complete","source":"Steam","description":"Complete metadata"}),
        )
        .await;
        let games = json!([
            {"appid":"1","name":""},
            {"appid":2,"name":null},
            {"appid":false,"name":null},
            {"appid":"3","name":"Already Complete"},
            {"appid":"bad","name":"Bad ID"},
            {"appid":"","name":"Blank ID"},
            {"name":"No ID"},
            null,
            "not a game",
        ]);
        assert_eq!(get_missing_metadata_count(&state, &games).await.unwrap(), 2);
        start_scan_missing(
            Arc::clone(&state),
            &json!([
                {"appid":"1","name":""},
                {"appid":2,"name":null},
                {"appid":false,"name":null},
                {"appid":"3","name":"Already Complete"},
            ]),
        )
        .await
        .unwrap();
        state.jobs.drain().await;
        let progress = get_scan_progress(&state).await;
        assert_eq!(progress["total"], 3);
        assert_eq!(progress["completed"], 3);
        assert_eq!(progress["assigned"], 0);
        assert_eq!(progress["failed"], 3);
        assert_eq!(progress["status"], "completed");
        state.http.assert_drained();
        assert_eq!(progress["current"], "");
        assert_eq!(progress["message"], "No metadata match for ");
        state.shutdown().await.unwrap();
    }

    #[tokio::test]
    async fn unicode_and_unbounded_game_ids_keep_their_canonical_record_keys() {
        let (_directory, state) = test_state(Vec::new()).await;
        let present = "99999999999999999999999999999999999999999999";
        let absent = "99999999999999999999999999999999999999999998";
        set_record(&state, 42, json!({"title":"Present","source":"Steam"})).await;
        state
            .change(|tx| {
                tx.set(
                    &["metadata", present],
                    json!({"title":"Wide ID","source":"Steam"}),
                )
            })
            .await
            .unwrap();
        let wide_number: Value = serde_json::from_str(present).unwrap();
        let games = json!([{"appid":"٤٢"},{"appid":present},{"appid":wide_number},{"appid":"٤٣"},{"appid":absent}]);
        assert_eq!(get_missing_metadata_count(&state, &games).await.unwrap(), 2);
        start_scan_missing(
            Arc::clone(&state),
            &json!([{"appid":"٤٣","name":""},{"appid":absent,"name":""}]),
        )
        .await
        .unwrap();
        state.jobs.drain().await;
        let progress = get_scan_progress(&state).await;
        assert_eq!(progress["total"], 2);
        assert_eq!(progress["completed"], 2);
        assert_eq!(progress["failed"], 2);
        state.http.assert_drained();
        state.shutdown().await.unwrap();
    }

    #[tokio::test]
    async fn null_games_start_empty_completed_jobs_with_baseline_progress_fields() {
        let (_directory, state) = test_state(Vec::new()).await;
        assert_eq!(
            get_missing_metadata_count(&state, &Value::Null)
                .await
                .unwrap(),
            0
        );
        assert!(
            start_scan_missing(Arc::clone(&state), &json!(7))
                .await
                .is_err()
        );
        assert!(
            start_scan_missing(
                Arc::clone(&state),
                &json!([{"appid": "bad", "name": "Bad ID"}]),
            )
            .await
            .is_err()
        );
        assert_eq!(get_scan_progress(&state).await["status"], "idle");
        assert!(
            start_scan_missing(Arc::clone(&state), &Value::Null)
                .await
                .unwrap()["running"]
                .as_bool()
                .unwrap()
        );
        assert!(
            start_refresh_steam_activities(Arc::clone(&state), &Value::Null)
                .await
                .unwrap()["running"]
                .as_bool()
                .unwrap()
        );
        state.jobs.drain().await;
        for progress in [
            get_scan_progress(&state).await,
            get_activity_refresh_progress(&state).await,
        ] {
            assert_eq!(progress["running"], false);
            assert_eq!(progress["status"], "completed");
            assert_eq!(progress["total"], 0);
            assert_eq!(progress["completed"], 0);
            assert_eq!(progress["assigned"], 0);
            assert_eq!(progress["failed"], 0);
            assert_eq!(progress["current"], "");
            assert_eq!(progress["message"], "");
            assert_eq!(progress["error"], "");
        }
        state.http.assert_drained();
        state.shutdown().await.unwrap();
    }

    #[tokio::test]
    async fn target_load_errors_reject_both_job_starts() {
        let (_directory, state) = test_state(Vec::new()).await;
        // A missing file that cannot be re-saved is a real target-load error;
        // invalid JSON now keeps the retained data, like the baseline.
        let settings = state.env.plugin_settings_dir.clone();
        tokio::fs::remove_file(settings.join(crate::storage::SETTINGS_FILE_NAME))
            .await
            .unwrap();
        let read_only = |mode| {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&settings, std::fs::Permissions::from_mode(mode)).unwrap();
        };
        read_only(0o500);

        let games = json!([{"appid":1,"name":"No cached metadata"}]);
        let scan = start_scan_missing(Arc::clone(&state), &games).await;
        let activity = start_refresh_steam_activities(Arc::clone(&state), &games).await;
        state.jobs.drain().await;
        read_only(0o700);

        assert!(scan.is_err());
        assert!(activity.is_err());
        for progress in [
            get_scan_progress(&state).await,
            get_activity_refresh_progress(&state).await,
        ] {
            assert_eq!(progress["status"], "idle");
            assert_eq!(progress["running"], false);
        }
        state.http.assert_drained();
        state.shutdown().await.unwrap();
    }

    #[tokio::test]
    async fn metadata_scan_discards_a_result_when_the_user_edits_the_record_meanwhile() {
        let title = "Edited Mid Scan";
        let (_directory, mut state) = test_state(complete_steam_fixtures(title, 100)).await;
        let gate = Arc::get_mut(&mut state).unwrap().http.gate_next_request();
        start_scan_missing(Arc::clone(&state), &json!([{"appid": 1, "name": title}]))
            .await
            .unwrap();
        tokio::time::timeout(Duration::from_secs(2), gate.started.notified())
            .await
            .unwrap();
        let edit = metadata::save(
            &state,
            &json!(1),
            json!({"title": title, "source": "Manual", "description": "User edit"}),
            false,
            None,
        )
        .await
        .unwrap();
        gate.resume.notify_one();
        state.jobs.drain().await;

        let progress = get_scan_progress(&state).await;
        assert_eq!(progress["completed"], 1);
        assert_eq!(progress["assigned"], 0);
        assert_eq!(progress["failed"], 1);
        assert_eq!(
            progress["message"],
            "Skipped Edited Mid Scan: metadata changed during refresh"
        );
        assert_eq!(state.store().await.unwrap().data()["metadata"]["1"], edit);
        state.http.assert_drained();
        state.shutdown().await.unwrap();
    }

    #[tokio::test]
    async fn passive_activity_refresh_does_not_resurrect_removed_metadata() {
        let (_directory, mut state) = test_state(vec![steam_events(400, json!([event(400)]))]).await;
        set_record(
            &state,
            101,
            json!({"title":"Space Marine","source":"Manual","steam_appid":400,"steam_news":[]}),
        )
        .await;
        let gate = Arc::get_mut(&mut state).unwrap().http.gate_next_request();
        let refreshing = Arc::clone(&state);
        let task =
            tokio::spawn(async move { refresh_steam_activity_for_app(&refreshing, &json!(101)).await });
        tokio::time::timeout(Duration::from_secs(2), gate.started.notified())
            .await
            .unwrap();
        state
            .change(|transaction| transaction.remove(&["metadata", "101"]).map(|_| ()))
            .await
            .unwrap();
        gate.resume.notify_one();

        assert_eq!(task.await.unwrap().unwrap(), None);
        assert!(state.store().await.unwrap().data()["metadata"].get("101").is_none());
        state.http.assert_drained();
        state.shutdown().await.unwrap();
    }

    #[tokio::test]
    async fn activity_batch_discards_a_result_when_the_record_changes_meanwhile() {
        let (_directory, mut state) = test_state(vec![steam_events(400, json!([event(400)]))]).await;
        set_record(
            &state,
            101,
            json!({"title":"Space Marine","source":"Manual","steam_appid":400,"steam_news":[]}),
        )
        .await;
        let gate = Arc::get_mut(&mut state).unwrap().http.gate_next_request();
        start_refresh_steam_activities(
            Arc::clone(&state),
            &json!([{"appid": 101, "name": "Space Marine"}]),
        )
        .await
        .unwrap();
        tokio::time::timeout(Duration::from_secs(2), gate.started.notified())
            .await
            .unwrap();
        let edited = json!({"title":"Space Marine","source":"Manual","steam_appid":401,"steam_news":[]});
        set_record(&state, 101, edited.clone()).await;
        gate.resume.notify_one();
        state.jobs.drain().await;

        let progress = get_activity_refresh_progress(&state).await;
        assert_eq!(progress["assigned"], 0);
        assert_eq!(progress["failed"], 1);
        assert_eq!(state.store().await.unwrap().data()["metadata"]["101"], edited);
        state.http.assert_drained();
        state.shutdown().await.unwrap();
    }

    #[tokio::test]
    async fn metadata_scan_attempts_one_delisted_download_after_it_fails() {
        let titles = ["First Offline", "Second Offline"];
        let mut fixtures = Vec::new();
        for (index, title) in titles.iter().enumerate() {
            fixtures.push(store_search(title, json!([])));
            if index == 0 {
                fixtures.push(Fixture::failure(delisted::STEAM_TRACKER_DELISTED_URL));
            }
            fixtures.extend(
                crate::providers::ign::slug_candidates(title)
                    .iter()
                    .map(|_| post_json(json!({"data":{"objectSelectByTypeAndSlug":null}}))),
            );
            fixtures.push(empty_ign_search());
        }
        let (_directory, state) = test_state(fixtures).await;
        *state.delisted.lock().await = None;
        start_scan_missing(
            Arc::clone(&state),
            &json!([{"appid": 1, "name": titles[0]}, {"appid": 2, "name": titles[1]}]),
        )
        .await
        .unwrap();
        state.jobs.drain().await;

        let progress = get_scan_progress(&state).await;
        assert_eq!(progress["completed"], 2);
        assert_eq!(progress["error"], "");
        state.http.assert_drained();
        state.shutdown().await.unwrap();
    }

    #[tokio::test]
    async fn game_list_rpcs_match_python_truthy_iterable_inputs() {
        let (_directory, state) = test_state(Vec::new()).await;
        let inputs = [
            json!("bad"),
            json!(false),
            json!(0),
            json!(""),
            json!({}),
            Value::Null,
            json!([1, "x", {}]),
        ];
        for games in inputs {
            assert_eq!(get_missing_metadata_count(&state, &games).await.unwrap(), 0);
            assert!(
                start_scan_missing(Arc::clone(&state), &games)
                    .await
                    .unwrap()["running"]
                    .as_bool()
                    .unwrap()
            );
            assert!(
                start_refresh_steam_activities(Arc::clone(&state), &games)
                    .await
                    .unwrap()["running"]
                    .as_bool()
                    .unwrap()
            );
            state.jobs.drain().await;
            for progress in [
                get_scan_progress(&state).await,
                get_activity_refresh_progress(&state).await,
            ] {
                assert_eq!(progress["running"], false);
                assert_eq!(progress["status"], "completed");
                assert_eq!(progress["total"], 0);
                assert_eq!(progress["completed"], 0);
                assert_eq!(progress["assigned"], 0);
                assert_eq!(progress["failed"], 0);
                assert_eq!(progress["current"], "");
                assert_eq!(progress["message"], "");
                assert_eq!(progress["error"], "");
            }
        }
        state.http.assert_drained();
        state.shutdown().await.unwrap();
    }

    #[tokio::test]
    async fn scan_uses_the_current_delisted_index_at_each_fallback() {
        let title = "Fresh Delisted";
        let app_id = 321;
        let mut fixtures = vec![
            store_search(title, json!([])),
            steam_events(app_id, json!([])),
            Fixture::failure(steam_news_url(app_id)),
            steam_compatibility(app_id, Err(())),
            steam_details(app_id, Err(())),
        ];
        fixtures.extend(
            crate::providers::ign::slug_candidates(title)
                .iter()
                .map(|_| post_json(json!({"data":{"objectSelectByTypeAndSlug":null}}))),
        );
        fixtures.push(empty_ign_search());
        let (_directory, mut state) = test_state(fixtures).await;
        let gate = Arc::get_mut(&mut state).unwrap().http.gate_next_request();
        let target = Target {
            app_id: Number::from(1),
            title: title.into(),
            metadata: None,
        };
        let scanning = Arc::clone(&state);
        let task = tokio::spawn(async move { metadata_match(&scanning, &target, &mut false).await });
        tokio::time::timeout(Duration::from_secs(2), gate.started.notified())
            .await
            .unwrap();
        set_delisted(&state, vec![json!([app_id, title])]).await;
        gate.resume.notify_one();

        let result = task.await.unwrap().unwrap();
        assert_eq!(result.metadata.unwrap()["steam_appid"], app_id);
        state.http.assert_drained();
        state.shutdown().await.unwrap();
    }
}
