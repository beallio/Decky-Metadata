use crate::{
    http::Http,
    logging, matching,
    shortcuts_vdf::{self, Shortcut, VdfValue},
    steam_paths,
    storage::{Storage, StoreTransaction},
};
use decky_plugin::Env;
use serde_json::{Value, json};
use std::{collections::HashSet, sync::Arc, time::Duration};
use tokio::sync::{Mutex, MutexGuard, OnceCell};
use tokio_util::sync::CancellationToken;

pub struct AppState {
    pub env: Env,
    pub cancel: CancellationToken,
    pub http: Http,
    pub cef: crate::cef_bridge::BigPictureEvaluator,
    storage: OnceCell<Mutex<Storage>>,
    pub delisted: Mutex<Option<Arc<Value>>>,
    pub provider_cache: Mutex<crate::provider_cache::ProviderCache>,
    pub jobs: crate::scan_runner::Jobs,
    updater_rate_limit: Mutex<Option<chrono::DateTime<chrono::Utc>>>,
}

impl AppState {
    pub fn new(env: Env) -> Result<Arc<Self>, String> {
        let cancel = CancellationToken::new();
        let http = Http::new(cancel.clone(), &env.plugin_version)?;
        let cef = crate::cef_bridge::BigPictureEvaluator::new(cancel.child_token())?;
        Ok(Arc::new(Self {
            env,
            cancel,
            http,
            cef,
            storage: OnceCell::new(),
            delisted: Mutex::new(None),
            provider_cache: Mutex::new(Default::default()),
            jobs: crate::scan_runner::Jobs::new(),
            updater_rate_limit: Mutex::new(None),
        }))
    }

    pub async fn initialize(&self) -> Result<(), String> {
        let log_path = logging::install(&self.env)
            .map(|path| path.to_string_lossy().into_owned())
            .unwrap_or_else(|| "unavailable".to_owned());
        logging::event(
            "load",
            "file logging enabled",
            json!({"path":log_path}),
            log::Level::Info,
        );
        logging::event(
            "load",
            "backend startup begin",
            Value::Null,
            log::Level::Info,
        );
        if self.env.plugin_settings_dir.as_os_str().is_empty() {
            return Err("DECKY_PLUGIN_SETTINGS_DIR is not set".into());
        }
        let cached = read_cached_index(&self.env.plugin_settings_dir).await;
        *self.provider_cache.lock().await = crate::provider_cache::load(
            &self.env.plugin_settings_dir.join(crate::provider_cache::FILENAME),
        ).await;
        let mut storage = Storage::open(self.env.plugin_settings_dir.clone()).await?;
        let loaded = storage.loaded_successfully();
        storage
            .normalize_loaded_store_states(cached.as_deref())
            .await;
        logging::set_debug(matching::py_truthy(
            &storage.data()["settings"]["debug_logging"],
        ));
        *self.delisted.lock().await = cached;
        self.storage
            .set(Mutex::new(storage))
            .map_err(|_| "backend initialized twice".to_owned())?;
        if loaded {
            self.reconcile_update_state().await?;
        }
        let capabilities = tokio::task::spawn_blocking(platform_capabilities)
            .await
            .map_err(|error| error.to_string())?;
        logging::event(
            "platform",
            "capabilities loaded",
            capabilities,
            log::Level::Info,
        );
        logging::event("load", "backend ready", Value::Null, log::Level::Info);
        Ok(())
    }
    async fn reconcile_update_state(&self) -> Result<(), String> {
        let mut snapshot = self.updater_snapshot().await?;
        let pending = snapshot
            .cache
            .get("pending_update_install")
            .filter(|pending| matching::py_truthy(pending))
            .cloned();
        let (message, level) = match pending {
            None => (
                "Startup reconciliation: No pending update found".to_owned(),
                log::Level::Info,
            ),
            Some(pending) => {
                let version = pending.get("version").cloned().unwrap_or(Value::Null);
                let version_text = matching::py_string(&version);
                if version.as_str().is_some_and(|version| {
                    !version.is_empty()
                        && crate::updater::pending::pending_install_matches_loaded_version(
                            version,
                            &self.env.plugin_version,
                        )
                }) {
                    let tag = pending.get("tag").cloned().unwrap_or(Value::Null);
                    (
                        format!(
                            "Startup reconciliation: Pending update promoted (version={version_text}, tag={})",
                            matching::py_string(&tag)
                        ),
                        log::Level::Info,
                    )
                } else if crate::updater::pending::is_fresh_pending_install(
                    &pending,
                    chrono::Utc::now(),
                ) {
                    (
                        format!(
                            "Startup reconciliation: Pending update retained during reload grace window (pending={version_text}, loaded={})",
                            self.env.plugin_version
                        ),
                        log::Level::Info,
                    )
                } else {
                    (
                        format!(
                            "Startup reconciliation: Pending update cleared due to version mismatch (pending={version_text}, loaded={})",
                            self.env.plugin_version
                        ),
                        log::Level::Warn,
                    )
                }
            }
        };
        logging::event("update", &message, Value::Null, level);
        if snapshot.backend.reconcile_pending_install()? {
            let settings = snapshot.backend.settings_payload();
            let cache = snapshot.backend.cache_payload();
            self.change(|transaction| {
                merge_updater_fields(
                    transaction,
                    "update_settings",
                    &snapshot.settings,
                    &settings,
                )?;
                merge_updater_fields(transaction, "update_check_cache", &snapshot.cache, &cache)
            })
            .await?;
        }
        Ok(())
    }

