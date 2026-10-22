use crate::updater::models::{parse_iso_datetime, parse_plugin_version};
use chrono::{DateTime, Duration, Utc};
use serde_json::Value;

const PENDING_INSTALL_MISMATCH_GRACE: Duration = Duration::minutes(15);

pub fn is_confirmed_pending_install(pending: &Value) -> bool {
    pending
        .get("handoff_confirmed_at")
        .and_then(Value::as_str)
        .is_some_and(|confirmed_at| !confirmed_at.is_empty())
}

pub fn is_fresh_pending_install(pending: &Value, now: DateTime<Utc>) -> bool {
    let timestamp = if is_confirmed_pending_install(pending) {
        pending.get("handoff_confirmed_at")
    } else {
        pending.get("requested_at")
    }
    .and_then(Value::as_str);
    let Some(requested_at) = timestamp.filter(|timestamp| !timestamp.is_empty()) else {
        return false;
    };
    let Some(requested_at) = parse_iso_datetime(requested_at) else {
        return false;
    };
    now - requested_at <= PENDING_INSTALL_MISMATCH_GRACE
}

pub fn pending_install_matches_loaded_version(
    pending_version: &str,
    current_version: &str,
) -> bool {
    if pending_version == current_version {
        return true;
    }
    let Some(parsed_pending) = parse_plugin_version(pending_version) else {
        return false;
    };
    let Some(parsed_current) = parse_plugin_version(current_version) else {
        return false;
    };
    !parsed_current.is_dev && !parsed_pending.is_dev && parsed_pending == parsed_current
}

pub fn effective_pending_install_version(pending: &Value, now: DateTime<Utc>) -> Option<String> {
    if !is_fresh_pending_install(pending, now) {
        return None;
    }
    pending
        .get("version")
        .and_then(Value::as_str)
        .filter(|version| !version.is_empty())
        .map(str::to_owned)
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;
    use serde_json::json;

    fn fixture_now() -> DateTime<Utc> {
        Utc.with_ymd_and_hms(2026, 7, 17, 12, 0, 0).unwrap()
    }

    fn pending(minutes: i64) -> Value {
        json!({
            "version": "0.4.0",
            "requested_at": crate::updater::models::isoformat_utc(fixture_now() - Duration::minutes(minutes))
        })
    }

    #[test]
    fn requested_and_confirmed_handoff_timestamps_use_the_fifteen_minute_grace() {
        let now = fixture_now();
        assert!(is_fresh_pending_install(&pending(15), now));
        assert!(!is_fresh_pending_install(&pending(16), now));
        assert_eq!(
            effective_pending_install_version(&pending(0), now).as_deref(),
            Some("0.4.0")
        );

        let mut confirmed = pending(30);
        confirmed["handoff_confirmed_at"] = json!(crate::updater::models::isoformat_utc(now));
        assert!(is_confirmed_pending_install(&confirmed));
        assert_eq!(
            effective_pending_install_version(&confirmed, now).as_deref(),
            Some("0.4.0")
        );
        assert!(!is_fresh_pending_install(
            &json!({"requested_at": "not-a-date"}),
            now
        ));
    }

    #[test]
    fn version_promotion_matches_only_installed_stable_versions() {
        assert!(pending_install_matches_loaded_version(
            "0.4.0+build",
            "0.4.0"
        ));
        assert!(pending_install_matches_loaded_version(
            "0.4.0-dev.g1",
            "0.4.0-dev.g1"
        ));
        assert!(!pending_install_matches_loaded_version(
            "0.4.0-dev.g1",
            "0.4.0-dev.g2"
        ));
        assert!(!pending_install_matches_loaded_version(
            "0.4.0",
            "0.4.0-dev.g1"
        ));
    }
}
