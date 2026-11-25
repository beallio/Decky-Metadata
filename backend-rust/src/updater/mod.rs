pub mod client;
pub mod discovery;
pub mod models;
pub mod pending;
pub mod rate_limit;
pub mod testing;

use crate::{
    http::Http,
    matching::{py_string, py_truthy},
    updater::{
        client::GitHubReleaseClient,
        discovery::{
            PrevalidatedRelease, manifest_url, prevalidate_release_candidate, select_candidate,
            validate_manifest_candidate,
        },
        models::{UpdateCandidate, isoformat_utc, parse_iso_datetime},
        pending::{
            effective_pending_install_version, is_fresh_pending_install,
            pending_install_matches_loaded_version,
        },
        rate_limit::retry_after_until,
    },
};
use chrono::{DateTime, Duration, Utc};
use log::Level;
use serde_json::{Map, Value, json};

const MAX_MANIFEST_FETCH_ATTEMPTS: usize = 5;
const CACHE_VALIDITY: Duration = Duration::hours(24);

#[derive(Clone)]
pub struct Updater {
    client: GitHubReleaseClient,
    installed_version: String,
    settings: Value,
    cache: Value,
    pub rate_limited_until: Option<DateTime<Utc>>,
    #[cfg(test)]
    test_now: Option<DateTime<Utc>>,
}

impl Updater {
    pub fn new(http: Http, installed_version: String, settings: &Value, cache: &Value) -> Self {
        let channel = settings
            .get("update_channel")
            .and_then(Value::as_str)
            .filter(|channel| matches!(*channel, "stable" | "development"))
            .unwrap_or("stable");
        let automatic_checks = settings
            .get("automatic_update_checks")
            .and_then(Value::as_bool)
            .unwrap_or(true);
        let testing_tab_enabled = settings
            .get("testing_tab_enabled")
            .and_then(Value::as_bool)
            .unwrap_or(false);
        let mut normalized_settings = Map::new();
        normalized_settings.insert("update_channel".to_owned(), json!(channel));
        normalized_settings.insert(
            "automatic_update_checks".to_owned(),
            json!(automatic_checks),
        );
        normalized_settings.insert(
            "testing_tab_enabled".to_owned(),
            json!(testing_tab_enabled),
        );

        let mut cache = cache
            .as_object()
            .cloned()
            .map(Value::Object)
            .unwrap_or_else(|| json!({}));
        if cache.get("pending_update_install").is_some_and(|pending| {
            !pending.is_null()
                && (pending.as_object().is_none() || pending.get("version").is_none())
        }) {
            cache
                .as_object_mut()
                .unwrap()
                .remove("pending_update_install");
        }
        for key in ["last_checked_at", "installed_release_published_at"] {
            if cache
                .get(key)
                .is_some_and(|value| !value.is_null() && !value.is_string())
            {
                cache.as_object_mut().unwrap().remove(key);
            }
        }
        if cache
            .get("last_result")
            .is_some_and(|value| !value.is_object())
        {
            cache.as_object_mut().unwrap().remove("last_result");
        }

        Self {
            client: GitHubReleaseClient::new(http, &installed_version),
            installed_version,
            settings: Value::Object(normalized_settings),
            cache,
            rate_limited_until: None,
            #[cfg(test)]
            test_now: None,
        }
    }

    fn now(&self) -> DateTime<Utc> {
        #[cfg(test)]
        if let Some(now) = &self.test_now {
            return now.to_owned();
        }
        Utc::now()
    }

    fn channel(&self) -> &str {
        self.settings
            .get("update_channel")
            .and_then(Value::as_str)
            .unwrap_or("stable")
    }

    pub fn settings_payload(&self) -> Value {
        self.settings.clone()
    }

    pub fn cache_payload(&self) -> Value {
        self.cache.clone()
    }

    pub fn set_channel(&mut self, channel: &Value) -> Result<(), String> {
        let channel = channel
            .as_str()
            .filter(|channel| matches!(*channel, "stable" | "development"))
            .unwrap_or("stable");
        self.settings["update_channel"] = json!(channel);
        crate::logging::event(
            "update",
            "Update channel changed",
            json!({"channel": channel}),
            Level::Info,
        );
        Ok(())
    }

    pub fn set_automatic_checks(&mut self, enabled: &Value) -> Result<(), String> {
        let enabled = py_truthy(enabled);
        self.settings["automatic_update_checks"] = json!(enabled);
        crate::logging::event(
            "update",
            "Automatic update checks changed",
            json!({"enabled": enabled}),
            Level::Info,
        );
        Ok(())
    }

    pub fn set_testing_tab_enabled(&mut self, enabled: &Value) -> Result<(), String> {
        let enabled = py_truthy(enabled);
        self.settings["testing_tab_enabled"] = json!(enabled);
        crate::logging::event(
            "update",
            "Testing tab visibility changed",
            json!({"enabled": enabled}),
            Level::Info,
        );
        Ok(())
    }

    pub fn context(&mut self) -> Value {
        let now = self.now();
        let rate_limited_until = match self.rate_limited_until.clone() {
            Some(until) if now >= until => {
                self.rate_limited_until = None;
                None
            }
            Some(until) => Some(isoformat_utc(until)),
            None => None,
        };
        let pending = self
            .cache
            .get("pending_update_install")
            .cloned()
            .unwrap_or(Value::Null);
        json!({
            "update_channel": self.channel(),
            "automatic_update_checks": self.settings["automatic_update_checks"],
            "testing_tab_enabled": self.settings["testing_tab_enabled"],
            "installed_version": self.installed_version,
            "last_checked_at": self.cache.get("last_checked_at").cloned().unwrap_or(Value::Null),
            "last_checked_channel": self.cache.get("last_checked_channel").cloned().unwrap_or(Value::Null),
            "last_available_tag": self.cache.get("last_available_tag").cloned().unwrap_or(Value::Null),
            "last_notified_tag": self.cache.get("last_notified_tag").cloned().unwrap_or(Value::Null),
            "installed_release_tag": self.cache.get("installed_release_tag").cloned().unwrap_or(Value::Null),
            "installed_release_published_at": self.cache.get("installed_release_published_at").cloned().unwrap_or(Value::Null),
            "pending_update_install": pending,
            "rate_limited_until": rate_limited_until
        })
    }

    fn clear_stale_cache(&mut self) {
        let cache = self
            .cache
            .as_object_mut()
            .expect("cache is normalized to an object");
        cache.remove("last_result");
        cache.remove("last_available_tag");
        cache.remove("last_checked_version");
    }