    pub async fn store(&self) -> Result<MutexGuard<'_, Storage>, String> {
        let mut storage = self
            .storage
            .get()
            .ok_or("backend is not initialized")?
            .lock()
            .await;
        if storage.refresh().await? {
            let index = read_cached_index(&self.env.plugin_settings_dir).await;
            storage
                .normalize_loaded_store_states(index.as_deref())
                .await;
            *self.delisted.lock().await = index;
        }
        Ok(storage)
    }

    pub async fn change<R>(
        &self,
        mutation: impl FnOnce(&mut StoreTransaction<'_>) -> Result<R, String>,
    ) -> Result<R, String> {
        let mut storage = self.store().await?;
        if self.cancel.is_cancelled() {
            return Err("backend stopping".into());
        }
        storage.transaction(mutation).await
    }

    pub async fn set_setting(&self, key: &str, value: Value) -> Result<Value, String> {
        self.change(|transaction| {
            transaction.set(&["settings", key], value.clone())?;
            Ok(value)
        })
        .await
    }

    pub async fn ensure_delisted_index(&self, force: bool) -> Option<Arc<Value>> {
        let current = self.delisted.lock().await.clone();
        if self.cancel.is_cancelled() {
            return None;
        }
        if !force
            && current
                .as_ref()
                .is_some_and(|index| crate::providers::delisted::index_is_fresh(index))
        {
            return current;
        }
        let value = crate::providers::delisted::ensure_delisted_index(
            &self.http,
            current.as_deref(),
            &self.env.plugin_settings_dir.join("delisted_index.json"),
            force,
        )
        .await;
        if self.cancel.is_cancelled() {
            return None;
        }
        let value = value.map(Arc::new);
        if value.is_some() {
            *self.delisted.lock().await = value.clone();
        }
        value
    }

    pub async fn delisted_status(&self) -> Value {
        let current = self.delisted.lock().await.clone();
        let current = match current {
            Some(index) => Some(index),
            None => read_cached_index(&self.env.plugin_settings_dir).await,
        };
        if let Some(index) = &current {
            *self.delisted.lock().await = Some(Arc::clone(index));
        }
        json!({"count":current.as_ref().and_then(|index| index["apps"].as_array()).map_or(0,Vec::len),
            "fetched_at":current.as_ref().map(|index| index["fetched_at"].clone()).unwrap_or(json!(0))})
    }

    pub async fn shutdown(&self) -> Result<(), String> {
        logging::event(
            "load",
            "backend unload begin",
            Value::Null,
            log::Level::Info,
        );
        self.cancel.cancel();
        // A replacement already in progress must finish its atomic section.
        tokio::time::timeout(Duration::from_secs(4), async {
            self.jobs.drain().await;
            if let Some(storage) = self.storage.get() {
                let _write = storage.lock().await;
            }
        })
        .await
        .map_err(|_| "backend shutdown timed out".to_owned())?;
        logging::event("load", "backend unloaded", Value::Null, log::Level::Info);
        Ok(())
    }

    pub async fn local_shortcuts(&self) -> Result<Vec<Shortcut>, String> {
        tokio::task::spawn_blocking(read_local_shortcuts)
            .await
            .map_err(|error| error.to_string())
    }

    pub async fn shortcut_name_management(&self, id: &Value) -> Result<Value, String> {
        let Some(id) = crate::storage::positive_shortcut_app_id(id) else {
            return Ok(json!({"eligible":false,"reason":"shortcut_not_found","state":null}));
        };
        let shortcuts = self.local_shortcuts().await?;
        let reason = shortcuts_vdf::name_eligibility(id, &shortcuts);
        let storage = self.store().await?;
        let state = crate::storage::stored_shortcut_name_state(
            &storage.data()["shortcut_names"][id.to_string()],
        );
        Ok(json!({"eligible":reason=="ready","reason":reason,"state":state}))
    }

    pub async fn save_shortcut_name_state(
        &self,
        id: &Value,
        original: &Value,
        applied: &Value,
        steam_id: &Value,
    ) -> Result<Value, String> {
        let id =
            crate::storage::positive_shortcut_app_id(id).ok_or("invalid shortcut name state")?;
        let original = crate::storage::validate_shortcut_name(original)
            .ok_or("invalid shortcut name state")?;
        let applied =
            crate::storage::validate_shortcut_name(applied).ok_or("invalid shortcut name state")?;
        let steam_id = crate::storage::positive_shortcut_app_id(steam_id)
            .ok_or("invalid shortcut name state")?;
        let shortcuts = self.local_shortcuts().await?;
        let reason = shortcuts_vdf::name_eligibility(id, &shortcuts);
        if reason != "ready" {
            return Err(reason.into());
        }
        let key = id.to_string();
        self.change(|transaction| {
            let state = crate::storage::build_shortcut_name_state(
                transaction.get(&["shortcut_names", &key]),
                transaction.get(&["metadata", &key]),
                original,
                applied,
                steam_id,
                chrono::Utc::now().timestamp(),
            )?;
            transaction.set(&["shortcut_names", &key], state.clone())?;
            Ok(state)
        })
        .await
    }

    async fn updater_snapshot(&self) -> Result<UpdateSnapshot, String> {
        let (settings, cache) = {
            let storage = self.store().await?;
            (
                storage.data()["update_settings"].clone(),
                storage.data()["update_check_cache"].clone(),
            )
        };
        let rate_limit = *self.updater_rate_limit.lock().await;
        let mut backend = crate::updater::Updater::new(
            self.http.clone(),
            self.env.plugin_version.clone(),
            &settings,
            &cache,
        );
        backend.rate_limited_until = rate_limit;
        Ok(UpdateSnapshot {
            backend,
            settings,
            cache,
            rate_limit,
        })
    }

    async fn adopt_rate_limit(
        &self,
        before: Option<chrono::DateTime<chrono::Utc>>,
        after: Option<chrono::DateTime<chrono::Utc>>,
    ) {
        let mut current = self.updater_rate_limit.lock().await;
        if *current == before || after > *current {
            *current = after;
        }
    }


    pub async fn updater_call(&self, method: &str, args: &[Value]) -> Result<Value, String> {
        if method == "get_update_settings" {
            return Ok(self.updater_snapshot().await?.backend.settings_payload());
        }
        if method == "get_update_check_context" {
            let mut snapshot = self.updater_snapshot().await?;
            let result = snapshot.backend.context();
            self.adopt_rate_limit(snapshot.rate_limit, snapshot.backend.rate_limited_until)
                .await;
            return Ok(result);
        }
        if method == "check_for_plugin_update" || method == "revalidate_plugin_update" {
            let mut snapshot = self.updater_snapshot().await?;
            let previous_cache = snapshot.backend.cache_payload();
            let result = if method == "check_for_plugin_update" {
                snapshot
                    .backend
                    .check_for_update(&args[0], args.get(1).is_some_and(matching::py_truthy))
                    .await
            } else {
                snapshot.backend.revalidate(&args[0]).await
            };
            self.adopt_rate_limit(snapshot.rate_limit, snapshot.backend.rate_limited_until)
                .await;
            let settings = snapshot.backend.settings_payload();
            let cache = snapshot.backend.cache_payload();
            let persist = cache != previous_cache
                || (method == "revalidate_plugin_update"
                    && snapshot.rate_limit != snapshot.backend.rate_limited_until);
            if persist {
                self.change(|transaction| {
                    let current_channel = transaction
                        .get(&["update_settings", "update_channel"])
                        .and_then(Value::as_str)
                        .filter(|channel| *channel == "stable" || *channel == "development")
                        .unwrap_or("stable");
                    if method == "check_for_plugin_update"
                        && current_channel
                            != settings["update_channel"].as_str().unwrap_or("stable")
                    {
                        logging::event(
                            "update",
                            "Update channel changed during check; stale result was not cached",
                            Value::Null,
                            log::Level::Info,
                        );
                        return Ok(());
                    }
                    merge_updater_fields(
                        transaction,
                        "update_settings",
                        &snapshot.settings,
                        &settings,
                    )?;
                    merge_updater_fields(transaction, "update_check_cache", &snapshot.cache, &cache)
                })
                .await?;
            }
            return result;
        }
        let rate_limit = *self.updater_rate_limit.lock().await;
        let mut storage = self.store().await?;
        if self.cancel.is_cancelled() {
            return Err("backend stopping".into());
        }
        let result = storage.transaction(|transaction| {
            let mut backend = crate::updater::Updater::new(
                self.http.clone(),
                self.env.plugin_version.clone(),
                transaction
                    .get(&["update_settings"])
                    .unwrap_or(&Value::Null),
                transaction
                    .get(&["update_check_cache"])
                    .unwrap_or(&Value::Null),
            );
            backend.rate_limited_until = rate_limit;
            let previous_cache = backend.cache_payload();
            let result = match method {
                "set_update_channel" => {
                    backend.set_channel(&args[0])?;
                    backend.settings_payload()
                }
                "set_automatic_update_checks" => {
                    backend.set_automatic_checks(&args[0])?;
                    backend.settings_payload()
                }
                "record_update_install_requested" => backend.record_install_requested(&args[0])?,
                "confirm_update_install_handoff" => backend.confirm_install_handoff(&args[0])?,
                "clear_pending_update_install" => backend.clear_pending_install(args.first())?,
                _ => return Err(format!("unknown updater method {method}")),
            };
            let cache = backend.cache_payload();
            if matches!(
                method,
                "set_update_channel"
                    | "set_automatic_update_checks"
                    | "record_update_install_requested"
            ) || cache != previous_cache
            {
                transaction.set(&["update_settings"], backend.settings_payload())?;
                transaction.set(&["update_check_cache"], cache)?;
            }
            Ok(result)
        })
        .await?;
        if method == "record_update_install_requested" {
            // The next start may be an older version that reads only the single settings file.
            storage.export_legacy().await?;
        }
        Ok(result)
    }
}

