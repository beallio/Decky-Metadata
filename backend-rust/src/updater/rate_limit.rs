use chrono::{DateTime, Duration, Utc};
use std::collections::HashMap;

pub fn retry_after_until(headers: &HashMap<String, String>, now: DateTime<Utc>) -> DateTime<Utc> {
    if let Some(value) = headers.get("retry-after") {
        if let Some(seconds) = parse_integer(value) {
            if let Some(until) =
                Duration::try_seconds(seconds).and_then(|duration| now.checked_add_signed(duration))
            {
                return until;
            }
        }
    } else if let Some(value) = headers.get("x-ratelimit-reset") {
        if let Some(timestamp) = parse_integer(value) {
            if let Some(until) = DateTime::<Utc>::from_timestamp(timestamp, 0) {
                return until;
            }
        }
    }
    now.checked_add_signed(Duration::minutes(1)).unwrap_or(now)
}

fn parse_integer(value: &str) -> Option<i64> {
    value.trim().parse().ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn now() -> DateTime<Utc> {
        Utc.with_ymd_and_hms(2026, 7, 17, 12, 0, 0).unwrap()
    }

    #[test]
    fn retry_after_precedes_reset_and_invalid_headers_fall_back() {
        let headers = HashMap::from([
            ("retry-after".to_owned(), "30".to_owned()),
            ("x-ratelimit-reset".to_owned(), "1".to_owned()),
        ]);
        assert_eq!(
            retry_after_until(&headers, now()),
            now().checked_add_signed(Duration::seconds(30)).unwrap()
        );
        let headers = HashMap::from([("x-ratelimit-reset".to_owned(), "1".to_owned())]);
        assert_eq!(
            retry_after_until(&headers, now()),
            DateTime::<Utc>::from_timestamp(1, 0).unwrap()
        );
        let headers = HashMap::from([("retry-after".to_owned(), "invalid".to_owned())]);
        assert_eq!(
            retry_after_until(&headers, now()),
            now().checked_add_signed(Duration::minutes(1)).unwrap()
        );
    }

    #[test]
    fn overflowing_retry_after_falls_back_without_panicking() {
        let headers = HashMap::from([("retry-after".to_owned(), i64::MAX.to_string())]);
        assert_eq!(
            retry_after_until(&headers, now()),
            now().checked_add_signed(Duration::minutes(1)).unwrap()
        );
    }
}