    fn cached_result(
        &self,
        current_version: &str,
        channel: &str,
        now: DateTime<Utc>,
    ) -> Option<Value> {
        let last_checked_at = self.cache.get("last_checked_at")?.as_str()?;
        let last_checked_at = parse_iso_datetime(last_checked_at)?;
        if now - last_checked_at >= CACHE_VALIDITY
            || self
                .cache
                .get("last_checked_channel")
                .and_then(Value::as_str)
                != Some(channel)
            || self
                .cache
                .get("last_checked_version")
                .and_then(Value::as_str)
                != Some(current_version)
        {
            return None;
        }
        let mut result = self.cache.get("last_result")?.as_object()?.clone();
        result.remove("checked_version");
        Some(Value::Object(result))
    }

    pub async fn check_for_update(
        &mut self,
        current_version: &Value,
        force: bool,
    ) -> Result<Value, String> {
        let current_version = current_version
            .as_str()
            .ok_or_else(|| "current version must be a string".to_owned())?;
        let channel_snapshot = self.channel().to_owned();
        let now = self.now();

        if !force {
            let pending = self
                .cache
                .get("pending_update_install")
                .cloned()
                .unwrap_or(Value::Null);
            if effective_pending_install_version(&pending, now).as_deref() == Some(current_version)
            {
                return Ok(json!({
                    "status": "current",
                    "checked_at": isoformat_utc(now),
                    "channel": channel_snapshot
                }));
            }
        }

        if let Some(until) = self
            .rate_limited_until
            .as_ref()
            .filter(|until| now < **until)
        {
            return Ok(json!({
                "status": "failed",
                "checked_at": isoformat_utc(now),
                "message": "rate_limit_cooldown_skipped",
                "retry_after": isoformat_utc(until.to_owned())
            }));
        }

        if !force {
            if let Some(result) = self.cached_result(current_version, &channel_snapshot, now) {
                return Ok(result);
            }
        }

        let response = self.client.list_releases().await;
        let checked_at = isoformat_utc(self.now());
        if matches!(response.status, 403 | 429) {
            let until = retry_after_until(&response.headers, self.now());
            let retry_after = isoformat_utc(until);
            self.rate_limited_until = Some(until);
            let message = response
                .body
                .get("message")
                .map(py_string)
                .unwrap_or_else(|| "rate_limited".to_owned());
            crate::logging::event(
                "update",
                "GitHub release discovery was rate limited",
                json!({"status": response.status, "message": message}),
                Level::Warn,
            );
            return Ok(json!({
                "status": "failed",
                "checked_at": checked_at,
                "message": message,
                "retry_after": retry_after
            }));
        }
        if response.status != 200 || !response.body.is_array() {
            let mut message = "update_check_failed".to_owned();
            let body = response.body.as_object();
            let raw_message = body.and_then(|body| {
                body.get("message")
                    .or_else(|| body.get("error"))
                    .map(py_string)
            });
            if let Some(raw_message) = raw_message.filter(|message| !message.is_empty()) {
                message = raw_message;
            }
            if response.status == 404 {
                message = "releases_not_accessible".to_owned();
            }
            crate::logging::event(
                "update",
                "GitHub release discovery failed",
                json!({"status": response.status, "message": message}),
                Level::Error,
            );
            return Ok(json!({"status": "failed", "checked_at": checked_at, "message": message}));
        }

        let mut releases = Vec::<PrevalidatedRelease<'_>>::new();
        for release in response.body.as_array().unwrap() {
            let Some(prevalidated) = prevalidate_release_candidate(release) else {
                continue;
            };
            if channel_snapshot == "stable" && prevalidated.prerelease {
                continue;
            }
            releases.push(prevalidated);
        }
        releases.sort_by(|left, right| {
            right
                .version
                .cmp(&left.version)
                .then_with(|| right.published_at.cmp(&left.published_at))
        });

        let mut selected = None;
        for prevalidated in releases.iter().take(MAX_MANIFEST_FETCH_ATTEMPTS) {
            let manifest_response = self.client.get_manifest(&manifest_url(prevalidated)).await;
            if matches!(manifest_response.status, 403 | 429) {
                let until = retry_after_until(&manifest_response.headers, self.now());
                self.rate_limited_until = Some(until);
                crate::logging::event(
                    "update",
                    "GitHub release manifest download was rate limited",
                    json!({"status": manifest_response.status, "tag": prevalidated.tag_name}),
                    Level::Warn,
                );
                return Ok(json!({
                    "status": "failed",
                    "checked_at": checked_at,
                    "message": "rate_limited",
                    "retry_after": isoformat_utc(until)
                }));
            }
            // An undownloadable manifest leaves this release unknown, so "current" would be a guess.
            if manifest_response.status != 200 {
                crate::logging::event(
                    "update",
                    "GitHub release manifest download failed",
                    json!({"status": manifest_response.status, "tag": prevalidated.tag_name}),
                    Level::Error,
                );
                return Ok(json!({
                    "status": "failed",
                    "checked_at": checked_at,
                    "message": "manifest_download_failed"
                }));
            }
            if let Some(candidate) =
                validate_manifest_candidate(prevalidated, &manifest_response.body)
            {
                selected = Some(candidate);
                break;
            }
        }
        let candidate = selected.and_then(|candidate| {
            select_candidate(&[candidate], current_version, &channel_snapshot)
        });
        let mut result = if let Some(candidate) = &candidate {
            json!({
                "status": "available",
                "checked_at": checked_at,
                "checked_version": current_version,
                "channel": channel_snapshot,
                "candidate": candidate_value(candidate)
            })
        } else {
            json!({
                "status": "current",
                "checked_at": checked_at,
                "checked_version": current_version,
                "channel": channel_snapshot
            })
        };
        if self.channel() == channel_snapshot {
            let cache = self
                .cache
                .as_object_mut()
                .expect("cache is normalized to an object");
            cache.insert("last_checked_at".to_owned(), json!(checked_at));
            cache.insert("last_checked_channel".to_owned(), json!(channel_snapshot));
            cache.insert("last_checked_version".to_owned(), json!(current_version));
            cache.insert("last_result".to_owned(), result.clone());
            if let Some(candidate) = &candidate {
                cache.insert("last_available_tag".to_owned(), json!(candidate.tag));
            }
        }
        result.as_object_mut().unwrap().remove("checked_version");
        Ok(result)
    }

