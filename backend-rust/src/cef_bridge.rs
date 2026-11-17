use crate::{logging, matching::py_truthy};
use futures_util::{FutureExt, SinkExt, StreamExt};
use reqwest::{Client, redirect::Policy};
use serde_json::{Value, json};
use std::{
    io::{self, ErrorKind},
    pin::Pin,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, AtomicUsize, Ordering},
    },
    task::{Context, Poll},
    time::{Duration, Instant},
};
use tokio::{
    io::{AsyncRead, AsyncWrite, ReadBuf},
    net::TcpStream,
};
use tokio_tungstenite::{
    WebSocketStream, client_async_with_config,
    tungstenite::{Error as WebSocketError, Message, protocol::WebSocketConfig},
};
use tokio_util::sync::CancellationToken;

const MAX_EVALUATION_BYTES: usize = 512 * 1024;
const MAX_DISCOVERY_BYTES: usize = 1024 * 1024;
const MAX_UPGRADE_HEADER_BYTES: usize = 64 * 1024;
const MAX_RESPONSE_BYTES: usize = 16 * 1024 * 1024;
const DISCOVERY_TIMEOUT: Duration = Duration::from_secs(3);
const UPGRADE_TIMEOUT: Duration = Duration::from_secs(5);
const RESPONSE_TIMEOUT: Duration = Duration::from_secs(8);
const WARNING_INTERVAL: Duration = Duration::from_secs(30);
const DISCOVERY_URL: &str = "http://127.0.0.1:8080/json";

pub struct BigPictureEvaluator {
    discovery: Client,
    discovery_url: String,
    cancel: CancellationToken,
    last_debugger_warning: Mutex<Option<Instant>>,
    session: tokio::sync::Mutex<Option<Session>>,
    response_timeout: Duration,
}

struct Session {
    target: Value,
    websocket: WebSocketStream<HandshakeBudgetIo>,
    next_id: u64,
}

impl Session {
    // Only automatic retry: a cached socket that already saw a close/error was never sent the command.
    fn is_alive(&mut self) -> bool {
        loop {
            match self.websocket.next().now_or_never() {
                None => return true,
                Some(Some(Ok(Message::Close(_)))) | Some(None) | Some(Some(Err(_))) => return false,
                Some(Some(Ok(_))) => {}
            }
        }
    }

    async fn request(&mut self, code: &str, timeout: Duration) -> Result<Value, BridgeError> {
        let id = self.next_id;
        self.next_id += 1;
        let payload = json!({
            "id":id,
            "method":"Runtime.evaluate",
            "params":{
                "expression":code,
                "returnByValue":true,
                "awaitPromise":false
            }
        });
        tokio::time::timeout(timeout, self.websocket.send(Message::text(payload.to_string())))
            .await
            .map_err(|_| BridgeError::Retryable("DevTools WebSocket write timed out".into()))?
            .map_err(websocket_error)?;
        tokio::time::timeout(
            timeout,
            async {
                loop {
                    let message = self
                        .websocket
                        .next()
                        .await
                        .ok_or_else(|| {
                            BridgeError::Retryable("Unexpected socket close".into())
                        })?
                        .map_err(websocket_error)?;
                    let text = match message {
                        Message::Text(text) => text,
                        Message::Close(_) => {
                            return Err(BridgeError::Retryable(
                                "DevTools WebSocket closed".into(),
                            ));
                        }
                        _ => continue,
                    };
                    let response: Value = serde_json::from_str(text.as_str())
                        .map_err(|error| BridgeError::Failure(error.to_string()))?;
                    if !response.is_object() {
                        return Err(BridgeError::Failure(
                            "Invalid DevTools WebSocket response".into(),
                        ));
                    }
                    if response.get("id").and_then(Value::as_u64) == Some(id) {
                        return Ok(response);
                    }
                }
            },
        )
        .await
        .map_err(|_| BridgeError::Retryable("DevTools WebSocket read timed out".into()))?
    }
}

#[derive(Debug)]
enum BridgeError {
    Cancelled,
    Retryable(String),
    Failure(String),
}

impl BigPictureEvaluator {
    pub fn new(cancel: CancellationToken) -> Result<Self, String> {
        let discovery = Client::builder()
            .no_proxy()
            .redirect(Policy::none())
            .build()
            .map_err(|error| error.to_string())?;
        Ok(Self {
            discovery,
            discovery_url: DISCOVERY_URL.to_owned(),
            cancel,
            last_debugger_warning: Mutex::new(None),
            session: tokio::sync::Mutex::new(None),
            response_timeout: RESPONSE_TIMEOUT,
        })
    }

    #[cfg(test)]
    fn with_discovery_url(
        cancel: CancellationToken,
        discovery_url: impl Into<String>,
    ) -> Result<Self, String> {
        let mut evaluator = Self::new(cancel)?;
        evaluator.discovery_url = discovery_url.into();
        Ok(evaluator)
    }

    pub async fn eval_in_big_picture(&self, code: &Value) -> Value {
        let Some(code) = code.as_str() else {
            return json!({"status":"steam_ui_unavailable","error":"Evaluation script is invalid or too large"});
        };
        if code.len() > MAX_EVALUATION_BYTES {
            return json!({"status":"steam_ui_unavailable","error":"Evaluation script is invalid or too large"});
        }
        if self.cancel.is_cancelled() {
            return Self::unavailable();
        }

        let result = self.evaluate(code).await;

        if self.cancel.is_cancelled() {
            return Self::unavailable();
        }
        match result {
            Ok(result) => result,
            Err(error) => {
                match &error {
                    BridgeError::Cancelled => {}
                    BridgeError::Retryable(error) => {
                        if self.claim_debugger_warning(Instant::now()) {
                            logging::event(
                                "cef",
                                &format!(
                                    "Steam Big Picture evaluator temporarily unavailable: {error}"
                                ),
                                json!({"error":error}),
                                log::Level::Warn,
                            );
                        }
                    }
                    BridgeError::Failure(error) => {
                        logging::event(
                            "cef",
                            "Failed to evaluate code in Steam Big Picture",
                            json!({"error":error}),
                            log::Level::Error,
                        );
                    }
                }
                Self::error_envelope(&error)
            }
        }
    }

