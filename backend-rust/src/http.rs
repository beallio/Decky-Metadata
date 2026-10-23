use futures_util::StreamExt;
use reqwest::{Client, Method, header::HeaderMap, redirect::Policy};
use serde_json::Value;
use std::{sync::Arc, time::Duration};
use tokio_util::sync::CancellationToken;

pub const BROWSER_USER_AGENT: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36";

#[derive(Clone, Copy, Debug)]
pub enum Redirects {
    Default,
    None,
    Ign,
}

#[derive(Clone, Debug)]
pub struct Response {
    pub status: u16,
    pub headers: HeaderMap,
    pub body: Vec<u8>,
    pub url: String,
}

impl Response {
    pub fn json(&self) -> Result<Value, String> {
        match std::str::from_utf8(&self.body) {
            Ok(text) => serde_json::from_str(text),
            Err(_) => serde_json::from_str(&self.text()),
        }
        .map_err(|error| error.to_string())
    }
    pub fn text(&self) -> String {
        let mut remaining = self.body.as_slice();
        let mut result = String::with_capacity(self.body.len());
        loop {
            match std::str::from_utf8(remaining) {
                Ok(text) => {
                    result.push_str(text);
                    break;
                }
                Err(error) => {
                    result.push_str(
                        std::str::from_utf8(&remaining[..error.valid_up_to()])
                            .expect("valid UTF-8 prefix"),
                    );
                    match error.error_len() {
                        Some(length) => remaining = &remaining[error.valid_up_to() + length..],
                        None => break,
                    }
                }
            }
        }
        result
    }
}

pub struct RequestRecord {
    pub method: String,
    pub url: String,
    pub status: Option<u16>,
    pub content_type: String,
}

pub type RequestLog = Arc<std::sync::Mutex<Vec<RequestRecord>>>;

#[derive(Clone)]
pub struct Http {
    clients: Arc<[Client; 3]>,
    pub cancel: CancellationToken,
    requests: Option<RequestLog>,
    #[cfg(test)]
    fixtures: Option<Arc<std::sync::Mutex<std::collections::VecDeque<Fixture>>>>,
    #[cfg(test)]
    gate: Option<Arc<TestGate>>,
}

pub fn is_ign_origin(url: &reqwest::Url) -> bool {
    url.scheme() == "https"
        && url.host_str() == Some("www.ign.com")
        && url.username().is_empty()
        && url.password().is_none()
        && url.port_or_known_default() == Some(443)
}

impl Http {
    pub fn new(cancel: CancellationToken, _version: &str) -> Result<Self, String> {
        let default = Client::builder()
            .user_agent(BROWSER_USER_AGENT)
            .build()
            .map_err(|e| e.to_string())?;
        let none = Client::builder()
            .user_agent(BROWSER_USER_AGENT)
            .redirect(Policy::none())
            .build()
            .map_err(|e| e.to_string())?;
        let ign = Client::builder()
            .user_agent(BROWSER_USER_AGENT)
            .redirect(Policy::custom(|attempt| {
                if !is_ign_origin(attempt.url()) {
                    attempt.error("Blocked redirect outside IGN's canonical host")
                } else if attempt.previous().len() >= 10 {
                    attempt.error("Too many redirects")
                } else {
                    attempt.follow()
                }
            }))
            .build()
            .map_err(|e| e.to_string())?;
        Ok(Self {
            clients: Arc::new([default, none, ign]),
            cancel,
            requests: None,
            #[cfg(test)]
            fixtures: None,
            #[cfg(test)]
            gate: None,
        })
    }

    pub fn new_recording(
        cancel: CancellationToken,
        version: &str,
    ) -> Result<(Self, RequestLog), String> {
        let mut http = Self::new(cancel, version)?;
        let requests = RequestLog::default();
        http.requests = Some(Arc::clone(&requests));
        Ok((http, requests))
    }

    pub async fn request(
        &self,
        method: Method,
        url: &str,
        headers: &[(&str, &str)],
        body: Option<Value>,
        timeout: Duration,
        limit: usize,
        redirects: Redirects,
    ) -> Result<Response, String> {
        self.request_with_error_limit(method, url, headers, body, timeout, limit, limit, redirects)
            .await
    }