    pub async fn revalidate(&mut self, candidate: &Value) -> Result<Value, String> {
        let candidate_record = candidate
            .as_object()
            .ok_or_else(|| "candidate must be an object".to_owned())?;
        let now = self.now();
        if let Some(until) = self.rate_limited_until.clone() {
            if now < until {
                return Ok(json!({
                    "status": "failed",
                    "checked_at": isoformat_utc(now),
                    "message": "rate_limit_cooldown",
                    "retry_after": isoformat_utc(until)
                }));
            }
            self.rate_limited_until = None;
        }
        let tag = candidate_record
            .get("tag")
            .and_then(Value::as_str)
            .filter(|tag| !tag.is_empty());
        let Some(tag) = tag else {
            return Ok(
                json!({"status": "failed", "checked_at": isoformat_utc(self.now()), "message": "candidate_missing_tag"}),
            );
        };
        let response = self.client.get_release(tag).await;
        if matches!(response.status, 403 | 429) {
            let until = retry_after_until(&response.headers, self.now());
            let retry_after = isoformat_utc(until);
            self.rate_limited_until = Some(until);
            let message = response
                .body
                .get("message")
                .map(py_string)
                .unwrap_or_else(|| "rate_limited".to_owned());
            return Ok(json!({
                "status": "failed",
                "checked_at": isoformat_utc(self.now()),
                "message": message,
                "retry_after": retry_after
            }));
        }
        if response.status != 200 || !response.body.is_object() {
            crate::logging::event(
                "update",
                "Revalidation release fetch failed",
                json!({"status": response.status, "tag": tag}),
                Level::Error,
            );
            return Ok(json!({
                "status": "failed",
                "checked_at": isoformat_utc(self.now()),
                "message": "release_fetch_failed"
            }));
        }
        let Some(prevalidated) = prevalidate_release_candidate(&response.body) else {
            return Ok(json!({
                "status": "failed",
                "checked_at": isoformat_utc(self.now()),
                "message": "revalidation_failed"
            }));
        };
        let manifest_response = self.client.get_manifest(&manifest_url(&prevalidated)).await;
        let validated = if manifest_response.status == 200 {
            validate_manifest_candidate(&prevalidated, &manifest_response.body)
        } else {
            None
        };
        let Some(validated) = validated else {
            return Ok(json!({
                "status": "failed",
                "checked_at": isoformat_utc(self.now()),
                "message": "revalidation_failed"
            }));
        };

        if candidate_record.get("sha256").and_then(Value::as_str) != Some(validated.sha256.as_str())
        {
            crate::logging::event(
                "update",
                "Revalidation SHA-256 mismatch",
                json!({}),
                Level::Error,
            );
            return Ok(json!({
                "status": "failed",
                "checked_at": isoformat_utc(self.now()),
                "message": "revalidation_sha_mismatch"
            }));
        }
        if candidate_record.get("artifact_url").and_then(Value::as_str)
            != Some(validated.artifact_url.as_str())
        {
            return Ok(json!({
                "status": "failed",
                "checked_at": isoformat_utc(self.now()),
                "message": "revalidation_url_mismatch"
            }));
        }
        if candidate_record.get("version").and_then(Value::as_str)
            != Some(validated.version.as_str())
        {
            return Ok(json!({
                "status": "failed",
                "checked_at": isoformat_utc(self.now()),
                "message": "revalidation_version_mismatch"
            }));
        }
        let action = candidate_record
            .get("action")
            .cloned()
            .unwrap_or_else(|| json!("update"));
        Ok(json!({
            "version": validated.version,
            "tag": validated.tag,
            "channel": validated.channel,
            "artifact_url": validated.artifact_url,
            "sha256": validated.sha256,
            "release_url": validated.release_url,
            "published_at": validated.published_at,
            "action": action
        }))
    }

    pub fn record_install_requested(&mut self, candidate: &Value) -> Result<Value, String> {
        let candidate = candidate
            .as_object()
            .ok_or_else(|| "candidate must be an object".to_owned())?;
        let mut pending = Map::new();
        for key in ["version", "tag", "channel", "published_at"] {
            pending.insert(
                key.to_owned(),
                candidate.get(key).cloned().unwrap_or(Value::Null),
            );
        }
        pending.insert("requested_at".to_owned(), json!(isoformat_utc(self.now())));
        pending.insert(
            "update_trace_id".to_owned(),
            candidate
                .get("updateTraceId")
                .cloned()
                .unwrap_or(Value::Null),
        );
        self.cache["pending_update_install"] = Value::Object(pending);
        self.clear_stale_cache();
        crate::logging::event(
            "update",
            "Pending install recorded",
            json!({
                "version": candidate.get("version"),
                "tag": candidate.get("tag"),
                "channel": candidate.get("channel"),
                "action": candidate.get("action"),
                "trace_id": candidate.get("updateTraceId")
            }),
            Level::Info,
        );
        Ok(self.context())
    }

    pub fn confirm_install_handoff(&mut self, version: &Value) -> Result<Value, String> {
        let matches = self
            .cache
            .get("pending_update_install")
            .and_then(Value::as_object)
            .and_then(|pending| pending.get("version"))
            == Some(version);
        if matches {
            self.cache["pending_update_install"]["handoff_confirmed_at"] =
                json!(isoformat_utc(self.now()));
            self.clear_stale_cache();
        }
        Ok(self.context())
    }

    pub fn clear_pending_install(&mut self, version: Option<&Value>) -> Result<Value, String> {
        let pending = self.cache.get("pending_update_install");
        let should_clear = pending.is_some_and(py_truthy)
            && version.is_none_or(|version| {
                version.is_null()
                    || pending.and_then(|pending| pending.get("version")) == Some(version)
            });
        if should_clear {
            self.cache
                .as_object_mut()
                .unwrap()
                .remove("pending_update_install");
            self.clear_stale_cache();
        }
        Ok(self.context())
    }

    pub fn reconcile_pending_install(&mut self) -> Result<bool, String> {
        let pending = self
            .cache
            .get("pending_update_install")
            .cloned()
            .unwrap_or(Value::Null);
        if !py_truthy(&pending) {
            return Ok(false);
        }
        let pending_version = pending.get("version").and_then(Value::as_str);
        if pending_version.is_some_and(|version| {
            !version.is_empty()
                && pending_install_matches_loaded_version(version, &self.installed_version)
        }) {
            let cache = self.cache.as_object_mut().unwrap();
            cache.insert(
                "installed_release_tag".to_owned(),
                pending.get("tag").cloned().unwrap_or(Value::Null),
            );
            cache.insert(
                "installed_release_published_at".to_owned(),
                pending.get("published_at").cloned().unwrap_or(Value::Null),
            );
            cache.remove("pending_update_install");
            self.clear_stale_cache();
            return Ok(true);
        }
        if is_fresh_pending_install(&pending, self.now()) {
            return Ok(false);
        }
        self.cache
            .as_object_mut()
            .unwrap()
            .remove("pending_update_install");
        self.clear_stale_cache();
        Ok(true)
    }