    fn unavailable() -> Value {
        json!({"status":"steam_ui_unavailable","error":"Plugin is unloading","runtimeMissing":true})
    }
    fn error_envelope(error: &BridgeError) -> Value {
        match error {
            BridgeError::Cancelled => json!({
                "status":"steam_ui_unavailable",
                "error":"Plugin is unloading",
                "runtimeMissing":true
            }),
            BridgeError::Retryable(error) => {
                json!({"status":"steam_ui_unavailable","error":error,"retryable":true})
            }
            BridgeError::Failure(error) => json!({"status":"steam_ui_unavailable","error":error}),
        }
    }

    fn claim_debugger_warning(&self, now: Instant) -> bool {
        let mut last = self.last_debugger_warning.lock().unwrap();
        if last.is_some_and(|last| now.saturating_duration_since(last) < WARNING_INTERVAL) {
            return false;
        }
        *last = Some(now);
        true
    }

    pub async fn close(&self) {
        let Ok(mut cached) =
            tokio::time::timeout(Duration::from_millis(200), self.session.lock()).await
        else {
            return;
        };
        let Some(mut session) = cached.take() else {
            return;
        };
        let _ = tokio::time::timeout(
            Duration::from_millis(500),
            session.websocket.close(None),
        )
        .await;
    }

    async fn evaluate(&self, code: &str) -> Result<Value, BridgeError> {
        let operation = async {
            let mut cached = self.session.lock().await;
            let mut session = cached.take();
            if session.as_mut().is_some_and(|session| !session.is_alive()) {
                session = None;
            }
            let mut session = match session {
                Some(session) => session,
                None => match self.connect_session().await? {
                    Some(session) => session,
                    None => {
                        return Ok(json!({
                            "status":"steam_ui_unavailable",
                            "error":"No Big Picture DevTools target found"
                        }));
                    }
                },
            };
            let response = session.request(code, self.response_timeout).await?;
            let result = evaluation_result(&session.target, response)?;
            *cached = Some(session);
            Ok(result)
        };
        tokio::select! {
            biased;
            _ = self.cancel.cancelled() => Err(BridgeError::Cancelled),
            result = operation => result,
        }
    }

    async fn find_big_picture_target(&self) -> Result<Option<Value>, BridgeError> {
        self.find_big_picture_target_at(&self.discovery_url, DISCOVERY_TIMEOUT)
            .await
    }

    async fn find_big_picture_target_at(
        &self,
        url: &str,
        timeout: Duration,
    ) -> Result<Option<Value>, BridgeError> {
        tokio::select! {
            biased;
            _ = self.cancel.cancelled() => Err(BridgeError::Cancelled),
            result = discover_targets(&self.discovery, url, timeout) => {
                select_big_picture_target(&result?)
            }
        }
    }

    async fn connect_session(&self) -> Result<Option<Session>, BridgeError> {
        let Some(target) = self.find_big_picture_target().await? else {
            return Ok(None);
        };
        Ok(Some(self.open_session(&target, UPGRADE_TIMEOUT).await?))
    }

    async fn open_session(
        &self,
        target: &Value,
        handshake_timeout: Duration,
    ) -> Result<Session, BridgeError> {
        let websocket_url = target
            .get("webSocketDebuggerUrl")
            .and_then(Value::as_str)
            .ok_or_else(|| BridgeError::Failure("Invalid DevTools WebSocket URL".into()))?;
        let websocket = self.connect_websocket(websocket_url, handshake_timeout).await?;
        Ok(Session {
            target: target.clone(),
            websocket,
            next_id: 1,
        })
    }

    async fn connect_websocket(
        &self,
        websocket_url: &str,
        handshake_timeout: Duration,
    ) -> Result<WebSocketStream<HandshakeBudgetIo>, BridgeError> {
        let (url, host, port) = local_websocket_url(websocket_url)?;
        let stream =
            tokio::time::timeout(handshake_timeout, TcpStream::connect((host.as_str(), port)))
                .await
                .map_err(|_| {
                    BridgeError::Retryable("DevTools WebSocket connect timed out".into())
                })?
                .map_err(|error| BridgeError::Retryable(error.to_string()))?;
        let handshake_budget = Arc::new(AtomicUsize::new(MAX_UPGRADE_HEADER_BYTES));
        let handshake_active = Arc::new(AtomicBool::new(true));
        let transport = HandshakeBudgetIo {
            stream,
            remaining: Arc::clone(&handshake_budget),
            active: Arc::clone(&handshake_active),
        };
        let mut config = WebSocketConfig::default();
        config.max_frame_size = Some(MAX_RESPONSE_BYTES);
        config.max_message_size = Some(MAX_RESPONSE_BYTES);
        let (websocket, _) = tokio::time::timeout(
            handshake_timeout,
            client_async_with_config(url.as_str(), transport, Some(config)),
        )
        .await
        .map_err(|_| {
            BridgeError::Retryable("DevTools WebSocket upgrade header timed out".into())
        })?
        .map_err(websocket_error)?;
        handshake_active.store(false, Ordering::Relaxed);
        Ok(websocket)
    }
}

fn websocket_error(error: WebSocketError) -> BridgeError {
    match error {
        WebSocketError::Io(error) if error.kind() == ErrorKind::InvalidData => {
            BridgeError::Failure(error.to_string())
        }
        WebSocketError::Io(error) => BridgeError::Retryable(error.to_string()),
        WebSocketError::Http(_) => {
            BridgeError::Retryable("DevTools WebSocket handshake failed".into())
        }
        WebSocketError::ConnectionClosed | WebSocketError::AlreadyClosed => {
            BridgeError::Retryable("DevTools WebSocket closed".into())
        }
        error => BridgeError::Failure(error.to_string()),
    }
}
fn local_websocket_url(raw: &str) -> Result<(reqwest::Url, String, u16), BridgeError> {
    let mut url =
        reqwest::Url::parse(raw).map_err(|error| BridgeError::Failure(error.to_string()))?;
    let raw_host = url
        .host_str()
        .ok_or_else(|| BridgeError::Retryable("DevTools WebSocket target is not local".into()))?;
    let host = raw_host
        .strip_prefix('[')
        .and_then(|host| host.strip_suffix(']'))
        .unwrap_or(raw_host);
    if !matches!(url.scheme(), "ws" | "wss") || !matches!(host, "127.0.0.1" | "localhost" | "::1") {
        return Err(BridgeError::Retryable(
            "DevTools WebSocket target is not local".into(),
        ));
    }
    let host = host.to_owned();
    let port = url.port().unwrap_or(80);
    url.set_username("")
        .map_err(|_| BridgeError::Failure("Invalid DevTools WebSocket URL".into()))?;
    url.set_password(None)
        .map_err(|_| BridgeError::Failure("Invalid DevTools WebSocket URL".into()))?;
    url.set_fragment(None);
    url.set_port(Some(port))
        .map_err(|_| BridgeError::Failure("Invalid DevTools WebSocket URL".into()))?;
    Ok((url, host, port))
}

