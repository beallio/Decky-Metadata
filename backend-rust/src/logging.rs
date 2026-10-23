use decky_plugin::Env;
use log::Level;
use regex::Regex;
use serde_json::Value;
use std::{
    fs::{File, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    sync::{
        LazyLock, Mutex, OnceLock,
        atomic::{AtomicBool, Ordering},
    },
};
use tokio::io::{AsyncReadExt, AsyncSeekExt};

const MAX_BYTES: u64 = 2 * 1024 * 1024;
const TAIL_BYTES: u64 = 128 * 1024;
static SINK: OnceLock<Mutex<LogFile>> = OnceLock::new();
static DEBUG: AtomicBool = AtomicBool::new(false);
#[cfg(test)]
static TEST_EVENTS: LazyLock<Mutex<Vec<String>>> = LazyLock::new(|| Mutex::new(Vec::new()));
static REDACTIONS: LazyLock<Vec<Regex>> = LazyLock::new(|| {
    [
        r"(?i)([?&]y=)[^&#\s]+",
        r"(?i)(\bapi[_-]?key=)[^&#\s]+",
        r#"(?i)((?:['"])?\bAuthorization(?:['"])?\s*[:=]\s*(?:['"])?)(?:Bearer\s+)?[^'"\s,}]+"#,
        r#"(?i)((?:['"])?\bX-Authorization(?:['"])?\s*[:=]\s*(?:['"])?)[^'"\s,}]+"#,
    ]
    .iter()
    .map(|pattern| Regex::new(pattern).unwrap())
    .collect()
});

pub fn redact(text: &str) -> String {
    REDACTIONS.iter().fold(text.to_owned(), |text, pattern| {
        pattern.replace_all(&text, "${1}***").into_owned()
    })
}

fn repr(text: &str) -> String {
    let quote = if text.contains('\'') && !text.contains('"') {
        '"'
    } else {
        '\''
    };
    let mut result = String::with_capacity(text.len() + 2);
    result.push(quote);
    for c in text.chars() {
        match c {
            '\\' => result.push_str("\\\\"),
            '\n' => result.push_str("\\n"),
            '\r' => result.push_str("\\r"),
            '\t' => result.push_str("\\t"),
            c if c == quote => {
                result.push('\\');
                result.push(c);
            }
            c if c.is_control() => {
                use std::fmt::Write;
                let _ = write!(result, "\\x{:02x}", c as u32);
            }
            c => result.push(c),
        }
    }
    result.push(quote);
    result
}

struct LogFile {
    path: PathBuf,
    file: File,
    size: u64,
}
impl LogFile {
    fn open(path: PathBuf) -> std::io::Result<Self> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let file = OpenOptions::new().create(true).append(true).open(&path)?;
        let size = file.metadata()?.len();
        Ok(Self { path, file, size })
    }
    fn write(&mut self, text: &str) -> std::io::Result<()> {
        if self.size > 0 && self.size.saturating_add(text.len() as u64) >= MAX_BYTES {
            self.file.flush()?;
            for number in (1..=3).rev() {
                let destination = self
                    .path
                    .with_file_name(format!("decky-metadata.log.{number}"));
                if number == 3 {
                    match std::fs::remove_file(&destination) {
                        Ok(()) => {}
                        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
                        Err(e) => return Err(e),
                    }
                }
                let source = if number == 1 {
                    self.path.clone()
                } else {
                    self.path
                        .with_file_name(format!("decky-metadata.log.{}", number - 1))
                };
                match std::fs::rename(source, destination) {
                    Ok(()) => {}
                    Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
                    Err(e) => return Err(e),
                }
            }
            self.file = OpenOptions::new()
                .create(true)
                .append(true)
                .open(&self.path)?;
            self.size = 0;
        }
        self.file.write_all(text.as_bytes())?;
        self.file.flush()?;
        self.size += text.len() as u64;
        Ok(())
    }
}

pub fn install(env: &Env) -> Option<PathBuf> {
    if let Some(sink) = SINK.get() {
        return sink.lock().ok().map(|sink| sink.path.clone());
    }
    let directory = [
        &env.plugin_log_dir,
        &env.plugin_runtime_dir,
        &env.plugin_settings_dir,
    ]
    .into_iter()
    .find(|path| !path.as_os_str().is_empty())?;
    let path = directory.join("decky-metadata.log");
    match LogFile::open(path.clone()) {
        Ok(sink) => {
            let _ = SINK.set(Mutex::new(sink));
            SINK.get()
                .and_then(|sink| sink.lock().ok().map(|sink| sink.path.clone()))
                .or(Some(path))
        }
        Err(error) => {
            log::error!("[decky:load] file logging unavailable: {error}");
            None
        }
    }
}