    fn rate_limit_failure(
        &mut self,
        response: &models::JsonResponse,
        context: &str,
    ) -> Option<Value> {
        if !matches!(response.status, 403 | 429) {
            return None;
        }
        let now = self.now();
        let until = retry_after_until(&response.headers, now);
        let retry_after = isoformat_utc(until);
        self.rate_limited_until = Some(until);
        let message = response
            .body
            .get("message")
            .map(py_string)
            .filter(|message| !message.is_empty())
            .unwrap_or_else(|| "rate_limited".to_owned());
        crate::logging::event(
            "update",
            context,
            json!({"status": response.status, "message": message}),
            Level::Warn,
        );
        Some(json!({
            "status": "failed",
            "checked_at": isoformat_utc(now),
            "message": message,
            "retry_after": retry_after
        }))
    }

    pub async fn list_testing_versions(&mut self) -> Result<Value, String> {
        let now = self.now();
        if let Some(until) = self.rate_limited_until.clone() {
            if now < until {
                return Ok(json!({
                    "status": "failed",
                    "checked_at": isoformat_utc(now),
                    "message": "rate_limit_cooldown",
                    "retry_after": isoformat_utc(until)
                }));
            }
            self.rate_limited_until = None;
        }
        let response = self.client.list_open_pulls().await;
        if let Some(failure) =
            self.rate_limit_failure(&response, "GitHub PR discovery was rate limited")
        {
            return Ok(failure);
        }
        let checked_at = isoformat_utc(self.now());
        if response.status != 200 || !response.body.is_array() {
            crate::logging::event(
                "update",
                "GitHub PR discovery failed",
                json!({"status": response.status}),
                Level::Error,
            );
            return Ok(json!({
                "status": "failed",
                "checked_at": checked_at,
                "message": "testing_pulls_fetch_failed"
            }));
        }
        let items: Vec<Value> = testing::filter_testing_pulls(response.body.as_array().unwrap())
            .into_iter()
            .map(|pr| pr.to_value())
            .collect();
        Ok(json!({
            "status": "ok",
            "checked_at": checked_at,
            "items": items
        }))
    }

    pub async fn prepare_testing_version(
        &mut self,
        pr_id: &Value,
        head_sha: &Value,
        staging_dir: &std::path::Path,
    ) -> Result<Value, String> {
        let Some(pr_id) = pr_id.as_u64().filter(|id| *id > 0) else {
            return Ok(json!({"status": "failed", "message": "testing_invalid_request"}));
        };
        let Some(head_sha) = head_sha
            .as_str()
            .filter(|sha| testing::is_valid_sha(sha))
            .map(str::to_ascii_lowercase)
        else {
            return Ok(json!({"status": "failed", "message": "testing_invalid_request"}));
        };

        let now = self.now();
        if let Some(until) = self.rate_limited_until.clone() {
            if now < until {
                return Ok(json!({
                    "status": "failed",
                    "checked_at": isoformat_utc(now),
                    "message": "rate_limit_cooldown",
                    "retry_after": isoformat_utc(until)
                }));
            }
            self.rate_limited_until = None;
        }

        // Re-verify the PR on GitHub so only open same-repo or `test-build`-labeled PRs
        // at their current head SHA can be staged for installation.
        let pull_response = self.client.get_pull(pr_id).await;
        if let Some(failure) =
            self.rate_limit_failure(&pull_response, "GitHub PR verification was rate limited")
        {
            return Ok(failure);
        }
        if pull_response.status != 200 || !pull_response.body.is_object() {
            return Ok(json!({"status": "failed", "message": "testing_pulls_fetch_failed"}));
        }
        let Some(pull) = testing::parse_testing_pull(&pull_response.body) else {
            return Ok(json!({"status": "failed", "message": "testing_pr_not_eligible"}));
        };
        if pull.head_sha != head_sha {
            return Ok(json!({"status": "failed", "message": "testing_pr_outdated"}));
        }

        let runs_response = self.client.list_workflow_runs(&head_sha).await;
        if let Some(failure) =
            self.rate_limit_failure(&runs_response, "GitHub Actions lookup was rate limited")
        {
            return Ok(failure);
        }
        if runs_response.status != 200 {
            return Ok(json!({"status": "failed", "message": "testing_build_not_found"}));
        }
        let Some(workflows) = runs_response
            .body
            .get("workflow_runs")
            .and_then(Value::as_array)
        else {
            return Ok(json!({"status": "failed", "message": "testing_build_not_found"}));
        };
        let run_ids = match testing::select_candidate_run_ids(workflows) {
            Ok(ids) => ids,
            Err(code) => return Ok(json!({"status": "failed", "message": code})),
        };

        let mut artifact_id = None;
        let mut saw_expired = false;
        for run_id in run_ids {
            let artifacts_response = self.client.list_run_artifacts(run_id).await;
            if let Some(failure) = self.rate_limit_failure(
                &artifacts_response,
                "GitHub artifact lookup was rate limited",
            ) {
                return Ok(failure);
            }
            if artifacts_response.status != 200 {
                continue;
            }
            let Some(artifacts) = artifacts_response
                .body
                .get("artifacts")
                .and_then(Value::as_array)
            else {
                continue;
            };
            match testing::select_testing_artifact(artifacts) {
                Ok(Some(id)) => {
                    artifact_id = Some(id);
                    break;
                }
                Ok(None) => continue,
                Err("testing_artifact_expired") => {
                    saw_expired = true;
                }
                Err(code) => return Ok(json!({"status": "failed", "message": code})),
            }
        }
        let Some(artifact_id) = artifact_id else {
            let code = if saw_expired {
                "testing_artifact_expired"
            } else {
                "testing_artifact_not_found"
            };
            return Ok(json!({"status": "failed", "message": code}));
        };

        let download_url = testing::testing_artifact_download_url(artifact_id);
        let download_response = match self
            .client
            .download_bytes(&download_url, testing::MAX_TESTING_ARTIFACT_BYTES)
            .await
        {
            Ok(response) => response,
            Err(error) => {
                crate::logging::event(
                    "update",
                    "Testing PR artifact download failed",
                    json!({"pr_id": pr_id, "artifact_id": artifact_id, "error": error}),
                    Level::Error,
                );
                return Ok(json!({"status": "failed", "message": "testing_download_failed"}));
            }
        };
        if download_response.status != 200 {
            crate::logging::event(
                "update",
                "Testing PR artifact download returned non-200 status",
                json!({"pr_id": pr_id, "artifact_id": artifact_id, "status": download_response.status}),
                Level::Error,
            );
            return Ok(json!({"status": "failed", "message": "testing_download_failed"}));
        }

        let staging_dir = staging_dir.to_path_buf();
        let archive_bytes = download_response.body;
        let head_sha_owned = head_sha.clone();
        let extracted = tokio::task::spawn_blocking(move || {
            testing::extract_and_verify_testing_artifact(
                &archive_bytes,
                pr_id,
                &head_sha_owned,
                &staging_dir,
            )
        })
        .await
        .map_err(|error| error.to_string())?;

        match extracted {
            Ok(prepared) => {
                crate::logging::event(
                    "update",
                    "Prepared testing PR build",
                    json!({"pr_id": prepared.pr_id, "version": prepared.version}),
                    Level::Info,
                );
                Ok(prepared.to_value())
            }
            Err(code) => {
                crate::logging::event(
                    "update",
                    "Testing PR artifact verification failed",
                    json!({"pr_id": pr_id, "code": code}),
                    Level::Error,
                );
                Ok(json!({"status": "failed", "message": code}))
            }
        }
    }
}