async fn discover_targets(
    client: &Client,
    url: &str,
    timeout: Duration,
) -> Result<Value, BridgeError> {
    let operation = async {
        let response = client
            .get(url)
            .send()
            .await
            .map_err(|error| BridgeError::Retryable(error.to_string()))?;
        if let Some(length) = response.headers().get(reqwest::header::CONTENT_LENGTH) {
            let length = length
                .to_str()
                .ok()
                .and_then(|length| length.parse::<u64>().ok())
                .ok_or_else(|| BridgeError::Failure("Invalid DevTools discovery length".into()))?;
            if length > MAX_DISCOVERY_BYTES as u64 {
                return Err(BridgeError::Failure(
                    "DevTools discovery response is too large".into(),
                ));
            }
        }
        let mut body = Vec::with_capacity(
            response
                .content_length()
                .unwrap_or(0)
                .min(MAX_DISCOVERY_BYTES as u64) as usize,
        );
        let mut chunks = response.bytes_stream();
        while let Some(chunk) = chunks.next().await {
            let chunk = chunk.map_err(|error| BridgeError::Retryable(error.to_string()))?;
            if chunk.len() > MAX_DISCOVERY_BYTES.saturating_sub(body.len()) {
                return Err(BridgeError::Failure(
                    "DevTools discovery response is too large".into(),
                ));
            }
            body.extend_from_slice(&chunk);
        }
        serde_json::from_slice(&body).map_err(|error| BridgeError::Failure(error.to_string()))
    };
    tokio::time::timeout(timeout, operation)
        .await
        .map_err(|_| BridgeError::Retryable("DevTools discovery timed out".into()))?
}

fn select_big_picture_target(targets: &Value) -> Result<Option<Value>, BridgeError> {
    let targets = targets.as_array().ok_or_else(|| {
        BridgeError::Failure("DevTools discovery response is not an array".into())
    })?;
    let mut best: Option<(i32, &Value)> = None;
    for target in targets {
        let object = target
            .as_object()
            .ok_or_else(|| BridgeError::Failure("Invalid DevTools target".into()))?;
        if object.get("type").and_then(Value::as_str) != Some("page")
            || !object.get("webSocketDebuggerUrl").is_some_and(py_truthy)
        {
            continue;
        }
        let title = object.get("title").filter(|value| py_truthy(value));
        let title = title
            .map(|value| {
                value
                    .as_str()
                    .ok_or_else(|| BridgeError::Failure("Invalid DevTools target title".into()))
            })
            .transpose()?
            .unwrap_or("")
            .to_lowercase();
        let target_url = object.get("url").filter(|value| py_truthy(value));
        let target_url = target_url
            .map(|value| {
                value
                    .as_str()
                    .ok_or_else(|| BridgeError::Failure("Invalid DevTools target URL".into()))
            })
            .transpose()?
            .unwrap_or("")
            .to_lowercase();
        let score = if title.contains("sharedjscontext")
            || ["quickaccess", "mainmenu", "notification"]
                .iter()
                .any(|text| title.contains(text))
        {
            -100
        } else if title.contains("big picture") || title.contains("modalit") {
            100
        } else if target_url.contains("browsertype=3") && !target_url.contains("browserviewpopup") {
            60
        } else {
            0
        };
        if best.is_none_or(|(best_score, _)| score > best_score) {
            best = Some((score, target));
        }
    }
    Ok(best
        .filter(|(score, _)| *score > 0)
        .map(|(_, target)| target.clone()))
}

fn evaluation_result(target: &Value, mut response: Value) -> Result<Value, BridgeError> {
    let mut evaluation = response
        .as_object_mut()
        .ok_or_else(|| BridgeError::Failure("Invalid Runtime.evaluate response".into()))?
        .remove("result")
        .unwrap_or_else(|| json!({}));
    let evaluation = evaluation
        .as_object_mut()
        .ok_or_else(|| BridgeError::Failure("Invalid Runtime.evaluate response".into()))?;
    if let Some(details) = evaluation.remove("exceptionDetails") {
        let details = details
            .as_object()
            .ok_or_else(|| BridgeError::Failure("Invalid Runtime.evaluate exception".into()))?;
        let exception = details.get("exception").filter(|value| py_truthy(value));
        let error = exception
            .and_then(|exception| exception.get("description"))
            .filter(|value| py_truthy(value))
            .or_else(|| {
                exception
                    .and_then(|exception| exception.get("value"))
                    .filter(|value| py_truthy(value))
            })
            .or_else(|| details.get("text").filter(|value| py_truthy(value)))
            .cloned()
            .unwrap_or_else(|| json!("Runtime.evaluate exception"));
        return Ok(json!({"status":"Steam script error","error":error}));
    }
    let value = evaluation
        .get_mut("result")
        .and_then(Value::as_object_mut)
        .and_then(|result| result.remove("value"));
    if let Some(Value::Object(mut value)) = value {
        value.insert(
            "tab".into(),
            target.get("title").cloned().unwrap_or(Value::Null),
        );
        return Ok(Value::Object(value));
    }
    Ok(json!({
        "status":"Unexpected Steam response",
        "error":"Runtime.evaluate returned no object value",
        "tab":target.get("title").cloned().unwrap_or(Value::Null)
    }))
}

#[derive(Debug)]
struct HandshakeBudgetIo {
    stream: TcpStream,
    remaining: Arc<AtomicUsize>,
    active: Arc<AtomicBool>,
}