struct UpdateSnapshot {
    backend: crate::updater::Updater,
    settings: Value,
    cache: Value,
    rate_limit: Option<chrono::DateTime<chrono::Utc>>,
}

fn merge_updater_fields(
    transaction: &mut StoreTransaction<'_>,
    root: &str,
    before: &Value,
    after: &Value,
) -> Result<(), String> {
    let mut merged = transaction
        .get(&[root])
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    if let Some(before) = before.as_object() {
        for (key, value) in before {
            if after.get(key).is_none() && merged.get(key) == Some(value) {
                merged.remove(key);
            }
        }
    }
    if let Some(after) = after.as_object() {
        for (key, value) in after {
            if before.get(key) != Some(value) && merged.get(key) == before.get(key) {
                merged.insert(key.clone(), value.clone());
            }
        }
    }
    let next = Value::Object(merged);
    if transaction.get(&[root]) != Some(&next) {
        transaction.set(&[root], next)?;
    }
    Ok(())
}

async fn read_cached_index(settings: &std::path::Path) -> Option<Arc<Value>> {
    crate::providers::delisted::load_delisted_index(&settings.join("delisted_index.json"))
        .await
        .map(Arc::new)
}

fn read_local_shortcuts() -> Vec<Shortcut> {
    let mut result = Vec::new();
    let mut seen = HashSet::new();
    for root in steam_paths::userdata_roots_from_candidates(&steam_paths::discover_steam_roots()) {
        let Ok(users) = std::fs::read_dir(root) else {
            continue;
        };
        for user in users.flatten().filter(|entry| entry.path().is_dir()) {
            let path = user.path().join("config/shortcuts.vdf");
            for mut shortcut in shortcuts_vdf::read_shortcuts_vdf(&path) {
                shortcut.name = matching::clean_game_title(&shortcut.name);
                let key = (
                    shortcut.app_id,
                    shortcut.name.clone(),
                    shortcut.exe.clone(),
                    shortcut.launch_options.clone(),
                );
                if shortcut.app_id == 0 || shortcut.name.is_empty() || !seen.insert(key) {
                    continue;
                }
                shortcut.steam_user_id = user.file_name().to_string_lossy().into_owned();
                result.push(shortcut);
            }
        }
    }
    result
}