fn candidate_value(candidate: &UpdateCandidate) -> Value {
    json!({
        "version": candidate.version,
        "tag": candidate.tag,
        "channel": candidate.channel,
        "artifact_url": candidate.artifact_url,
        "sha256": candidate.sha256,
        "release_url": candidate.release_url,
        "published_at": candidate.published_at,
        "action": candidate.action
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::http::{Fixture, Response};
    use chrono::TimeZone;
    use reqwest::{
        Method,
        header::{HeaderMap, HeaderName, HeaderValue},
    };
    use serde_json::json;

    const RELEASES_URL: &str = "https://api.github.com/repos/beallio/Decky-Metadata/releases";
    const MANIFEST_URL: &str = "https://example.test/manifest";
    const RELEASE_TAG_URL: &str =
        "https://api.github.com/repos/beallio/Decky-Metadata/releases/tags/v0.4.0";

    fn now() -> DateTime<Utc> {
        Utc.with_ymd_and_hms(2026, 7, 17, 12, 0, 0).unwrap()
    }

    fn fixture(url: &str, status: u16, body: Value, headers: &[(&str, &str)]) -> Fixture {
        let mut header_map = HeaderMap::new();
        for (name, value) in headers {
            header_map.insert(
                HeaderName::from_bytes(name.as_bytes()).unwrap(),
                HeaderValue::from_bytes(value.as_bytes()).unwrap(),
            );
        }
        Fixture {
            method: Method::GET,
            url: url.to_owned(),
            result: Ok(Response {
                status,
                headers: header_map,
                body: serde_json::to_vec(&body).unwrap(),
                url: url.to_owned(),
            }),
        }
    }

    fn release(version: &str, channel: &str) -> Value {
        let tag = format!("v{version}");
        json!({
            "draft": false,
            "prerelease": channel == "development",
            "tag_name": tag,
            "html_url": format!("https://example.test/releases/{tag}"),
            "published_at": "2026-07-17T12:00:00Z",
            "assets": [
                {"name": format!("Decky-Metadata-{tag}.manifest.json"), "browser_download_url": MANIFEST_URL},
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
            "channel": if channel == "development" {"dev"} else {"stable"},
            "assetName": format!("Decky-Metadata-{tag}.zip"),
            "sha256": "a".repeat(64),
            "generatedAt": "2026-07-17T12:00:00Z"
        })
    }

    fn response_pair(releases: Value, manifests: &[Value], fixtures: &mut Vec<Fixture>) {
        fixtures.push(fixture(RELEASES_URL, 200, releases, &[]));
        fixtures.extend(
            manifests
                .iter()
                .map(|manifest| fixture(MANIFEST_URL, 200, manifest.clone(), &[])),
        );
    }

    fn make_updater(http: Http, installed_version: &str, cache: &Value) -> Updater {
        let mut updater = Updater::new(http, installed_version.to_owned(), &json!({}), cache);
        updater.test_now = Some(now());
        updater
    }

    #[tokio::test]
    async fn recorded_release_and_manifest_flow_returns_valid_candidate_and_persists_cache_snapshot()
     {
        let mut fixtures = Vec::new();
        response_pair(
            json!([release("0.4.0", "stable")]),
            &[manifest("0.4.0", "stable")],
            &mut fixtures,
        );
        let http = Http::fixtures(fixtures);
        let fixture_http = http.clone();
        let mut updater = make_updater(http, "0.3.1", &json!({"wrong": true}));
        let result = updater
            .check_for_update(&json!("0.3.1"), false)
            .await
            .unwrap();
        assert_eq!(result["status"], "available");
        assert_eq!(result["channel"], "stable");
        assert_eq!(result["candidate"]["version"], "0.4.0");
        assert_eq!(result["candidate"]["published_at"], "2026-07-17T12:00:00Z");
        assert_eq!(
            updater.cache_payload()["last_result"]["checked_version"],
            "0.3.1"
        );
        assert_eq!(updater.cache_payload()["wrong"], true);
        fixture_http.assert_drained();
    }

    #[tokio::test]
    async fn duplicate_assets_and_invalid_manifest_identity_do_not_produce_candidates() {
        let mut duplicate = release("0.4.0", "stable");
        let repeated_zip = duplicate["assets"][1].clone();
        duplicate["assets"]
            .as_array_mut()
            .unwrap()
            .push(repeated_zip);
        let mut fixtures = Vec::new();
        response_pair(json!([duplicate]), &[], &mut fixtures);
        let http = Http::fixtures(fixtures);
        let fixture_http = http.clone();
        let mut updater = make_updater(http, "0.3.1", &json!({}));
        assert_eq!(
            updater
                .check_for_update(&json!("0.3.1"), true)
                .await
                .unwrap()["status"],
            "current"
        );
        fixture_http.assert_drained();

        let mut wrong_identity = manifest("0.4.0", "stable");
        wrong_identity["packageName"] = json!("other");
        let mut fixtures = Vec::new();
        response_pair(
            json!([release("0.4.0", "stable")]),
            &[wrong_identity],
            &mut fixtures,
        );
        let http = Http::fixtures(fixtures);
        let fixture_http = http.clone();
        let mut updater = make_updater(http, "0.3.1", &json!({}));
        assert_eq!(
            updater
                .check_for_update(&json!("0.3.1"), true)
                .await
                .unwrap()["status"],
            "current"
        );
        fixture_http.assert_drained();
    }

    #[tokio::test]
    async fn cache_requires_matching_version_channel_and_age_but_force_bypasses_it() {
        let mut fixtures = Vec::new();
        for _ in 0..5 {
            response_pair(
                json!([release("0.4.0", "stable")]),
                &[manifest("0.4.0", "stable")],
                &mut fixtures,
            );
        }
        let http = Http::fixtures(fixtures);
        let fixture_http = http.clone();
        let mut updater = make_updater(http, "0.3.1", &json!({}));
        let first = updater
            .check_for_update(&json!("0.3.1"), false)
            .await
            .unwrap();
        let cached = updater
            .check_for_update(&json!("0.3.1"), false)
            .await
            .unwrap();
        assert_eq!(cached, first);
        updater
            .check_for_update(&json!("0.3.1"), true)
            .await
            .unwrap();
        updater
            .check_for_update(&json!("0.3.0"), false)
            .await
            .unwrap();
        updater.test_now = Some(now() + Duration::hours(24));
        updater
            .check_for_update(&json!("0.3.1"), false)
            .await
            .unwrap();
        updater.set_channel(&json!("development")).unwrap();
        assert_eq!(
            updater
                .check_for_update(&json!("0.3.1"), false)
                .await
                .unwrap()["status"],
            "available"
        );
        fixture_http.assert_drained();
    }

    #[tokio::test]
    async fn discovery_stops_after_five_manifest_attempts() {
        let releases: Vec<_> = (1..=6)
            .rev()
            .map(|patch| release(&format!("0.4.{patch}"), "stable"))
            .collect();
        let invalid = json!({"pluginName": "wrong"});
        let mut fixtures = Vec::new();
        response_pair(
            json!(releases),
            &[
                invalid.clone(),
                invalid.clone(),
                invalid.clone(),
                invalid.clone(),
                invalid,
            ],
            &mut fixtures,
        );
        let http = Http::fixtures(fixtures);
        let fixture_http = http.clone();
        let mut updater = make_updater(http, "0.3.1", &json!({}));
        assert_eq!(
            updater
                .check_for_update(&json!("0.3.1"), true)
                .await
                .unwrap()["status"],
            "current"
        );
        fixture_http.assert_drained();
    }

    #[tokio::test]
    async fn pending_install_handoff_reconciliation_and_expiry_are_local() {
        let http = Http::fixtures(vec![]);
        let mut updater = make_updater(http, "0.4.0", &json!({}));
        let candidate = json!({"version": "0.4.0+local", "tag": "v0.4.0+local", "channel": "stable", "published_at": "raw", "updateTraceId": "trace-1"});
        let context = updater.record_install_requested(&candidate).unwrap();
        assert_eq!(context["pending_update_install"]["version"], "0.4.0+local");
        assert_eq!(
            context["pending_update_install"]["update_trace_id"],
            "trace-1"
        );
        updater
            .confirm_install_handoff(&json!("0.4.0+local"))
            .unwrap();
        assert!(
            updater.cache_payload()["pending_update_install"]["handoff_confirmed_at"].is_string()
        );
        assert!(updater.reconcile_pending_install().unwrap());
        assert_eq!(
            updater.cache_payload()["installed_release_tag"],
            "v0.4.0+local"
        );
        assert!(updater.cache_payload()["pending_update_install"].is_null());
        updater.record_install_requested(&candidate).unwrap();
        updater
            .clear_pending_install(Some(&json!("different")))
            .unwrap();
        assert_eq!(
            updater.cache_payload()["pending_update_install"]["version"],
            "0.4.0+local"
        );
        updater.clear_pending_install(Some(&Value::Null)).unwrap();
        assert!(updater.cache_payload()["pending_update_install"].is_null());

        let expired = json!({"pending_update_install": {
            "version": "0.5.0", "tag": "v0.5.0",
            "requested_at": isoformat_utc(now() - Duration::minutes(16))
        }});
        let mut updater = make_updater(Http::fixtures(vec![]), "0.4.0", &expired);
        assert!(updater.reconcile_pending_install().unwrap());
        assert!(updater.cache_payload()["pending_update_install"].is_null());
    }

    #[tokio::test]
    async fn cooldown_headers_and_expiry_gate_network_checks() {
        let mut fixtures = vec![fixture(
            RELEASES_URL,
            429,
            json!({"message": "API rate limit exceeded"}),
            &[("retry-after", "60")],
        )];
        response_pair(
            json!([release("0.4.0", "stable")]),
            &[manifest("0.4.0", "stable")],
            &mut fixtures,
        );
        let http = Http::fixtures(fixtures);
        let fixture_http = http.clone();
        let mut updater = make_updater(http, "0.3.1", &json!({}));
        let first = updater
            .check_for_update(&json!("0.3.1"), false)
            .await
            .unwrap();
        assert_eq!(first["status"], "failed");
        assert_eq!(first["retry_after"], "2026-07-17T12:01:00+00:00");
        assert_eq!(
            updater
                .check_for_update(&json!("0.3.1"), true)
                .await
                .unwrap()["message"],
            "rate_limit_cooldown_skipped"
        );
        updater.test_now = Some(now() + Duration::seconds(61));
        assert_eq!(
            updater
                .check_for_update(&json!("0.3.1"), true)
                .await
                .unwrap()["status"],
            "available"
        );
        fixture_http.assert_drained();
    }

    #[tokio::test]
    async fn revalidation_rejects_tampered_sha_url_and_version() {
        for change in [
            (
                "sha256",
                json!("b".repeat(64)),
                "revalidation_sha_mismatch",
            ),
            (
                "artifact_url",
                json!("https://example.test/other.zip"),
                "revalidation_url_mismatch",
            ),
            (
                "version",
                json!("0.4.1"),
                "revalidation_version_mismatch",
            ),
        ] {
            let mut candidate = json!({
                "version": "0.4.0",
                "tag": "v0.4.0",
                "channel": "stable",
                "artifact_url": "https://example.test/plugin.zip",
                "sha256": "a".repeat(64),
                "release_url": "https://example.test/releases/v0.4.0",
                "published_at": "2026-07-17T12:00:00Z",
                "action": "update"
            });
            candidate[change.0] = change.1;
            let http = Http::fixtures(vec![
                fixture(RELEASE_TAG_URL, 200, release("0.4.0", "stable"), &[]),
                fixture(MANIFEST_URL, 200, manifest("0.4.0", "stable"), &[]),
            ]);
            let fixture_http = http.clone();
            let mut updater = make_updater(http, "0.3.1", &json!({}));
            let result = updater.revalidate(&candidate).await.unwrap();
            assert_eq!(result["status"], "failed");
            assert_eq!(result["message"], change.2);
            fixture_http.assert_drained();
        }
    }

    #[tokio::test]
    async fn startup_reconciliation_retains_an_unexpired_mismatched_version() {
        let cache = json!({"pending_update_install": {
            "version": "0.4.0", "requested_at": isoformat_utc(now() - Duration::minutes(14))
        }});
        let mut updater = make_updater(Http::fixtures(vec![]), "0.3.1", &cache);
        assert!(!updater.reconcile_pending_install().unwrap());
        assert!(updater.context()["pending_update_install"].is_object());
    }

    #[tokio::test]
    async fn revalidation_cooldown_and_missing_tag_return_failure_envelopes() {
        let http = Http::fixtures(vec![fixture(
            RELEASE_TAG_URL,
            403,
            json!({"message": "rate limit"}),
            &[("x-ratelimit-reset", "1784290000")],
        )]);
        let fixture_http = http.clone();
        let mut updater = make_updater(http, "0.3.1", &json!({}));
        assert_eq!(
            updater.revalidate(&json!({})).await.unwrap()["message"],
            "candidate_missing_tag"
        );
        let result = updater.revalidate(&json!({"tag": "v0.4.0"})).await.unwrap();
        assert_eq!(result["status"], "failed");
        assert_eq!(
            updater.revalidate(&json!({"tag": "v0.4.0"})).await.unwrap()["message"],
            "rate_limit_cooldown"
        );
        fixture_http.assert_drained();
    }

    #[tokio::test]
    async fn manifest_download_failures_and_private_repository_return_failure_envelopes() {
        let http = Http::fixtures(vec![
            fixture(RELEASES_URL, 200, json!([release("0.4.0", "stable")]), &[]),
            fixture(MANIFEST_URL, 503, json!({}), &[]),
        ]);
        let fixture_http = http.clone();
        let mut updater = make_updater(http, "0.3.1", &json!({}));
        let result = updater.check_for_update(&json!("0.3.1"), true).await.unwrap();
        assert_eq!(result["status"], "failed");
        assert_eq!(result["message"], "manifest_download_failed");
        // An unknown release must not be cached as "current" for a day.
        assert!(updater.cache.get("last_result").is_none());
        fixture_http.assert_drained();

        let http = Http::fixtures(vec![
            fixture(RELEASES_URL, 200, json!([release("0.4.0", "stable")]), &[]),
            fixture(MANIFEST_URL, 429, json!({}), &[("retry-after", "120")]),
        ]);
        let fixture_http = http.clone();
        let mut updater = make_updater(http, "0.3.1", &json!({}));
        let result = updater.check_for_update(&json!("0.3.1"), true).await.unwrap();
        assert_eq!(result["status"], "failed");
        assert_eq!(result["message"], "rate_limited");
        assert!(result["retry_after"].is_string());
        // The cooldown also blocks the next network check.
        assert_eq!(
            updater.check_for_update(&json!("0.3.1"), true).await.unwrap()["message"],
            "rate_limit_cooldown_skipped"
        );
        fixture_http.assert_drained();

        let http = Http::fixtures(vec![fixture(
            RELEASES_URL,
            404,
            json!({"message": "Not Found"}),
            &[],
        )]);
        let fixture_http = http.clone();
        let mut updater = make_updater(http, "0.3.1", &json!({}));
        let result = updater
            .check_for_update(&json!("0.3.1"), true)
            .await
            .unwrap();
        assert_eq!(result["status"], "failed");
        assert_eq!(result["message"], "releases_not_accessible");
        fixture_http.assert_drained();
    }

    #[tokio::test]
    async fn successful_revalidation_returns_verified_fields_and_original_action() {
        let http = Http::fixtures(vec![
            fixture(RELEASE_TAG_URL, 200, release("0.4.0", "stable"), &[]),
            fixture(MANIFEST_URL, 200, manifest("0.4.0", "stable"), &[]),
        ]);
        let fixture_http = http.clone();
        let mut updater = make_updater(http, "0.3.1", &json!({}));
        let result = updater
            .revalidate(&json!({
                "version": "0.4.0",
                "tag": "v0.4.0",
                "artifact_url": "https://example.test/plugin.zip",
                "sha256": "a".repeat(64),
                "action": "move_to_stable"
            }))
            .await
            .unwrap();
        assert_eq!(result["version"], "0.4.0");
        assert_eq!(result["action"], "move_to_stable");
        fixture_http.assert_drained();
    }

    #[test]
    fn snapshot_payloads_are_direct_fields_and_setters_keep_baseline_normalization() {
        let mut updater = Updater::new(
            Http::fixtures(vec![]),
            "0.3.1".to_owned(),
            &json!({
                "update_channel": "development",
                "automatic_update_checks": false,
                "ignored": true
            }),
            &json!({"custom_cache_entry": 7}),
        );
        assert_eq!(
            updater.settings_payload(),
            json!({
                "update_channel": "development",
                "automatic_update_checks": false,
                "testing_tab_enabled": false
            })
        );
        assert_eq!(updater.cache_payload(), json!({"custom_cache_entry": 7}));
        updater.set_channel(&json!("nightly")).unwrap();
        updater.set_automatic_checks(&json!([])).unwrap();
        updater.set_testing_tab_enabled(&json!(true)).unwrap();
        assert_eq!(updater.settings_payload()["update_channel"], "stable");
        assert_eq!(updater.settings_payload()["automatic_update_checks"], false);
        assert_eq!(updater.settings_payload()["testing_tab_enabled"], true);
        updater.set_automatic_checks(&json!("enabled")).unwrap();
        updater.set_testing_tab_enabled(&json!(false)).unwrap();
        assert_eq!(updater.settings_payload()["automatic_update_checks"], true);
        assert_eq!(updater.settings_payload()["testing_tab_enabled"], false);
    }

    #[tokio::test]
    async fn testing_versions_list_and_prepare_enforce_eligibility_and_verify_artifact() {
        use std::io::Write;
        use sha2::{Digest, Sha256};
        use zip::{CompressionMethod, ZipWriter, write::SimpleFileOptions};

        let sha = "abcdef0123456789abcdef0123456789abcdef01";
        let pulls_url = "https://api.github.com/repos/beallio/Decky-Metadata/pulls?state=open&per_page=100";
        let pull_42_url = "https://api.github.com/repos/beallio/Decky-Metadata/pulls/42";
        let pull_43_url = "https://api.github.com/repos/beallio/Decky-Metadata/pulls/43";
        let runs_url = format!("https://api.github.com/repos/beallio/Decky-Metadata/actions/runs?head_sha={sha}&per_page=30");
        let run_10_artifacts = "https://api.github.com/repos/beallio/Decky-Metadata/actions/runs/10/artifacts";
        let run_11_artifacts = "https://api.github.com/repos/beallio/Decky-Metadata/actions/runs/11/artifacts";
        let download_url = "https://nightly.link/beallio/Decky-Metadata/actions/artifacts/777.zip";

        let same_repo_pr = json!({
            "number": 42,
            "state": "open",
            "title": "Add testing tab",
            "html_url": "https://github.com/beallio/Decky-Metadata/pull/42",
            "created_at": "2026-11-20T00:00:00Z",
            "updated_at": "2026-11-24T00:00:00Z",
            "draft": false,
            "user": {"login": "beallio"},
            "head": {"sha": sha, "repo": {"full_name": "beallio/Decky-Metadata"}},
            "labels": []
        });
        let unlabeled_fork_pr = json!({
            "number": 43,
            "state": "open",
            "title": "Unapproved fork",
            "html_url": "https://github.com/beallio/Decky-Metadata/pull/43",
            "created_at": "2026-11-20T00:00:00Z",
            "updated_at": "2026-11-24T00:00:00Z",
            "draft": false,
            "user": {"login": "outsider"},
            "head": {"sha": sha, "repo": {"full_name": "outsider/Decky-Metadata"}},
            "labels": []
        });
        let labeled_fork_pr = json!({
            "number": 44,
            "state": "open",
            "title": "Opt-in fork",
            "html_url": "https://github.com/beallio/Decky-Metadata/pull/44",
            "created_at": "2026-11-20T00:00:00Z",
            "updated_at": "2026-11-24T00:00:00Z",
            "draft": false,
            "user": {"login": "contributor"},
            "head": {"sha": sha, "repo": {"full_name": "contributor/Decky-Metadata"}},
            "labels": [{"name": "test-build"}]
        });

        let payload = b"verified-plugin-zip";
        let digest = format!("{:x}", Sha256::digest(payload));
        let manifest_json = json!({
            "schemaVersion": 1,
            "pluginName": "Decky Metadata",
            "packageName": "decky-metadata",
            "version": "0.6.8-dev.pr42.gabcdef0",
            "sourceVersion": "0.6.8-dev.pr42.gabcdef0",
            "tag": "v0.6.8-dev.pr42.gabcdef0",
            "channel": "dev",
            "assetName": "Decky-Metadata.zip",
            "sha256": digest,
            "generatedAt": "2026-11-25T00:00:00Z"
        });
        let mut cursor = std::io::Cursor::new(Vec::new());
        {
            let mut writer = ZipWriter::new(&mut cursor);
            let opts = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
            writer.start_file("Decky-Metadata.zip", opts).unwrap();
            writer.write_all(payload).unwrap();
            writer.start_file("Decky-Metadata.zip.sha256", opts).unwrap();
            writer
                .write_all(format!("{digest}  Decky-Metadata.zip\n").as_bytes())
                .unwrap();
            writer.start_file("Decky-Metadata.manifest.json", opts).unwrap();
            writer
                .write_all(serde_json::to_vec(&manifest_json).unwrap().as_slice())
                .unwrap();
            writer.finish().unwrap();
        }
        let outer_zip = cursor.into_inner();

        let http = Http::fixtures(vec![
            fixture(
                pulls_url,
                200,
                json!([same_repo_pr.clone(), unlabeled_fork_pr.clone(), labeled_fork_pr]),
                &[],
            ),
            fixture(pull_43_url, 200, unlabeled_fork_pr, &[]),
            fixture(pull_42_url, 200, same_repo_pr, &[]),
            fixture(
                &runs_url,
                200,
                json!({
                    "workflow_runs": [
                        {"id": 10, "name": "CI", "event": "pull_request", "status": "completed", "conclusion": "success"},
                        {"id": 11, "name": "CI", "event": "pull_request", "status": "completed", "conclusion": "success"}
                    ]
                }),
                &[],
            ),
            // First run has no artifact; second run has it.
            fixture(run_10_artifacts, 200, json!({"total_count": 0, "artifacts": []}), &[]),
            fixture(
                run_11_artifacts,
                200,
                json!({"total_count": 1, "artifacts": [{"id": 777, "name": "decky-metadata-pr", "expired": false}]}),
                &[],
            ),
            Fixture {
                method: Method::GET,
                url: download_url.to_owned(),
                result: Ok(Response {
                    status: 200,
                    headers: HeaderMap::new(),
                    body: outer_zip,
                    url: download_url.to_owned(),
                }),
            },
        ]);
        let fixture_http = http.clone();
        let mut updater = make_updater(http, "0.6.8", &json!({}));

        let list = updater.list_testing_versions().await.unwrap();
        assert_eq!(list["status"], "ok");
        let ids: Vec<u64> = list["items"]
            .as_array()
            .unwrap()
            .iter()
            .map(|item| item["id"].as_u64().unwrap())
            .collect();
        assert_eq!(ids, vec![42, 44]);

        let base = std::env::var_os("TMPDIR")
            .map(std::path::PathBuf::from)
            .unwrap_or_else(|| std::path::PathBuf::from("/var/tmp/omp-1000"));
        let stage = base.join(format!("decky-updater-testing-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&stage);

        let rejected = updater
            .prepare_testing_version(&json!(43), &json!(sha), &stage)
            .await
            .unwrap();
        assert_eq!(rejected["status"], "failed");
        assert_eq!(rejected["message"], "testing_pr_not_eligible");

        let ready = updater
            .prepare_testing_version(&json!(42), &json!(sha), &stage)
            .await
            .unwrap();
        assert_eq!(ready["status"], "ready");
        assert_eq!(ready["version"], "0.6.8-dev.pr42.gabcdef0");
        assert_eq!(ready["sha256"], digest);
        let staged_path = ready["artifact_url"]
            .as_str()
            .unwrap()
            .strip_prefix("file://")
            .unwrap();
        assert_eq!(std::fs::read(staged_path).unwrap(), payload);

        let _ = std::fs::remove_dir_all(&stage);
        fixture_http.assert_drained();
    }

    #[tokio::test]
    async fn recorded_pending_state_survives_a_fresh_updater_snapshot() {
        let mut source = make_updater(Http::fixtures(vec![]), "0.3.1", &json!({}));
        source
            .record_install_requested(&json!({
                "version": "0.4.0",
                "tag": "v0.4.0",
                "channel": "stable",
                "published_at": "raw",
                "updateTraceId": "trace-2"
            }))
            .unwrap();
        let settings = source.settings_payload();
        let cache = source.cache_payload();
        let http = Http::fixtures(vec![]);
        let fixture_http = http.clone();
        let mut fresh = Updater::new(http, "0.3.1".to_owned(), &settings, &cache);
        fresh.test_now = Some(now());
        assert_eq!(
            fresh.context()["pending_update_install"]["update_trace_id"],
            "trace-2"
        );
        let result = fresh
            .check_for_update(&json!("0.4.0"), false)
            .await
            .unwrap();
        assert_eq!(result["status"], "current");
        assert_eq!(result["channel"], "stable");
        fixture_http.assert_drained();
    }
}