impl AsyncRead for HandshakeBudgetIo {
    fn poll_read(
        self: Pin<&mut Self>,
        context: &mut Context<'_>,
        buffer: &mut ReadBuf<'_>,
    ) -> Poll<io::Result<()>> {
        let this = self.get_mut();
        if !this.active.load(Ordering::Relaxed) {
            return Pin::new(&mut this.stream).poll_read(context, buffer);
        }
        let allowed = buffer
            .remaining()
            .min(this.remaining.load(Ordering::Relaxed));
        if allowed == 0 {
            return Poll::Ready(Err(io::Error::new(
                ErrorKind::InvalidData,
                "DevTools WebSocket upgrade header is too large",
            )));
        }
        let (result, bytes_read) = {
            let mut limited = buffer.take(allowed);
            let result = Pin::new(&mut this.stream).poll_read(context, &mut limited);
            (result, limited.filled().len())
        };
        match result {
            Poll::Ready(Ok(())) => {
                if bytes_read > 0 {
                    this.remaining.fetch_sub(bytes_read, Ordering::Relaxed);
                    buffer.advance(bytes_read);
                }
                Poll::Ready(Ok(()))
            }
            Poll::Ready(Err(error)) => Poll::Ready(Err(error)),
            Poll::Pending => Poll::Pending,
        }
    }
}

impl AsyncWrite for HandshakeBudgetIo {
    fn poll_write(
        self: Pin<&mut Self>,
        context: &mut Context<'_>,
        buffer: &[u8],
    ) -> Poll<io::Result<usize>> {
        Pin::new(&mut self.get_mut().stream).poll_write(context, buffer)
    }

    fn poll_flush(self: Pin<&mut Self>, context: &mut Context<'_>) -> Poll<io::Result<()>> {
        Pin::new(&mut self.get_mut().stream).poll_flush(context)
    }

    fn poll_shutdown(self: Pin<&mut Self>, context: &mut Context<'_>) -> Poll<io::Result<()>> {
        Pin::new(&mut self.get_mut().stream).poll_shutdown(context)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::{
        io::{AsyncReadExt, AsyncWriteExt},
        net::TcpListener,
        sync::oneshot,
    };

    const CEF_DISCOVERY_TARGET_SELECTION_FIXTURE: &str = r#"[
      {"type":"page","title":"SharedJSContext","url":"http://steamloopback.host/shared","webSocketDebuggerUrl":"ws://127.0.0.1:1/shared"},
      {"type":"page","title":"QuickAccess_uid14","url":"http://steamloopback.host/quickaccess","webSocketDebuggerUrl":"ws://127.0.0.1:1/quickaccess"},
      {"type":"page","title":"MainMenu","url":"http://steamloopback.host/mainmenu","webSocketDebuggerUrl":"ws://127.0.0.1:1/mainmenu"},
      {"type":"page","title":"Notifications","url":"http://steamloopback.host/notifications","webSocketDebuggerUrl":"ws://127.0.0.1:1/notifications"},
      {"type":"page","title":"Steam Big Picture Mode","url":"http://steamloopback.host/bigpicture","webSocketDebuggerUrl":"ws://127.0.0.1:1/bigpicture"},
      {"type":"page","title":"Browser View Popup","url":"http://steamloopback.host/?browserType=3&browserViewPopup=1","webSocketDebuggerUrl":"ws://127.0.0.1:1/popup"},
      {"type":"page","title":"Game Details","url":"http://steamloopback.host/?browserType=3","webSocketDebuggerUrl":"ws://127.0.0.1:1/default-world"},
      {"type":"worker","title":"Steam Big Picture Mode","url":"http://steamloopback.host/worker","webSocketDebuggerUrl":"ws://127.0.0.1:1/worker"}
    ]"#;

    struct LocalHttp {
        url: String,
        response_started: oneshot::Receiver<()>,
    }