    pub async fn request_with_error_limit(
        &self,
        method: Method,
        url: &str,
        headers: &[(&str, &str)],
        body: Option<Value>,
        timeout: Duration,
        limit: usize,
        error_limit: usize,
        redirects: Redirects,
    ) -> Result<Response, String> {
        if self.cancel.is_cancelled() {
            return Err("backend stopping".into());
        }
        if limit == 0 || error_limit == 0 {
            return Err("invalid HTTP response limit".into());
        }
        let parsed = reqwest::Url::parse(url).map_err(|error| error.to_string())?;
        if matches!(redirects, Redirects::Ign) && !is_ign_origin(&parsed) {
            return Err("IGN trailer pages must use the canonical HTTPS host".into());
        }
        #[cfg(test)]
        if let Some(fixtures) = &self.fixtures {
            let fixture = fixtures
                .lock()
                .unwrap()
                .pop_front()
                .ok_or_else(|| format!("unexpected HTTP request {method} {url}"))?;
            assert_eq!(fixture.method, method, "fixture request method for {url}");
            let mut expected = reqwest::Url::parse(&fixture.url).expect("fixture URL");
            let mut actual = reqwest::Url::parse(url).expect("request URL");
            let mut expected_query: Vec<_> = expected.query_pairs().into_owned().collect();
            let mut actual_query: Vec<_> = actual.query_pairs().into_owned().collect();
            expected_query.sort();
            actual_query.sort();
            expected.set_query(None);
            actual.set_query(None);
            assert_eq!(expected, actual, "fixture request origin/path");
            assert_eq!(expected_query, actual_query, "fixture request query");
            if let Some(gate) = &self.gate {
                if !gate.used.swap(true, std::sync::atomic::Ordering::SeqCst) {
                    gate.started.notify_one();
                    tokio::select! {
                        _=self.cancel.cancelled()=>return Err("backend stopping".into()),
                        _=gate.resume.notified()=>{},
                    }
                }
            }
            let response = fixture.result?;
            let bound = response_limit(response.status, &response.headers, limit, error_limit)?;
            if response.body.len() > bound {
                return Err("HTTP response exceeds bounded read limit".into());
            }
            return Ok(response);
        }
        let record = if let Some(requests) = &self.requests {
            let mut requests = requests
                .lock()
                .map_err(|_| "HTTP request evidence is unavailable")?;
            let index = requests.len();
            requests.push(RequestRecord {
                method: method.to_string(),
                url: url.to_owned(),
                status: None,
                content_type: String::new(),
            });
            Some(index)
        } else {
            None
        };
        let client = &self.clients[match redirects {
            Redirects::Default => 0,
            Redirects::None => 1,
            Redirects::Ign => 2,
        }];
        let mut request = client
            .request(method.clone(), parsed)
            .header("Accept-Language", "en-US,en;q=0.9");
        for (key, value) in headers {
            request = request.header(*key, *value);
        }
        if let Some(body) = body {
            request = request.json(&body);
        }
        let operation = async {
            let response = request.send().await.map_err(|error| {
                let mut cause=Some(&error as &(dyn std::error::Error+'static));
                while let Some(current)=cause {
                    if current.to_string().to_lowercase().contains("certificate") {
                        crate::logging::event("http","TLS certificate verification failed",serde_json::json!({"target":url.split(['?','#']).next().unwrap_or("<unknown>"),"error":current.to_string()}),log::Level::Error);
                        break;
                    }
                    cause=current.source();
                }
                error.to_string()
            })?;
            let status = response.status().as_u16();
            let final_url = response.url().to_string();
            let headers = response.headers().clone();
            if let (Some(requests), Some(index)) = (&self.requests, record) {
                let mut requests = requests
                    .lock()
                    .map_err(|_| "HTTP request evidence is unavailable")?;
                let entry = requests
                    .get_mut(index)
                    .ok_or("HTTP request evidence was removed")?;
                entry.status = Some(status);
                entry.url = final_url.clone();
                entry.content_type = headers
                    .get(reqwest::header::CONTENT_TYPE)
                    .and_then(|value| value.to_str().ok())
                    .unwrap_or("")
                    .to_owned();
            }
            let bound = response_limit(status, &headers, limit, error_limit)?;
            let mut body = Vec::new();
            let mut stream = response.bytes_stream();
            while let Some(chunk) = stream.next().await {
                let chunk = chunk.map_err(|e| e.to_string())?;
                if chunk.len() > bound.saturating_sub(body.len()) {
                    return Err("HTTP response exceeds bounded read limit".into());
                }
                body.extend_from_slice(&chunk);
            }
            Ok(Response {
                status,
                headers,
                body,
                url: final_url,
            })
        };
        tokio::select! {
            biased;
            _ = self.cancel.cancelled() => Err("backend stopping".into()),
            result = tokio::time::timeout(timeout,operation) => result.map_err(|_| "HTTP request timed out".to_owned())?,
        }
    }

    pub async fn json(&self, url: &str, timeout: Duration, limit: usize) -> Result<Value, String> {
        let response = self
            .request(
                Method::GET,
                url,
                &[
                    ("Accept", "application/json"),
                    ("Content-Type", "application/json"),
                ],
                None,
                timeout,
                limit,
                Redirects::Default,
            )
            .await?;
        if !(200..300).contains(&response.status) {
            return Err(format!("HTTP {}", response.status));
        }
        response.json()
    }

    pub async fn text(&self, url: &str, timeout: Duration, limit: usize) -> Result<String, String> {
        let response = self
            .request(
                Method::GET,
                url,
                &[],
                None,
                timeout,
                limit,
                Redirects::Default,
            )
            .await?;
        if !(200..300).contains(&response.status) {
            return Err(format!("HTTP {}", response.status));
        }
        Ok(response.text())
    }

    #[cfg(test)]
    pub fn fixtures(fixtures: Vec<Fixture>) -> Self {
        let mut http = Self::new(CancellationToken::new(), "test").unwrap();
        http.fixtures = Some(Arc::new(std::sync::Mutex::new(fixtures.into())));
        http
    }

    #[cfg(test)]
    pub fn assert_drained(&self) {
        assert!(
            self.fixtures.as_ref().unwrap().lock().unwrap().is_empty(),
            "unused HTTP fixture"
        );
    }

    #[cfg(test)]
    pub fn gate_next_request(&mut self) -> Arc<TestGate> {
        let gate = Arc::new(TestGate {
            started: tokio::sync::Notify::new(),
            resume: tokio::sync::Notify::new(),
            used: std::sync::atomic::AtomicBool::new(false),
        });
        self.gate = Some(Arc::clone(&gate));
        gate
    }
}

fn response_limit(
    status: u16,
    headers: &HeaderMap,
    limit: usize,
    error_limit: usize,
) -> Result<usize, String> {
    let bound = if (200..300).contains(&status) {
        limit
    } else {
        error_limit
    };
    if let Some(length) = headers.get("Content-Length") {
        let length = length
            .to_str()
            .map_err(|_| "invalid HTTP response length")?
            .parse::<u64>()
            .map_err(|_| "invalid HTTP response length")?;
        if length > bound as u64 {
            return Err("HTTP response exceeds bounded read limit".into());
        }
    }
    Ok(bound)
}

#[cfg(test)]
pub struct TestGate {
    pub started: tokio::sync::Notify,
    pub resume: tokio::sync::Notify,
    used: std::sync::atomic::AtomicBool,
}

#[cfg(test)]
pub struct Fixture {
    pub method: Method,
    pub url: String,
    pub result: Result<Response, String>,
}
#[cfg(test)]
impl Fixture {
    pub fn json(url: impl Into<String>, body: Value) -> Self {
        let url = url.into();
        Self {
            method: Method::GET,
            url: url.clone(),
            result: Ok(Response {
                status: 200,
                headers: HeaderMap::new(),
                body: serde_json::to_vec(&body).unwrap(),
                url,
            }),
        }
    }
    pub fn text(url: impl Into<String>, body: &str) -> Self {
        let url = url.into();
        Self {
            method: Method::GET,
            url: url.clone(),
            result: Ok(Response {
                status: 200,
                headers: HeaderMap::new(),
                body: body.as_bytes().to_vec(),
                url,
            }),
        }
    }
    pub fn failure(url: impl Into<String>) -> Self {
        Self {
            method: Method::GET,
            url: url.into(),
            result: Err("connection failed".into()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::{
        io::{AsyncReadExt, AsyncWriteExt},
        net::TcpListener,
    };
    async fn server(reply: &'static [u8], delay: Duration) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut request = [0u8; 2048];
            let _ = socket.read(&mut request).await;
            tokio::time::sleep(delay).await;
            let _ = socket.write_all(reply).await;
        });
        format!("http://{address}/")
    }

    #[tokio::test]
    async fn explicit_user_agent_overrides_browser_default_on_the_wire() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut request = Vec::new();
            let mut buffer = [0u8; 1024];
            while !request.ends_with(b"\r\n\r\n") {
                let count = socket.read(&mut buffer).await.unwrap();
                assert!(count > 0 && request.len() + count <= 8192);
                request.extend_from_slice(&buffer[..count]);
            }
            let request = String::from_utf8(request).unwrap();
            let agents = request
                .lines()
                .filter_map(|line| line.split_once(':'))
                .filter(|(name, _)| name.eq_ignore_ascii_case("User-Agent"))
                .map(|(_, value)| value.trim())
                .collect::<Vec<_>>();
            let reply = if agents == ["Metadata-Updater-Test/1"] {
                b"HTTP/1.1 200 OK\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".as_slice()
            } else {
                b"HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".as_slice()
            };
            socket.write_all(reply).await.unwrap();
        });
        let http = Http::new(CancellationToken::new(), "test").unwrap();
        let response = http
            .request(
                Method::GET,
                &format!("http://{address}/"),
                &[("user-agent", "Metadata-Updater-Test/1")],
                None,
                Duration::from_secs(2),
                1024,
                Redirects::Default,
            )
            .await
            .unwrap();
        server.await.unwrap();
        assert_eq!(response.status, 200);
    }
    #[tokio::test]
    async fn real_transport_enforces_declared_and_streamed_bounds() {
        let http = Http::new(CancellationToken::new(), "test").unwrap();
        let large = server(
            b"HTTP/1.1 200 OK\r\nContent-Length: 1000\r\nConnection: close\r\n\r\nx",
            Duration::ZERO,
        )
        .await;
        assert!(
            http.text(&large, Duration::from_secs(1), 10)
                .await
                .unwrap_err()
                .contains("bounded")
        );
        let streamed = server(
            b"HTTP/1.1 200 OK\r\nConnection: close\r\n\r\n01234567890",
            Duration::ZERO,
        )
        .await;
        assert!(
            http.text(&streamed, Duration::from_secs(1), 10)
                .await
                .unwrap_err()
                .contains("bounded")
        );
        let valid = server(
            b"HTTP/1.1 200 OK\r\nContent-Length: 11\r\nConnection: close\r\n\r\n{\"ok\":true}",
            Duration::ZERO,
        )
        .await;
        assert_eq!(
            http.json(&valid, Duration::from_secs(1), 11).await.unwrap(),
            serde_json::json!({"ok":true})
        );
    }
    #[tokio::test]
    async fn real_transport_timeout_and_cancellation_drop_request() {
        let http = Http::new(CancellationToken::new(), "test").unwrap();
        let url = server(
            b"HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n",
            Duration::from_secs(1),
        )
        .await;
        assert_eq!(
            http.text(&url, Duration::from_millis(20), 20)
                .await
                .unwrap_err(),
            "HTTP request timed out"
        );
        let child = http.clone();
        let url = server(
            b"HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n",
            Duration::from_secs(1),
        )
        .await;
        let task = tokio::spawn(async move { child.text(&url, Duration::from_secs(2), 20).await });
        tokio::task::yield_now().await;
        http.cancel.cancel();
        assert_eq!(task.await.unwrap().unwrap_err(), "backend stopping");
    }
    #[tokio::test]
    async fn diagnostic_evidence_distinguishes_bounded_http_failure_from_no_response() {
        let (http, requests) = Http::new_recording(CancellationToken::new(), "test").unwrap();
        let oversized=server(b"HTTP/1.1 503 Service Unavailable\r\nContent-Type: application/json\r\nContent-Length: 1000\r\nConnection: close\r\n\r\nx",Duration::ZERO).await;
        assert!(
            http.text(&oversized, Duration::from_secs(1), 10)
                .await
                .is_err()
        );
        let stalled = server(
            b"HTTP/1.1 200 OK\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
            Duration::from_secs(1),
        )
        .await;
        assert!(
            http.text(&stalled, Duration::from_millis(20), 10)
                .await
                .is_err()
        );
        let requests = requests.lock().unwrap();
        assert_eq!(requests[0].status, Some(503));
        assert_eq!(requests[0].content_type, "application/json");
        assert_eq!(requests[1].status, None);
    }
    #[tokio::test]
    async fn guarded_redirect_rejects_initial_noncanonical_origin() {
        let http = Http::new(CancellationToken::new(), "test").unwrap();
        for url in [
            "https://ign.com/games/a",
            "http://www.ign.com/",
            "https://www.ign.com.evil/",
            "https://user@www.ign.com/",
            "https://www.ign.com:444/",
        ] {
            assert!(
                http.request(
                    Method::GET,
                    url,
                    &[],
                    None,
                    Duration::from_secs(1),
                    100,
                    Redirects::Ign
                )
                .await
                .unwrap_err()
                .contains("canonical")
            );
        }
    }
}