fn vdf_json(value: &VdfValue) -> Value {
    match value {
        VdfValue::Object(values) => Value::Object(
            values
                .iter()
                .map(|(key, value)| (key.clone(), vdf_json(value)))
                .collect(),
        ),
        VdfValue::String(value) => json!(value),
        VdfValue::Signed(value) => json!(value),
        VdfValue::Unsigned(value) => json!(value),
    }
}

pub fn shortcut_json(shortcut: &Shortcut) -> Value {
    json!({"name":shortcut.name,"exe":shortcut.exe,"exe_raw":shortcut.exe_raw,"start_dir":shortcut.start_dir,
        "launch_options":shortcut.launch_options,"shortcut_path":shortcut.shortcut_path,"icon":shortcut.icon,
        "appid":shortcut.app_id,"appid_raw":shortcut.appid_raw.as_ref().map(vdf_json),"app_id":shortcut.app_id,
        "source":"steam_shortcuts_vdf","steam_user_id":shortcut.steam_user_id,"shortcut_file":shortcut.shortcut_file.to_string_lossy(),
        "isNonSteam":true})
}

pub async fn system_versions(env: &Env) -> Value {
    let decky = env.decky_version.trim();
    let contents = tokio::fs::read("/etc/os-release").await.unwrap_or_default();
    let steamos = parse_os_release_field(&String::from_utf8_lossy(&contents), "VERSION_ID");
    json!({"decky":if decky.is_empty() {"Unknown"} else {decky},"steamos":if steamos.is_empty() {"Unknown"} else {&steamos}})
}