pub fn set_debug(enabled: bool) {
    DEBUG.store(enabled, Ordering::Relaxed);
    log::set_max_level(if enabled {
        log::LevelFilter::Debug
    } else {
        log::LevelFilter::Info
    });
}

pub fn event(area: &str, message: &str, fields: Value, level: Level) {
    if level == Level::Debug && !DEBUG.load(Ordering::Relaxed) {
        return;
    }
    let mut text = format!("[decky:{area}] {message}");
    if let Some(fields) = fields.as_object() {
        use std::fmt::Write;
        for (key, value) in fields {
            let value = crate::matching::py_string(value);
            let _ = write!(text, " {key}={}", repr(&redact(&value)));
        }
    }
    let text = redact(&text);
    #[cfg(test)]
    if let Ok(mut events) = TEST_EVENTS.lock() {
        events.push(format!("{} {text}", level_name(level)));
    }
    if let Some(sink) = SINK.get() {
        let formatted = format!(
            "{} {} {}\n",
            chrono::Local::now().format("%Y-%m-%d %H:%M:%S,%3f"),
            level_name(level),
            text
        );
        if let Ok(mut sink) = sink.lock() {
            if let Err(error) = sink.write(&formatted) {
                log::error!("[decky:log] fixed log write failed: {error}");
            }
        }
    }
    log::log!(level, "{text}");
}

fn level_name(level: Level) -> &'static str {
    match level {
        Level::Error => "ERROR",
        Level::Warn => "WARNING",
        Level::Info => "INFO",
        Level::Debug => "DEBUG",
        Level::Trace => "TRACE",
    }
}

#[cfg(test)]
pub(crate) fn test_events() -> Vec<String> {
    TEST_EVENTS
        .lock()
        .map(|events| events.clone())
        .unwrap_or_default()
}

pub async fn read_tail(path: &Path) -> String {
    let result = async {
        let mut file = tokio::fs::File::open(path).await?;
        let length = file.metadata().await?.len();
        let start = length.saturating_sub(TAIL_BYTES);
        file.seek(std::io::SeekFrom::Start(start)).await?;
        let mut bytes = Vec::with_capacity((length - start) as usize);
        file.take(TAIL_BYTES).read_to_end(&mut bytes).await?;
        let bytes = if start > 0 {
            bytes
                .iter()
                .position(|byte| *byte == b'\n')
                .map(|index| &bytes[index + 1..])
                .unwrap_or(&bytes)
        } else {
            &bytes
        };
        Ok::<_, std::io::Error>(String::from_utf8_lossy(bytes).into_owned())
    }
    .await;
    result.unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn warning_level_uses_python_name() {
        assert_eq!(level_name(Level::Warn), "WARNING");
    }
    static ID: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    fn directory() -> PathBuf {
        let root = std::env::var_os("TMPDIR")
            .map(PathBuf::from)
            .unwrap_or_else(|| "/var/tmp/omp-1000".into());
        let path = root.join(format!(
            "metadata-log-test-{}-{}",
            std::process::id(),
            ID.fetch_add(1, Ordering::Relaxed)
        ));
        std::fs::create_dir_all(&path).unwrap();
        path
    }
    #[test]
    fn sensitive_fields_redact_without_disclosing_bearer_or_query() {
        let text = redact(
            "https://host/?y=secret&api_key=key Authorization: Bearer abc X-Authorization='xyz'",
        );
        for secret in ["secret", "=key", "abc", "xyz"] {
            assert!(!text.contains(secret), "{text}");
        }
        assert!(text.contains("Authorization: ***"));
        assert_eq!(repr("one\ntwo"), "'one\\ntwo'");
    }
    #[tokio::test]
    async fn rotation_keeps_three_backups_and_tail_starts_on_complete_line() {
        let directory = directory();
        let path = directory.join("decky-metadata.log");
        let mut file = LogFile::open(path.clone()).unwrap();
        for number in 0..5 {
            file.write(&format!("{number}{}\n", "x".repeat(MAX_BYTES as usize - 3)))
                .unwrap();
        }
        assert!(directory.join("decky-metadata.log.3").exists());
        assert!(!directory.join("decky-metadata.log.4").exists());
        file.write("last line\n").unwrap();
        let tail = read_tail(&path).await;
        assert!(tail.ends_with("last line\n"));
        assert!(tail.len() <= TAIL_BYTES as usize);
        drop(file);
        std::fs::remove_dir_all(directory).unwrap();
    }
}