    async fn local_http(body: Vec<u8>, declared_length: usize, stall: bool) -> LocalHttp {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let (started, response_started) = oneshot::channel();
        tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut request = Vec::new();
            let mut chunk = [0; 1024];
            while !request.windows(4).any(|window| window == b"\r\n\r\n") {
                let count = socket.read(&mut chunk).await.unwrap();
                if count == 0 {
                    return;
                }
                request.extend_from_slice(&chunk[..count]);
            }
            let headers = format!(
                "HTTP/1.1 200 OK\r\nContent-Length: {declared_length}\r\nConnection: close\r\n\r\n"
            );
            socket.write_all(headers.as_bytes()).await.unwrap();
            socket.write_all(&body).await.unwrap();
            let _ = started.send(());
            if stall {
                tokio::time::sleep(Duration::from_secs(1)).await;
                let mut byte = [0; 1];
                let _ = socket.read(&mut byte).await;
            }
        });
        LocalHttp {
            url: format!("http://{address}/json"),
            response_started,
        }
    }

    fn target_for(url: &str) -> Value {
        json!({"title":"Steam Big Picture Mode","type":"page","webSocketDebuggerUrl":url})
    }

    async fn read_http_headers(socket: &mut TcpStream) -> Vec<u8> {
        let mut request = Vec::new();
        let mut chunk = [0; 1024];
        while !request.windows(4).any(|window| window == b"\r\n\r\n") {
            let count = socket.read(&mut chunk).await.unwrap();
            assert_ne!(count, 0);
            request.extend_from_slice(&chunk[..count]);
        }
        request
    }

    type ServerSocket = tokio_tungstenite::WebSocketStream<TcpStream>;

    async fn read_command(websocket: &mut ServerSocket) -> Value {
        let Message::Text(text) = websocket.next().await.unwrap().unwrap() else {
            panic!("expected Runtime.evaluate command")
        };
        serde_json::from_str(text.as_str()).unwrap()
    }

    fn reply_for(id: u64) -> String {
        json!({
            "id":id,
            "result":{"result":{"value":{"status":"playing","appId":570,"tab":"object tab"}}}
        })
        .to_string()
    }

    struct FakeDiscovery {
        url: String,
        requests: Arc<AtomicUsize>,
    }

    async fn fake_discovery(websocket_url: String) -> FakeDiscovery {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let requests = Arc::new(AtomicUsize::new(0));
        let counter = Arc::clone(&requests);
        tokio::spawn(async move {
            loop {
                let Ok((mut socket, _)) = listener.accept().await else {
                    return;
                };
                counter.fetch_add(1, Ordering::SeqCst);
                let _ = read_http_headers(&mut socket).await;
                let body = json!([{
                    "type":"page",
                    "title":"Steam Big Picture Mode",
                    "url":"http://steamloopback.host/bigpicture",
                    "webSocketDebuggerUrl":websocket_url.clone()
                }])
                .to_string();
                let response = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    body.len(),
                    body
                );
                let _ = socket.write_all(response.as_bytes()).await;
            }
        });
        FakeDiscovery {
            url: format!("http://{address}/json"),
            requests,
        }
    }

    #[tokio::test]
    async fn discovery_selects_big_picture_and_excludes_non_default_world_targets() {
        let LocalHttp {
            url,
            response_started,
        } = local_http(
            CEF_DISCOVERY_TARGET_SELECTION_FIXTURE.as_bytes().to_vec(),
            CEF_DISCOVERY_TARGET_SELECTION_FIXTURE.len(),
            false,
        )
        .await;
        let evaluator = BigPictureEvaluator::new(CancellationToken::new()).unwrap();
        let selected = evaluator
            .find_big_picture_target_at(&url, DISCOVERY_TIMEOUT)
            .await
            .unwrap()
            .unwrap();
        response_started.await.unwrap();
        assert_eq!(selected["title"], "Steam Big Picture Mode");
        let fallback = select_big_picture_target(&json!([
            {"type":"page","title":"Popup","url":"?browserType=3&browserViewPopup=1","webSocketDebuggerUrl":"ws://127.0.0.1:1"},
            {"type":"page","title":"Game Details","url":"?browserType=3","webSocketDebuggerUrl":"ws://127.0.0.1:1"}
        ]))
        .unwrap()
        .unwrap();
        assert_eq!(fallback["title"], "Game Details");
        let modal = select_big_picture_target(&json!([
            {"type":"page","title":"Modalit","webSocketDebuggerUrl":"ws://127.0.0.1:1"}
        ]))
        .unwrap()
        .unwrap();
        assert_eq!(modal["title"], "Modalit");
        assert_eq!(
            select_big_picture_target(&json!([
                {"type":"page","title":"SharedJSContext Big Picture","webSocketDebuggerUrl":"ws://127.0.0.1:1"},
                {"type":"page","title":"MainMenu","url":"?browserType=3","webSocketDebuggerUrl":"ws://127.0.0.1:1"},
                {"type":"page","title":"Popup","url":"?browserType=3&browserViewPopup=1","webSocketDebuggerUrl":"ws://127.0.0.1:1"}
            ]))
            .unwrap(),
            None
        );
    }

    #[tokio::test]
    async fn discovery_rejects_malformed_and_oversized_bodies() {
        let evaluator = BigPictureEvaluator::new(CancellationToken::new()).unwrap();
        let LocalHttp {
            url,
            response_started,
        } = local_http(b"not-json".to_vec(), 8, false).await;
        assert!(matches!(
            evaluator
                .find_big_picture_target_at(&url, DISCOVERY_TIMEOUT)
                .await,
            Err(BridgeError::Failure(_))
        ));
        response_started.await.unwrap();

        let LocalHttp {
            url,
            response_started,
        } = local_http(Vec::new(), MAX_DISCOVERY_BYTES + 1, false).await;
        assert!(matches!(
            evaluator.find_big_picture_target_at(&url, DISCOVERY_TIMEOUT).await,
            Err(BridgeError::Failure(message)) if message.contains("too large")
        ));
        response_started.await.unwrap();
    }

    #[tokio::test]
    async fn discovery_deadline_and_cancellation_interrupt_local_http_reads() {
        let evaluator = BigPictureEvaluator::new(CancellationToken::new()).unwrap();
        let LocalHttp {
            url,
            response_started,
        } = local_http(b"[".to_vec(), 2, true).await;
        let result = evaluator
            .find_big_picture_target_at(&url, Duration::from_millis(40))
            .await;
        response_started.await.unwrap();
        assert!(
            matches!(result, Err(BridgeError::Retryable(message)) if message.contains("discovery timed out"))
        );

        let cancel = CancellationToken::new();
        let evaluator = BigPictureEvaluator::new(cancel.clone()).unwrap();
        let LocalHttp {
            url,
            response_started,
        } = local_http(b"[".to_vec(), 2, true).await;
        let request = tokio::spawn(async move {
            evaluator
                .find_big_picture_target_at(&url, DISCOVERY_TIMEOUT)
                .await
        });
        response_started.await.unwrap();
        cancel.cancel();
        assert!(matches!(
            request.await.unwrap(),
            Err(BridgeError::Cancelled)
        ));
    }

    #[tokio::test]
    async fn websocket_runs_runtime_evaluate_merges_tab_and_exceeds_handshake_budget_after_upgrade()
    {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let (command_tx, command_rx) = oneshot::channel();
        let large = "x".repeat(MAX_UPGRADE_HEADER_BYTES + 1024);
        tokio::spawn(async move {
            let (stream, _) = listener.accept().await.unwrap();
            let mut websocket = tokio_tungstenite::accept_async(stream).await.unwrap();
            let command = read_command(&mut websocket).await;
            let _ = command_tx.send(command.clone());
            let reply = json!({
                "id":command["id"],
                "result":{"result":{"value":{"status":"playing","appId":570,"tab":"object tab","description":large}}}
            });
            websocket
                .send(Message::text(reply.to_string()))
                .await
                .unwrap();
        });
        let evaluator = BigPictureEvaluator::new(CancellationToken::new()).unwrap();
        let target = target_for(&format!("ws://{address}/devtools/page/fixture"));
        let mut session = evaluator
            .open_session(&target, UPGRADE_TIMEOUT)
            .await
            .unwrap();
        let response = session
            .request("({status:'playing',appId:570})", RESPONSE_TIMEOUT)
            .await
            .unwrap();
        let result = evaluation_result(&session.target, response).unwrap();
        let command = command_rx.await.unwrap();
        assert_eq!(command["method"], "Runtime.evaluate");
        assert_eq!(
            command["params"]["expression"],
            "({status:'playing',appId:570})"
        );
        assert_eq!(command["params"]["returnByValue"], true);
        assert_eq!(command["params"]["awaitPromise"], false);
        assert_eq!(result["tab"], "Steam Big Picture Mode");
        assert_eq!(
            result["description"].as_str().unwrap().len(),
            MAX_UPGRADE_HEADER_BYTES + 1024
        );
    }

    #[tokio::test]
    async fn websocket_rejects_non_loopback_and_malformed_handshakes() {
        let evaluator = BigPictureEvaluator::new(CancellationToken::new()).unwrap();
        assert!(matches!(
            evaluator.connect_websocket("ws://example.com/devtools", UPGRADE_TIMEOUT).await,
            Err(BridgeError::Retryable(message)) if message.contains("not local")
        ));

        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            let _ = read_http_headers(&mut socket).await;
            socket
                .write_all(b"HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n")
                .await
                .unwrap();
        });
        let error = evaluator
            .connect_websocket(
                &format!("ws://{address}/devtools/page/fixture"),
                UPGRADE_TIMEOUT,
            )
            .await
            .unwrap_err();
        assert!(matches!(error, BridgeError::Retryable(_)));
    }

    #[tokio::test]
    async fn websocket_upgrade_header_limit_and_deadline_are_enforced() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            let _ = read_http_headers(&mut socket).await;
            let oversized = format!(
                "HTTP/1.1 101 Switching Protocols\r\nX-Large: {}\r\n\r\n",
                "x".repeat(MAX_UPGRADE_HEADER_BYTES)
            );
            let _ = socket.write_all(oversized.as_bytes()).await;
        });
        let evaluator = BigPictureEvaluator::new(CancellationToken::new()).unwrap();
        let too_large = evaluator
            .connect_websocket(
                &format!("ws://{address}/devtools/page/fixture"),
                UPGRADE_TIMEOUT,
            )
            .await
            .unwrap_err();
        assert!(matches!(too_large, BridgeError::Failure(_)));

        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            let _ = read_http_headers(&mut socket).await;
            tokio::time::sleep(Duration::from_millis(200)).await;
        });
        let timeout = evaluator
            .connect_websocket(
                &format!("ws://{address}/devtools/page/fixture"),
                Duration::from_millis(40),
            )
            .await
            .unwrap_err();
        assert!(
            matches!(timeout, BridgeError::Retryable(message) if message.contains("upgrade header timed out"))
        );
    }

    #[tokio::test]
    async fn websocket_response_limit_timeout_and_cancellation_are_bounded() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        tokio::spawn(async move {
            let (stream, _) = listener.accept().await.unwrap();
            let mut websocket = tokio_tungstenite::accept_async(stream).await.unwrap();
            let _ = read_command(&mut websocket).await;
            tokio::time::sleep(Duration::from_millis(200)).await;
        });
        let evaluator = BigPictureEvaluator::new(CancellationToken::new()).unwrap();
        let target = target_for(&format!("ws://{address}/devtools/page/fixture"));
        let mut session = evaluator
            .open_session(&target, UPGRADE_TIMEOUT)
            .await
            .unwrap();
        let timeout = session
            .request("1+1", Duration::from_millis(40))
            .await
            .unwrap_err();
        assert!(
            matches!(timeout, BridgeError::Retryable(message) if message.contains("read timed out"))
        );

        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        tokio::spawn(async move {
            let (stream, _) = listener.accept().await.unwrap();
            let mut websocket = tokio_tungstenite::accept_async_with_config(
                stream,
                Some({
                    let mut config = WebSocketConfig::default();
                    config.max_message_size = Some(MAX_RESPONSE_BYTES + 1024);
                    config.max_frame_size = Some(MAX_RESPONSE_BYTES + 1024);
                    config
                }),
            )
            .await
            .unwrap();
            let command = read_command(&mut websocket).await;
            let large = "x".repeat(MAX_RESPONSE_BYTES + 1);
            let response = Message::text(
                json!({"id":command["id"],"result":large}).to_string(),
            );
            let _ = websocket.send(response).await;
        });
        let target = target_for(&format!("ws://{address}/devtools/page/fixture"));
        let mut session = evaluator
            .open_session(&target, UPGRADE_TIMEOUT)
            .await
            .unwrap();
        let oversized = session
            .request("1+1", RESPONSE_TIMEOUT)
            .await
            .unwrap_err();
        assert!(matches!(oversized, BridgeError::Failure(_)));

        let cancel = CancellationToken::new();
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let (connected_tx, connected_rx) = oneshot::channel();
        let (closed_tx, closed_rx) = oneshot::channel();
        tokio::spawn(async move {
            let (stream, _) = listener.accept().await.unwrap();
            let mut websocket = tokio_tungstenite::accept_async(stream).await.unwrap();
            let _ = read_command(&mut websocket).await;
            let _ = connected_tx.send(());
            let disconnected = websocket
                .next()
                .await
                .map_or(true, |message| message.is_err());
            let _ = closed_tx.send(disconnected);
        });
        let discovery = fake_discovery(format!("ws://{address}/devtools/page/fixture")).await;
        let evaluator =
            BigPictureEvaluator::with_discovery_url(cancel.clone(), discovery.url.clone()).unwrap();
        let evaluator_task = tokio::spawn(async move { evaluator.evaluate("1+1").await });
        connected_rx.await.unwrap();
        cancel.cancel();
        assert!(matches!(
            evaluator_task.await.unwrap(),
            Err(BridgeError::Cancelled)
        ));
        assert!(closed_rx.await.unwrap());
    }

    #[tokio::test]
    async fn session_is_reused_across_calls_with_incrementing_ids() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let accepts = Arc::new(AtomicUsize::new(0));
        let ids = Arc::new(Mutex::new(Vec::new()));
        let server_accepts = Arc::clone(&accepts);
        let server_ids = Arc::clone(&ids);
        tokio::spawn(async move {
            loop {
                let Ok((stream, _)) = listener.accept().await else {
                    return;
                };
                server_accepts.fetch_add(1, Ordering::SeqCst);
                let ids = Arc::clone(&server_ids);
                tokio::spawn(async move {
                    let mut websocket = tokio_tungstenite::accept_async(stream).await.unwrap();
                    while let Some(Ok(Message::Text(text))) = websocket.next().await {
                        let command: Value = serde_json::from_str(text.as_str()).unwrap();
                        let id = command["id"].as_u64().unwrap();
                        ids.lock().unwrap().push(id);
                        websocket.send(Message::text(reply_for(id))).await.unwrap();
                    }
                });
            }
        });
        let discovery = fake_discovery(format!("ws://{address}/devtools/page/fixture")).await;
        let evaluator =
            BigPictureEvaluator::with_discovery_url(CancellationToken::new(), discovery.url.clone())
                .unwrap();
        for _ in 0..3 {
            let result = evaluator.eval_in_big_picture(&json!("1+1")).await;
            assert_eq!(result["status"], "playing");
            assert_eq!(result["tab"], "Steam Big Picture Mode");
        }
        assert_eq!(discovery.requests.load(Ordering::SeqCst), 1);
        assert_eq!(accepts.load(Ordering::SeqCst), 1);
        assert_eq!(*ids.lock().unwrap(), vec![1, 2, 3]);
    }

    #[tokio::test]
    async fn unrelated_messages_and_stale_ids_are_skipped() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        tokio::spawn(async move {
            let (stream, _) = listener.accept().await.unwrap();
            let mut websocket = tokio_tungstenite::accept_async(stream).await.unwrap();
            let command = read_command(&mut websocket).await;
            let id = command["id"].as_u64().unwrap();
            websocket
                .send(Message::text(
                    json!({"method":"Page.loadEventFired","params":{}}).to_string(),
                ))
                .await
                .unwrap();
            websocket
                .send(Message::text(
                    json!({"id":id + 100,"result":{"result":{"value":{"status":"wrong"}}}})
                        .to_string(),
                ))
                .await
                .unwrap();
            websocket
                .send(Message::text(reply_for(id)))
                .await
                .unwrap();
            let _ = websocket.next().await;
        });
        let discovery = fake_discovery(format!("ws://{address}/devtools/page/fixture")).await;
        let evaluator =
            BigPictureEvaluator::with_discovery_url(CancellationToken::new(), discovery.url.clone())
                .unwrap();
        let result = evaluator.eval_in_big_picture(&json!("1+1")).await;
        assert_eq!(result["status"], "playing");
        assert_eq!(result["appId"], 570);
    }

    #[tokio::test]
    async fn response_timeout_drops_session_without_resending() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let accepts = Arc::new(AtomicUsize::new(0));
        let first_commands = Arc::new(Mutex::new(Vec::new()));
        let second_commands = Arc::new(Mutex::new(Vec::new()));
        let (first_closed_tx, first_closed_rx) = oneshot::channel();
        let server_accepts = Arc::clone(&accepts);
        let server_first = Arc::clone(&first_commands);
        let server_second = Arc::clone(&second_commands);
        tokio::spawn(async move {
            let (stream, _) = listener.accept().await.unwrap();
            server_accepts.fetch_add(1, Ordering::SeqCst);
            let mut websocket = tokio_tungstenite::accept_async(stream).await.unwrap();
            let command = read_command(&mut websocket).await;
            server_first.lock().unwrap().push(command);
            while let Some(message) = websocket.next().await {
                match message {
                    Ok(Message::Text(text)) => server_first
                        .lock()
                        .unwrap()
                        .push(serde_json::from_str(text.as_str()).unwrap()),
                    Ok(_) => {}
                    Err(_) => break,
                }
            }
            // The timed-out session is gone, so a late reply cannot reach the evaluator.
            let _ = websocket.send(Message::text(reply_for(1))).await;
            let _ = first_closed_tx.send(());
            let (stream, _) = listener.accept().await.unwrap();
            server_accepts.fetch_add(1, Ordering::SeqCst);
            let mut websocket = tokio_tungstenite::accept_async(stream).await.unwrap();
            let command = read_command(&mut websocket).await;
            let id = command["id"].as_u64().unwrap();
            server_second.lock().unwrap().push(command);
            websocket.send(Message::text(reply_for(id))).await.unwrap();
            let _ = websocket.next().await;
        });
        let discovery = fake_discovery(format!("ws://{address}/devtools/page/fixture")).await;
        let mut evaluator =
            BigPictureEvaluator::with_discovery_url(CancellationToken::new(), discovery.url.clone())
                .unwrap();
        evaluator.response_timeout = Duration::from_millis(40);
        let error = evaluator.eval_in_big_picture(&json!("cleanup()")).await;
        assert_eq!(error["status"], "steam_ui_unavailable");
        assert_eq!(error["retryable"], true);
        assert!(error["error"].as_str().unwrap().contains("read timed out"));
        assert_eq!(discovery.requests.load(Ordering::SeqCst), 1);
        assert_eq!(accepts.load(Ordering::SeqCst), 1);
        first_closed_rx.await.unwrap();
        assert_eq!(first_commands.lock().unwrap().len(), 1);
        let result = evaluator.eval_in_big_picture(&json!("cleanup()")).await;
        assert_eq!(result["status"], "playing");
        assert_eq!(discovery.requests.load(Ordering::SeqCst), 2);
        assert_eq!(accepts.load(Ordering::SeqCst), 2);
        assert_eq!(second_commands.lock().unwrap().len(), 1);
        assert_eq!(second_commands.lock().unwrap()[0]["id"], 1);
    }

    #[tokio::test]
    async fn reply_lost_after_send_is_not_resent() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let accepts = Arc::new(AtomicUsize::new(0));
        let commands = Arc::new(Mutex::new(Vec::new()));
        let server_accepts = Arc::clone(&accepts);
        let server_commands = Arc::clone(&commands);
        tokio::spawn(async move {
            let (stream, _) = listener.accept().await.unwrap();
            server_accepts.fetch_add(1, Ordering::SeqCst);
            let mut websocket = tokio_tungstenite::accept_async(stream).await.unwrap();
            let command = read_command(&mut websocket).await;
            server_commands.lock().unwrap().push(command);
            let _ = websocket.close(None).await;
            drop(websocket);
            let (stream, _) = listener.accept().await.unwrap();
            server_accepts.fetch_add(1, Ordering::SeqCst);
            let mut websocket = tokio_tungstenite::accept_async(stream).await.unwrap();
            let command = read_command(&mut websocket).await;
            let id = command["id"].as_u64().unwrap();
            server_commands.lock().unwrap().push(command);
            websocket.send(Message::text(reply_for(id))).await.unwrap();
            let _ = websocket.next().await;
        });
        let discovery = fake_discovery(format!("ws://{address}/devtools/page/fixture")).await;
        let evaluator =
            BigPictureEvaluator::with_discovery_url(CancellationToken::new(), discovery.url.clone())
                .unwrap();
        let error = evaluator.eval_in_big_picture(&json!("install()")).await;
        assert_eq!(error["status"], "steam_ui_unavailable");
        assert_eq!(commands.lock().unwrap().len(), 1);
        assert_eq!(discovery.requests.load(Ordering::SeqCst), 1);
        assert_eq!(accepts.load(Ordering::SeqCst), 1);
        let result = evaluator.eval_in_big_picture(&json!("install()")).await;
        assert_eq!(result["status"], "playing");
        assert_eq!(commands.lock().unwrap().len(), 2);
        assert_eq!(discovery.requests.load(Ordering::SeqCst), 2);
        assert_eq!(accepts.load(Ordering::SeqCst), 2);
    }

    #[tokio::test]
    async fn dead_cached_session_is_replaced_before_sending() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let accepts = Arc::new(AtomicUsize::new(0));
        let first_commands = Arc::new(Mutex::new(Vec::new()));
        let second_commands = Arc::new(Mutex::new(Vec::new()));
        let (first_closed_tx, first_closed_rx) = oneshot::channel();
        let server_accepts = Arc::clone(&accepts);
        let server_first = Arc::clone(&first_commands);
        let server_second = Arc::clone(&second_commands);
        tokio::spawn(async move {
            let (stream, _) = listener.accept().await.unwrap();
            // Without nodelay, Nagle holds the Close frame behind the reply until the client's delayed ACK (~40 ms).
            stream.set_nodelay(true).unwrap();
            server_accepts.fetch_add(1, Ordering::SeqCst);
            let mut websocket = tokio_tungstenite::accept_async(stream).await.unwrap();
            let command = read_command(&mut websocket).await;
            let id = command["id"].as_u64().unwrap();
            server_first.lock().unwrap().push(command);
            websocket.send(Message::text(reply_for(id))).await.unwrap();
            websocket.send(Message::Close(None)).await.unwrap();
            let _ = first_closed_tx.send(());
            while let Some(message) = websocket.next().await {
                match message {
                    Ok(Message::Text(text)) => server_first
                        .lock()
                        .unwrap()
                        .push(serde_json::from_str(text.as_str()).unwrap()),
                    Ok(_) => {}
                    Err(_) => break,
                }
            }
            let (stream, _) = listener.accept().await.unwrap();
            server_accepts.fetch_add(1, Ordering::SeqCst);
            let mut websocket = tokio_tungstenite::accept_async(stream).await.unwrap();
            let command = read_command(&mut websocket).await;
            let id = command["id"].as_u64().unwrap();
            server_second.lock().unwrap().push(command);
            websocket.send(Message::text(reply_for(id))).await.unwrap();
            let _ = websocket.next().await;
        });
        let discovery = fake_discovery(format!("ws://{address}/devtools/page/fixture")).await;
        let evaluator =
            BigPictureEvaluator::with_discovery_url(CancellationToken::new(), discovery.url.clone())
                .unwrap();
        let result = evaluator.eval_in_big_picture(&json!("1+1")).await;
        assert_eq!(result["status"], "playing");
        first_closed_rx.await.unwrap();
        tokio::time::sleep(Duration::from_millis(100)).await;
        let result = evaluator.eval_in_big_picture(&json!("1+1")).await;
        assert_eq!(result["status"], "playing", "{result}");
        assert_eq!(discovery.requests.load(Ordering::SeqCst), 2);
        assert_eq!(accepts.load(Ordering::SeqCst), 2);
        assert_eq!(first_commands.lock().unwrap().len(), 1);
        assert_eq!(second_commands.lock().unwrap().len(), 1);
    }

    #[tokio::test]
    async fn close_sends_close_frame_for_cached_session() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let (closed_tx, closed_rx) = oneshot::channel();
        tokio::spawn(async move {
            let (stream, _) = listener.accept().await.unwrap();
            let mut websocket = tokio_tungstenite::accept_async(stream).await.unwrap();
            let command = read_command(&mut websocket).await;
            let id = command["id"].as_u64().unwrap();
            websocket.send(Message::text(reply_for(id))).await.unwrap();
            let closed = matches!(
                websocket.next().await,
                Some(Ok(Message::Close(_))) | None | Some(Err(_))
            );
            let _ = closed_tx.send(closed);
        });
        let discovery = fake_discovery(format!("ws://{address}/devtools/page/fixture")).await;
        let evaluator =
            BigPictureEvaluator::with_discovery_url(CancellationToken::new(), discovery.url.clone())
                .unwrap();
        let result = evaluator.eval_in_big_picture(&json!("1+1")).await;
        assert_eq!(result["status"], "playing");
        evaluator.close().await;
        assert!(closed_rx.await.unwrap());
    }

    #[tokio::test]
    async fn input_errors_runtime_exceptions_and_warning_throttle_preserve_envelopes() {
        let evaluator = BigPictureEvaluator::new(CancellationToken::new()).unwrap();
        assert_eq!(
            evaluator.eval_in_big_picture(&Value::Null).await,
            json!({"status":"steam_ui_unavailable","error":"Evaluation script is invalid or too large"})
        );
        assert_eq!(
            evaluator
                .eval_in_big_picture(&json!("x".repeat(MAX_EVALUATION_BYTES + 1)))
                .await["error"],
            "Evaluation script is invalid or too large"
        );
        assert_eq!(
            evaluator
                .eval_in_big_picture(&json!("€".repeat(MAX_EVALUATION_BYTES / 3 + 1)))
                .await["error"],
            "Evaluation script is invalid or too large"
        );
        assert_eq!(
            evaluation_result(
                &json!({"title":"Big Picture"}),
                json!({"result":{"exceptionDetails":{"exception":{"description":"TypeError: failed"}}}})
            )
            .unwrap(),
            json!({"status":"Steam script error","error":"TypeError: failed"})
        );
        assert_eq!(
            evaluation_result(
                &json!({"title":"Big Picture"}),
                json!({"result":{"result":{"value":null}}})
            )
            .unwrap(),
            json!({"status":"Unexpected Steam response","error":"Runtime.evaluate returned no object value","tab":"Big Picture"})
        );
        let now = Instant::now();
        assert!(evaluator.claim_debugger_warning(now));
        assert!(!evaluator.claim_debugger_warning(now + Duration::from_secs(29)));
        assert!(evaluator.claim_debugger_warning(now + WARNING_INTERVAL));
        assert_eq!(
            BigPictureEvaluator::error_envelope(&BridgeError::Retryable("socket dropped".into())),
            json!({"status":"steam_ui_unavailable","error":"socket dropped","retryable":true})
        );
        assert_eq!(
            BigPictureEvaluator::error_envelope(&BridgeError::Failure("malformed response".into())),
            json!({"status":"steam_ui_unavailable","error":"malformed response"})
        );
        assert_eq!(
            BigPictureEvaluator::error_envelope(&BridgeError::Cancelled),
            json!({"status":"steam_ui_unavailable","error":"Plugin is unloading","runtimeMissing":true})
        );

        let cancel = CancellationToken::new();
        cancel.cancel();
        let evaluator = BigPictureEvaluator::new(cancel).unwrap();
        assert_eq!(
            evaluator.eval_in_big_picture(&json!("true")).await,
            json!({"status":"steam_ui_unavailable","error":"Plugin is unloading","runtimeMissing":true})
        );
    }
}