fn parse_os_release_field(contents: &str, key: &str) -> String {
    for line in contents.lines().map(str::trim) {
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let Some((name, value)) = line.split_once('=') else {
            continue;
        };
        if name.trim() != key {
            continue;
        }
        let value = value.trim();
        let value = if value.len() >= 2
            && ((value.starts_with('"') && value.ends_with('"'))
                || (value.starts_with('\'') && value.ends_with('\'')))
        {
            &value[1..value.len() - 1]
        } else {
            value
        };
        return value.trim().into();
    }
    String::new()
}

pub fn platform_capabilities() -> Value {
    let roots = steam_paths::discover_steam_roots();
    json!({"platform":std::env::consts::OS,"os_name":if cfg!(unix) {"posix"} else {"nt"},
        "is_linux":cfg!(target_os="linux"),"is_steamos":steam_paths::is_steamos(),
        "steam_root":roots.first().map(|path| path.to_string_lossy().into_owned()).unwrap_or_default(),"steam_roots":roots,
        "supports_metadata":true,"supports_steam_activity":true})
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::http::Fixture;
    use std::os::unix::fs::PermissionsExt;

    struct TestRoot(std::path::PathBuf);

    impl TestRoot {
        async fn state(http: Http) -> (Self, Arc<AppState>) {
            static NEXT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
            let base = std::env::var_os("TMPDIR")
                .map(std::path::PathBuf::from)
                .unwrap_or_else(|| "/var/tmp/omp-1000".into());
            let root = Self(base.join(format!(
                "metadata-updater-state-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
            )));
            std::fs::create_dir_all(&root.0).unwrap();
            std::fs::set_permissions(&root.0, std::fs::Permissions::from_mode(0o700)).unwrap();
            let mut state = AppState::new(Env {
                plugin_settings_dir: root.0.join("settings"),
                plugin_runtime_dir: root.0.join("runtime"),
                plugin_log_dir: root.0.join("logs"),
                plugin_version: "0.5.5".into(),
                ..Default::default()
            })
            .unwrap();
            let inner = Arc::get_mut(&mut state).unwrap();
            inner.cancel = http.cancel.clone();
            inner.http = http;
            state.initialize().await.unwrap();
            (root, state)
        }
    }

    impl Drop for TestRoot {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    fn empty_release_check() -> Http {
        Http::fixtures(vec![Fixture::json(
            "https://api.github.com/repos/beallio/Decky-Metadata/releases",
            json!([]),
        )])
    }

    #[tokio::test]
    async fn channel_change_during_check_does_not_cache_the_old_channel() {
        let mut http = empty_release_check();
        let gate = http.gate_next_request();
        let (_root, state) = TestRoot::state(http).await;
        let checking = Arc::clone(&state);
        let task = tokio::spawn(async move {
            checking
                .updater_call("check_for_plugin_update", &[json!("0.5.5"), json!(true)])
                .await
        });
        tokio::time::timeout(Duration::from_secs(2), gate.started.notified())
            .await
            .unwrap();
        tokio::time::timeout(
            Duration::from_secs(2),
            state.updater_call("set_update_channel", &[json!("development")]),
        )
        .await
        .unwrap()
        .unwrap();
        gate.resume.notify_one();
        assert_eq!(task.await.unwrap().unwrap()["status"], "current");
        let storage = state.store().await.unwrap();
        assert_eq!(
            storage.data()["update_settings"]["update_channel"],
            "development"
        );
        assert!(storage.data()["update_check_cache"]["last_checked_at"].is_null());
        drop(storage);
        state.http.assert_drained();
        state.shutdown().await.unwrap();
    }

    #[tokio::test]
    async fn delayed_check_preserves_concurrent_metadata_and_install_handoff() {
        let mut http = empty_release_check();
        let gate = http.gate_next_request();
        let (_root, state) = TestRoot::state(http).await;
        let checking = Arc::clone(&state);
        let task = tokio::spawn(async move {
            checking
                .updater_call("check_for_plugin_update", &[json!("0.5.5"), json!(true)])
                .await
        });
        tokio::time::timeout(Duration::from_secs(2), gate.started.notified())
            .await
            .unwrap();
        tokio::time::timeout(Duration::from_secs(2),crate::metadata::save(&state,&json!(42),
            json!({"title":"Concurrent user edit","source":"Manual","description":"Keep this edit"}),false,None)).await.unwrap().unwrap();
        state
            .updater_call(
                "record_update_install_requested",
                &[json!({"version":"0.5.6","tag":"v0.5.6","channel":"stable"})],
            )
            .await
            .unwrap();
        // An older version installed by this handoff reads only the single settings file.
        let exported: Value = serde_json::from_slice(
            &std::fs::read(state.env.plugin_settings_dir.join(crate::storage::SETTINGS_FILE_NAME)).unwrap(),
        )
        .unwrap();
        assert_eq!(exported["metadata"]["42"]["title"], "Concurrent user edit");
        assert_eq!(exported["update_check_cache"]["pending_update_install"]["version"], "0.5.6");
        gate.resume.notify_one();
        assert_eq!(task.await.unwrap().unwrap()["status"], "current");
        let storage = state.store().await.unwrap();
        assert_eq!(
            storage.data()["metadata"]["42"]["title"],
            "Concurrent user edit"
        );
        assert_eq!(
            storage.data()["update_check_cache"]["pending_update_install"]["version"],
            "0.5.6"
        );
        assert_eq!(
            storage.data()["update_check_cache"]["last_checked_channel"],
            "stable"
        );
        assert_eq!(
            storage.data()["update_check_cache"]["last_checked_version"],
            "0.5.5"
        );
        drop(storage);
        state.http.assert_drained();
        state.shutdown().await.unwrap();
    }

    #[tokio::test]
    async fn failed_updater_save_returns_failure_without_publishing_settings() {
        let (_root, state) = TestRoot::state(Http::fixtures(vec![])).await;
        let before = state
            .updater_call("set_automatic_update_checks", &[json!(false)])
            .await
            .unwrap();
        let file = state.env.plugin_settings_dir.join("decky_metadata.json");
        let persisted = tokio::fs::read(&file).await.unwrap();
        tokio::fs::create_dir(
            state
                .env
                .plugin_settings_dir
                .join("decky_metadata.json.tmp"),
        )
        .await
        .unwrap();
        let result = crate::rpc::dispatch(
            Arc::clone(&state),
            "set_update_channel",
            vec![json!("development")],
        )
        .await
        .unwrap();
        assert_eq!(result["status"], "failed");
        assert_eq!(
            state
                .updater_call("get_update_settings", &[])
                .await
                .unwrap(),
            before
        );
        assert_eq!(tokio::fs::read(file).await.unwrap(), persisted);
        state.http.assert_drained();
        state.shutdown().await.unwrap();
    }
    #[test]
    fn shortcut_json_lossily_serializes_non_utf8_file_paths() {
        use std::os::unix::ffi::OsStringExt;

        let shortcut = Shortcut {
            name: "Game".into(),
            exe: "game.exe".into(),
            exe_raw: "game.exe".into(),
            start_dir: String::new(),
            launch_options: String::new(),
            shortcut_path: String::new(),
            icon: String::new(),
            appid_raw: None,
            app_id: 42,
            source: "steam_shortcuts_vdf",
            steam_user_id: "1".into(),
            shortcut_file: std::path::PathBuf::from(std::ffi::OsString::from_vec(vec![0xff])),
        };
        assert_eq!(shortcut_json(&shortcut)["shortcut_file"], "�");
    }

    #[tokio::test]
    async fn startup_logs_match_baseline_events_and_levels() {
        let (_root, state) = TestRoot::state(Http::fixtures(vec![])).await;
        let events = crate::logging::test_events();
        let expected = [
            "INFO [decky:load] file logging enabled path=",
            "INFO [decky:load] backend startup begin",
            "INFO [decky:update] Startup reconciliation: No pending update found",
            "INFO [decky:platform] capabilities loaded",
            "INFO [decky:load] backend ready",
        ];
        let mut previous = 0;
        for expected in expected {
            let position = events
                .iter()
                .position(|event| event.contains(expected))
                .unwrap_or_else(|| panic!("missing startup event: {expected}"));
            assert!(position >= previous);
            previous = position;
        }
        state.http.assert_drained();
        state.shutdown().await.unwrap();
    }

    #[tokio::test]
    async fn minimum_delisted_timestamp_is_stale_without_overflow() {
        let (_root, state) = TestRoot::state(Http::fixtures(vec![])).await;
        let index = json!({"fetched_at":i64::MIN,"apps":[]});
        *state.delisted.lock().await = Some(Arc::new(index.clone()));

        assert_eq!(*state.ensure_delisted_index(false).await.unwrap(), index);
        state.http.assert_drained();
        state.shutdown().await.unwrap();
    }
}
