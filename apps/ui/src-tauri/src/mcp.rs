use rmcp::{
    handler::server::{router::tool::ToolRouter, wrapper::Parameters},
    model::{CallToolResult, Content, ServerCapabilities, ServerInfo},
    schemars, tool, tool_handler, tool_router,
    transport::streamable_http_server::{
        session::local::LocalSessionManager, StreamableHttpServerConfig, StreamableHttpService,
    },
    ErrorData as McpError, ServerHandler,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::sync::{mpsc, Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, State, Window};
use uuid::Uuid;

use crate::create_new_window_with_launch_intent;

const MCP_DEFAULT_PORT: u16 = 32123;

// ── Public status types ──────────────────────────────────────────────────────

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum McpServerStateKind {
    Starting,
    Running,
    Disabled,
    PortConflict,
    Error,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerStatus {
    enabled: bool,
    port: u16,
    status: McpServerStateKind,
    endpoint: Option<String>,
    message: Option<String>,
    /// Per-boot bearer secret an MCP client must send as
    /// `Authorization: Bearer <token>`. Only populated while the server is
    /// actually running, so a disabled server never hands out a live secret.
    session_token: Option<String>,
}

// ── IPC payloads ─────────────────────────────────────────────────────────────

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct FrontendToolRequest {
    request_id: String,
    tool_name: String,
    arguments: Value,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum McpContentItem {
    Text {
        text: String,
    },
    #[serde(rename_all = "camelCase")]
    Image {
        data: String,
        mime_type: String,
    },
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpToolResponse {
    pub content: Vec<McpContentItem>,
    #[serde(default, skip_serializing_if = "is_false")]
    pub is_error: bool,
}

// ── Workspace / session types ─────────────────────────────────────────────────

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceDescriptor {
    pub window_id: String,
    pub title: String,
    pub workspace_root: Option<String>,
    pub render_target_path: Option<String>,
    pub is_focused: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RegisteredWindowMode {
    Welcome,
    Opening,
    Ready,
    OpenFailed,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum WindowLaunchIntent {
    Welcome,
    OpenFolder {
        request_id: String,
        folder_path: String,
        create_if_empty: bool,
    },
    OpenFile {
        request_id: String,
        file_path: String,
    },
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum WindowOpenRequest {
    OpenFolder {
        folder_path: String,
        create_if_empty: bool,
    },
    OpenFile {
        file_path: String,
    },
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct WindowOpenRequestPayload {
    request_id: String,
    request: WindowOpenRequest,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowContextPayload {
    pub title: Option<String>,
    pub workspace_root: Option<String>,
    pub render_target_path: Option<String>,
    pub mode: Option<RegisteredWindowMode>,
    pub pending_request_id: Option<String>,
    #[serde(default)]
    pub show_welcome: bool,
    #[serde(default = "default_true")]
    pub ready: bool,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowStartupPhasePayload {
    pub phase: String,
    pub detail: Option<String>,
}

#[derive(Clone, Debug)]
struct RegisteredWorkspace {
    descriptor: WorkspaceDescriptor,
    show_welcome: bool,
    mode: RegisteredWindowMode,
    pending_request_id: Option<String>,
    startup_phase: String,
    startup_detail: Option<String>,
    context_ready: bool,
    bridge_ready: bool,
    last_focused_order: u64,
}

#[derive(Clone, Debug)]
struct WindowOpenResult {
    message: String,
    opened_workspace_root: Option<String>,
}

struct PendingWindowOpenRequest {
    window_id: String,
    sender: mpsc::Sender<Result<WindowOpenResult, String>>,
}

#[derive(Clone, Debug, Default)]
struct McpSessionBinding {
    bound_window_id: Option<String>,
}

fn default_true() -> bool {
    true
}

fn is_false(value: &bool) -> bool {
    !*value
}

// ── Running server handle ─────────────────────────────────────────────────────

struct RunningServerHandle {
    cancellation_token: tokio_util::sync::CancellationToken,
    join_handle: tokio::task::JoinHandle<()>,
}

// ── Shared state ──────────────────────────────────────────────────────────────

struct McpStateInner {
    running_server: Option<RunningServerHandle>,
    pending: HashMap<String, mpsc::Sender<McpToolResponse>>,
    window_open_requests: HashMap<String, PendingWindowOpenRequest>,
    status: McpServerStatus,
    workspaces: HashMap<String, RegisteredWorkspace>,
    sessions: HashMap<String, McpSessionBinding>,
    next_focus_order: u64,
}

#[derive(Clone)]
pub struct McpServerState {
    inner: Arc<Mutex<McpStateInner>>,
    /// Generated once per app boot and reused across enable/disable toggles, so
    /// a user who has already configured their MCP client does not have to
    /// re-copy the secret every time the server is turned off and on again.
    session_token: Arc<str>,
}

impl Default for McpServerState {
    fn default() -> Self {
        Self {
            inner: Arc::new(Mutex::new(McpStateInner {
                running_server: None,
                pending: HashMap::new(),
                window_open_requests: HashMap::new(),
                status: McpServerStatus {
                    enabled: true,
                    port: MCP_DEFAULT_PORT,
                    status: McpServerStateKind::Disabled,
                    endpoint: None,
                    message: None,
                    session_token: None,
                },
                workspaces: HashMap::new(),
                sessions: HashMap::new(),
                next_focus_order: 0,
            })),
            session_token: generate_session_token(),
        }
    }
}

// ── Utility functions ─────────────────────────────────────────────────────────

fn endpoint_for_port(port: u16) -> String {
    format!("http://127.0.0.1:{port}/mcp")
}

fn build_status(
    enabled: bool,
    port: u16,
    status: McpServerStateKind,
    message: Option<String>,
) -> McpServerStatus {
    McpServerStatus {
        enabled,
        port,
        endpoint: if enabled {
            Some(endpoint_for_port(port))
        } else {
            None
        },
        status,
        message,
        session_token: None,
    }
}

// ── MCP listener security (MCP-1) ─────────────────────────────────────────────

/// Origins the TinkerQuarry desktop shell itself can present: the Tauri custom
/// protocol on each platform, plus the Vite dev server.
///
/// The list being NON-EMPTY is the whole point — rmcp short-circuits
/// `validate_origin_header` to a no-op while `allowed_origins` is empty
/// (rmcp-1.8.0 `streamable_http_server/tower.rs:428-434`), and its default is
/// empty. Filling it in arms rmcp's own RFC 6454 `(scheme, host, port)` match.
const MCP_ALLOWED_ORIGINS: [&str; 4] = [
    "tauri://localhost",
    "http://tauri.localhost",
    "https://tauri.localhost",
    "http://localhost:1420",
];

/// Server config shared by the running listener and the security probes in
/// `mod tests`, so a probe can never drift away from what actually ships.
///
/// Origin allow-listing lives HERE, not in an axum layer, and specifically not
/// in a `tower_http::cors::CorsLayer`. See `finish_mcp_router` for why that
/// distinction is load-bearing.
///
/// Requests with no `Origin` header still pass — that is rmcp's documented
/// behaviour and it is what keeps native, non-browser MCP clients working. Those
/// callers are gated by the bearer token in `finish_mcp_router` instead.
fn build_mcp_config(
    cancellation_token: tokio_util::sync::CancellationToken,
) -> StreamableHttpServerConfig {
    StreamableHttpServerConfig::default()
        .with_allowed_origins(MCP_ALLOWED_ORIGINS)
        .with_cancellation_token(cancellation_token)
}

/// TinkerQuarry's own application-layer guards, wrapped around the `/mcp` route.
///
/// Shared by the running listener and by `mod tests` so a probe always exercises
/// the shipping stack.
///
/// # Never add a CORS layer here
///
/// This listener answers no preflight. `OPTIONS /mcp` falls through to rmcp's
/// `_ =>` arm and returns 405 with no `Access-Control-Allow-Origin`, so a
/// browser aborts a cross-origin request before it is ever sent — that refusal
/// is the only thing standing between a hostile web page and `export_file`.
/// Adding `tower_http::cors::CorsLayer` (the idiomatic axum way to "allow-list
/// origins", and very tempting the first time someone debugs a browser-based
/// MCP client) makes the server answer preflights with
/// `Access-Control-Allow-Origin`, which OPENS that drive-by rather than closing
/// it. Origin allow-listing belongs in `build_mcp_config`, which validates
/// without emitting any CORS response header.
/// `mcp_preflight_never_grants_a_browser_cross_origin_access` guards this.
fn finish_mcp_router(router: axum::Router, session_token: Arc<str>) -> axum::Router {
    router.layer(axum::middleware::from_fn_with_state(
        session_token,
        require_mcp_session_token,
    ))
}

/// Outcome of checking an inbound `Authorization` header against the per-boot
/// secret.
#[derive(Debug, Clone, PartialEq, Eq)]
enum McpAuth {
    Ok,
    Missing,
    Mismatch,
}

/// Length-independent comparison, so a caller cannot recover the secret one byte
/// at a time by timing responses.
fn secret_eq(presented: &str, expected: &str) -> bool {
    let (presented, expected) = (presented.as_bytes(), expected.as_bytes());
    if presented.len() != expected.len() {
        return false;
    }
    let mut difference = 0_u8;
    for (a, b) in presented.iter().zip(expected) {
        difference |= a ^ b;
    }
    difference == 0
}

fn classify_mcp_auth(authorization: Option<&str>, expected: &str) -> McpAuth {
    let Some(header) = authorization.map(str::trim) else {
        return McpAuth::Missing;
    };
    let Some((scheme, presented)) = header.split_once(' ') else {
        return McpAuth::Missing;
    };
    if !scheme.eq_ignore_ascii_case("bearer") {
        return McpAuth::Missing;
    }
    // An empty credential is never a match, even against an empty expectation —
    // otherwise a bug that blanked the secret would silently disable auth.
    if presented.trim().is_empty() {
        return McpAuth::Missing;
    }
    if secret_eq(presented.trim(), expected) {
        McpAuth::Ok
    } else {
        McpAuth::Mismatch
    }
}

/// Rejects every request that does not carry this boot's bearer secret.
///
/// Origin validation cannot cover this case: a non-browser caller — a script, or
/// any other program running as the user — simply omits the header. Without a
/// shared secret, anything on the machine could drive `export_file` and
/// `get_or_create_workspace`. This mirrors the engine's own per-boot bearer
/// token (`packages/engine/src/kimcad/webapp.py:1500-1521`).
async fn require_mcp_session_token(
    axum::extract::State(expected): axum::extract::State<Arc<str>>,
    request: axum::extract::Request,
    next: axum::middleware::Next,
) -> axum::response::Response {
    let presented = request
        .headers()
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok());

    match classify_mcp_auth(presented, &expected) {
        McpAuth::Ok => next.run(request).await,
        McpAuth::Missing => unauthorized_response(
            "Unauthorized: send this TinkerQuarry session's token as `Authorization: Bearer <token>`. Find it in Settings under External agents.",
        ),
        McpAuth::Mismatch => unauthorized_response(
            "Unauthorized: that token does not match this TinkerQuarry session. The token is regenerated every time TinkerQuarry starts.",
        ),
    }
}

/// A bare 401. Deliberately carries no `Access-Control-*` header of any kind.
fn unauthorized_response(message: &'static str) -> axum::response::Response {
    use axum::response::IntoResponse;

    (
        axum::http::StatusCode::UNAUTHORIZED,
        [
            (
                axum::http::header::WWW_AUTHENTICATE,
                "Bearer realm=\"TinkerQuarry MCP\"",
            ),
            (
                axum::http::header::CONTENT_TYPE,
                "text/plain; charset=utf-8",
            ),
        ],
        message,
    )
        .into_response()
}

/// Per-boot bearer secret for the MCP listener, mirroring the engine's
/// `TINKERQUARRY_DEV_TOKEN` (`webapp.py:1500-1521`). Two v4 UUIDs = 256 bits of
/// `getrandom` entropy, so no new dependency is needed.
fn generate_session_token() -> Arc<str> {
    Arc::from(format!(
        "{}{}",
        Uuid::new_v4().simple(),
        Uuid::new_v4().simple()
    ))
}

fn text_tool_response(message: impl Into<String>, is_error: bool) -> McpToolResponse {
    McpToolResponse {
        content: vec![McpContentItem::Text {
            text: message.into(),
        }],
        is_error,
    }
}

fn normalize_workspace_root(path: &str) -> Option<String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return None;
    }

    fs::canonicalize(trimmed)
        .ok()
        .and_then(|resolved| resolved.into_os_string().into_string().ok())
}

fn remove_pending(
    inner: &Arc<Mutex<McpStateInner>>,
    request_id: &str,
) -> Option<mpsc::Sender<McpToolResponse>> {
    inner.lock().unwrap().pending.remove(request_id)
}

fn ordered_registered_workspaces(inner: &McpStateInner) -> Vec<(&String, &RegisteredWorkspace)> {
    let mut workspaces: Vec<_> = inner.workspaces.iter().collect();
    workspaces.sort_by(|a, b| {
        b.1.descriptor
            .is_focused
            .cmp(&a.1.descriptor.is_focused)
            .then_with(|| b.1.last_focused_order.cmp(&a.1.last_focused_order))
            .then_with(|| a.1.descriptor.title.cmp(&b.1.descriptor.title))
            .then_with(|| a.0.cmp(b.0))
    });
    workspaces
}

fn choose_existing_workspace_for_root(
    inner: &McpStateInner,
    normalized_root: &str,
) -> Option<String> {
    ordered_registered_workspaces(inner)
        .into_iter()
        .find(|(_, workspace)| {
            workspace.context_ready
                && workspace.mode == RegisteredWindowMode::Ready
                && workspace.descriptor.workspace_root.as_deref() == Some(normalized_root)
        })
        .map(|(window_id, _)| window_id.clone())
}

fn choose_blank_welcome_window(inner: &McpStateInner) -> Option<String> {
    ordered_registered_workspaces(inner)
        .into_iter()
        .find(|(_, workspace)| {
            workspace.context_ready
                && workspace.bridge_ready
                && workspace.show_welcome
                && workspace.mode == RegisteredWindowMode::Welcome
                && workspace.pending_request_id.is_none()
                && workspace.descriptor.workspace_root.is_none()
        })
        .map(|(window_id, _)| window_id.clone())
}

fn describe_workspace_startup_phase(workspace: &RegisteredWorkspace) -> String {
    match &workspace.startup_detail {
        Some(detail) if !detail.trim().is_empty() => {
            format!("last startup phase: {} ({detail})", workspace.startup_phase)
        }
        _ => format!("last startup phase: {}", workspace.startup_phase),
    }
}

fn bind_session_to_window(inner: &mut McpStateInner, session_id: &str, window_id: String) {
    inner
        .sessions
        .entry(session_id.to_string())
        .or_default()
        .bound_window_id = Some(window_id);
}

fn wait_for_window_tool_ready(
    inner: &Arc<Mutex<McpStateInner>>,
    window_id: &str,
    timeout: Duration,
) -> Result<(), String> {
    let deadline = Instant::now() + timeout;

    loop {
        if inner
            .lock()
            .unwrap()
            .workspaces
            .get(window_id)
            .map(|workspace| workspace.context_ready && workspace.bridge_ready)
            .unwrap_or(false)
        {
            return Ok(());
        }

        if Instant::now() >= deadline {
            let phase = inner
                .lock()
                .unwrap()
                .workspaces
                .get(window_id)
                .map(describe_workspace_startup_phase)
                .unwrap_or_else(|| "last startup phase: unknown".into());
            return Err(format!(
                "Timed out waiting for TinkerQuarry window `{window_id}` to finish starting its MCP bridge ({phase})."
            ));
        }

        std::thread::sleep(Duration::from_millis(50));
    }
}

fn remove_window_and_invalidate_sessions_locked(inner: &mut McpStateInner, window_id: &str) {
    inner.workspaces.remove(window_id);
    let pending_request_ids = inner
        .window_open_requests
        .iter()
        .filter_map(|(request_id, pending)| {
            (pending.window_id == window_id).then_some(request_id.clone())
        })
        .collect::<Vec<_>>();
    for request_id in pending_request_ids {
        if let Some(pending) = inner.window_open_requests.remove(&request_id) {
            let _ = pending.sender.send(Err(format!(
                "TinkerQuarry window `{window_id}` closed before it finished opening the requested target."
            )));
        }
    }
    for session in inner.sessions.values_mut() {
        if session.bound_window_id.as_deref() == Some(window_id) {
            session.bound_window_id = None;
        }
    }
}

fn require_bound_window_id(
    inner: &mut McpStateInner,
    session_id: &str,
) -> Result<String, McpToolResponse> {
    let Some(session) = inner.sessions.get_mut(session_id) else {
        return Err(text_tool_response(
            "This MCP session is not initialized. Reconnect your client and call `get_or_create_workspace(folder_path)` before using Studio tools.",
            true,
        ));
    };

    let Some(window_id) = session.bound_window_id.clone() else {
        return Err(text_tool_response(
            "No TinkerQuarry workspace is selected for this MCP session. Call `get_or_create_workspace(folder_path)` first.",
            true,
        ));
    };

    match inner.workspaces.get(&window_id) {
        Some(workspace) if workspace.context_ready => Ok(window_id),
        Some(_) => Err(text_tool_response(
            format!(
                "The selected Studio window `{window_id}` is not ready for MCP requests yet. Wait a moment and try again."
            ),
            true,
        )),
        None => {
            session.bound_window_id = None;
            Err(text_tool_response(
                format!(
                    "The previously selected Studio window `{window_id}` is no longer available. Call `get_or_create_workspace(folder_path)` again."
                ),
                true,
            ))
        }
    }
}

fn call_frontend_tool(
    app: &AppHandle,
    inner: &Arc<Mutex<McpStateInner>>,
    window_id: &str,
    tool_name: &str,
    arguments: Value,
) -> Result<McpToolResponse, String> {
    wait_for_window_tool_ready(inner, window_id, Duration::from_secs(5))?;

    let request_id = Uuid::new_v4().to_string();
    let (tx, rx) = mpsc::channel();

    inner.lock().unwrap().pending.insert(request_id.clone(), tx);

    let payload = FrontendToolRequest {
        request_id: request_id.clone(),
        tool_name: tool_name.to_string(),
        arguments,
    };

    let Some(window) = app.get_webview_window(window_id) else {
        remove_pending(inner, &request_id);
        return Err(format!(
            "TinkerQuarry window `{window_id}` is no longer available."
        ));
    };

    if let Err(error) = window.emit("mcp:tool-request", payload) {
        remove_pending(inner, &request_id);
        return Err(format!(
            "Failed to dispatch MCP tool request to TinkerQuarry window `{window_id}`: {error}"
        ));
    }

    match rx.recv_timeout(Duration::from_secs(30)) {
        Ok(response) => Ok(response),
        Err(mpsc::RecvTimeoutError::Timeout) => {
            remove_pending(inner, &request_id);
            Err("Timed out waiting for TinkerQuarry to complete the MCP tool request.".into())
        }
        Err(mpsc::RecvTimeoutError::Disconnected) => {
            remove_pending(inner, &request_id);
            Err("TinkerQuarry could not deliver the MCP tool response.".into())
        }
    }
}

fn create_window_open_request(
    inner: &Arc<Mutex<McpStateInner>>,
    window_id: &str,
) -> (String, mpsc::Receiver<Result<WindowOpenResult, String>>) {
    let request_id = Uuid::new_v4().to_string();
    let (tx, rx) = mpsc::channel();
    inner.lock().unwrap().window_open_requests.insert(
        request_id.clone(),
        PendingWindowOpenRequest {
            window_id: window_id.to_string(),
            sender: tx,
        },
    );
    (request_id, rx)
}

fn wait_for_window_open_result(
    inner: &Arc<Mutex<McpStateInner>>,
    request_id: &str,
    rx: mpsc::Receiver<Result<WindowOpenResult, String>>,
    window_id: &str,
    target_description: &str,
    timeout: Duration,
) -> Result<WindowOpenResult, String> {
    match rx.recv_timeout(timeout) {
        Ok(result) => result,
        Err(mpsc::RecvTimeoutError::Timeout) => {
            let phase = {
                let mut locked = inner.lock().unwrap();
                locked.window_open_requests.remove(request_id);
                locked
                    .workspaces
                    .get(window_id)
                    .map(describe_workspace_startup_phase)
                    .unwrap_or_else(|| "last startup phase: unknown".into())
            };
            Err(format!(
                "Timed out waiting for TinkerQuarry to open `{target_description}` in window `{window_id}` ({phase})."
            ))
        }
        Err(mpsc::RecvTimeoutError::Disconnected) => {
            inner
                .lock()
                .unwrap()
                .window_open_requests
                .remove(request_id);
            Err(format!(
                "TinkerQuarry lost the result channel while opening `{target_description}` in window `{window_id}`."
            ))
        }
    }
}

fn dispatch_window_open_request(
    app: &AppHandle,
    inner: &Arc<Mutex<McpStateInner>>,
    window_id: &str,
    request: WindowOpenRequest,
) -> Result<WindowOpenResult, String> {
    wait_for_window_tool_ready(inner, window_id, Duration::from_secs(5))?;

    let target_description = match &request {
        WindowOpenRequest::OpenFolder { folder_path, .. } => folder_path.clone(),
        WindowOpenRequest::OpenFile { file_path } => file_path.clone(),
    };
    let (request_id, rx) = create_window_open_request(inner, window_id);

    let payload = WindowOpenRequestPayload {
        request_id: request_id.clone(),
        request,
    };

    {
        let mut locked = inner.lock().unwrap();
        if let Some(workspace) = locked.workspaces.get_mut(window_id) {
            workspace.mode = RegisteredWindowMode::Opening;
            workspace.pending_request_id = Some(request_id.clone());
            workspace.show_welcome = false;
        }
    }

    let Some(window) = app.get_webview_window(window_id) else {
        inner
            .lock()
            .unwrap()
            .window_open_requests
            .remove(&request_id);
        return Err(format!(
            "TinkerQuarry window `{window_id}` is no longer available."
        ));
    };

    if let Err(error) = window.emit("desktop:open-request", payload) {
        let mut locked = inner.lock().unwrap();
        locked.window_open_requests.remove(&request_id);
        if let Some(workspace) = locked.workspaces.get_mut(window_id) {
            workspace.mode = RegisteredWindowMode::Welcome;
            workspace.pending_request_id = None;
            workspace.show_welcome = true;
        }
        return Err(format!(
            "Failed to dispatch desktop open request to TinkerQuarry window `{window_id}`: {error}"
        ));
    }

    wait_for_window_open_result(
        inner,
        &request_id,
        rx,
        window_id,
        &target_description,
        Duration::from_secs(120),
    )
}

fn get_or_create_workspace_response(
    app: &AppHandle,
    inner: &Arc<Mutex<McpStateInner>>,
    session_id: &str,
    arguments: &Value,
) -> McpToolResponse {
    let folder_path = arguments
        .get("folder_path")
        .or_else(|| arguments.get("workspace_root"))
        .or_else(|| arguments.get("path"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty());

    let Some(folder_path) = folder_path else {
        return text_tool_response(
            "get_or_create_workspace requires a `folder_path` argument.",
            true,
        );
    };

    let Some(normalized_root) = normalize_workspace_root(folder_path) else {
        return text_tool_response(
            format!("Could not resolve workspace folder `{folder_path}`."),
            true,
        );
    };

    let existing_window_id = {
        let mut locked = inner.lock().unwrap();
        locked.sessions.entry(session_id.to_string()).or_default();
        choose_existing_workspace_for_root(&locked, &normalized_root)
    };

    if let Some(window_id) = existing_window_id {
        let response = {
            let mut locked = inner.lock().unwrap();
            bind_session_to_window(&mut locked, session_id, window_id.clone());
            let workspace = locked
                .workspaces
                .get(&window_id)
                .map(|entry| entry.descriptor.clone());
            if let Some(workspace) = workspace {
                let render_target = workspace
                    .render_target_path
                    .unwrap_or_else(|| "(no render target)".into());
                text_tool_response(
                    format!(
                        "✅ Attached this MCP session to the already-open TinkerQuarry workspace at {}.\n\nWindow: {}\nRender target: {}",
                        normalized_root, workspace.window_id, render_target
                    ),
                    false,
                )
            } else {
                text_tool_response(
                    format!(
                        "TinkerQuarry window `{window_id}` was no longer available while attaching the workspace."
                    ),
                    true,
                )
            }
        };

        return response;
    }

    let target_window_id = {
        let locked = inner.lock().unwrap();
        choose_blank_welcome_window(&locked)
    };

    let (target_window_id, detail) = if let Some(window_id) = target_window_id {
        match dispatch_window_open_request(
            app,
            inner,
            &window_id,
            WindowOpenRequest::OpenFolder {
                folder_path: normalized_root.clone(),
                create_if_empty: true,
            },
        ) {
            Ok(result) => {
                let opened_root = result
                    .opened_workspace_root
                    .as_deref()
                    .and_then(normalize_workspace_root);
                if opened_root.as_deref() != Some(normalized_root.as_str()) {
                    return text_tool_response(
                        format!(
                            "TinkerQuarry opened the wrong workspace in window `{window_id}`. Expected `{normalized_root}`, got `{}`.",
                            opened_root.unwrap_or_else(|| "(unknown workspace)".into())
                        ),
                        true,
                    );
                }
                (window_id, result.message)
            }
            Err(message) => return text_tool_response(message, true),
        }
    } else {
        let (request_id, rx) = create_window_open_request(inner, "pending-new-window");
        let window_id = match create_new_window_with_launch_intent(
            app,
            WindowLaunchIntent::OpenFolder {
                request_id: request_id.clone(),
                folder_path: normalized_root.clone(),
                create_if_empty: true,
            },
        ) {
            Ok(id) => {
                let mut locked = inner.lock().unwrap();
                if let Some(pending) = locked.window_open_requests.get_mut(&request_id) {
                    pending.window_id = id.clone();
                }
                id
            }
            Err(error) => {
                inner
                    .lock()
                    .unwrap()
                    .window_open_requests
                    .remove(&request_id);
                return text_tool_response(
                    format!("Failed to create a new TinkerQuarry window: {error}"),
                    true,
                );
            }
        };

        let result = match wait_for_window_open_result(
            inner,
            &request_id,
            rx,
            &window_id,
            &normalized_root,
            Duration::from_secs(120),
        ) {
            Ok(result) => result,
            Err(message) => return text_tool_response(message, true),
        };
        let opened_root = result
            .opened_workspace_root
            .as_deref()
            .and_then(normalize_workspace_root);
        if opened_root.as_deref() != Some(normalized_root.as_str()) {
            return text_tool_response(
                format!(
                    "TinkerQuarry opened the wrong workspace in window `{window_id}`. Expected `{normalized_root}`, got `{}`.",
                    opened_root.unwrap_or_else(|| "(unknown workspace)".into())
                ),
                true,
            );
        }
        (window_id, result.message)
    };

    let mut locked = inner.lock().unwrap();
    bind_session_to_window(&mut locked, session_id, target_window_id.clone());

    text_tool_response(
        format!(
            "{detail}\n\n✅ Bound this MCP session to TinkerQuarry window `{target_window_id}`."
        ),
        false,
    )
}

fn get_project_context_response(
    inner: &Arc<Mutex<McpStateInner>>,
    session_id: &str,
) -> McpToolResponse {
    let mut locked = inner.lock().unwrap();
    let window_id = match require_bound_window_id(&mut locked, session_id) {
        Ok(window_id) => window_id,
        Err(response) => return response,
    };

    let Some(workspace) = locked.workspaces.get(&window_id) else {
        return text_tool_response(
            format!(
                "The previously selected Studio window `{window_id}` is no longer available. Call `get_or_create_workspace(folder_path)` again."
            ),
            true,
        );
    };

    let mut parts = vec![format!("Studio window: {}", workspace.descriptor.title)];

    if let Some(workspace_root) = &workspace.descriptor.workspace_root {
        parts.push(format!("Workspace root: {workspace_root}"));
    } else {
        parts.push("Workspace root: (none)".into());
    }

    if let Some(render_target_path) = &workspace.descriptor.render_target_path {
        parts.push(format!("Render target: {render_target_path}"));
    } else {
        parts.push("Render target: (none)".into());
    }

    let mode = match workspace.mode {
        RegisteredWindowMode::Welcome => "welcome",
        RegisteredWindowMode::Opening => "opening",
        RegisteredWindowMode::Ready => "ready",
        RegisteredWindowMode::OpenFailed => "open_failed",
    };
    parts.push(format!("Window mode: {mode}"));
    parts.push(describe_workspace_startup_phase(workspace));

    text_tool_response(parts.join("\n"), false)
}

// ── Convert McpToolResponse → rmcp CallToolResult ────────────────────────────

fn mcp_response_to_call_tool_result(response: McpToolResponse) -> CallToolResult {
    let content: Vec<Content> = response
        .content
        .into_iter()
        .map(|item| match item {
            McpContentItem::Text { text } => Content::text(text),
            McpContentItem::Image { data, mime_type } => Content::image(data, mime_type),
        })
        .collect();

    if response.is_error {
        CallToolResult::error(content)
    } else {
        CallToolResult::success(content)
    }
}

// ── Tool parameter structs ────────────────────────────────────────────────────

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct GetOrCreateWorkspaceParams {
    /// Absolute path to the folder to open as a workspace.
    pub folder_path: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct SetRenderTargetParams {
    /// Workspace-relative path to the .scad file to use as render target.
    pub file_path: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct GetPreviewScreenshotParams {
    /// View perspective: "front", "back", "left", "right", "top", "bottom", or "isometric"
    pub view: String,
    /// Camera azimuth angle in degrees
    #[serde(default)]
    pub azimuth: Option<f64>,
    /// Camera elevation angle in degrees
    #[serde(default)]
    pub elevation: Option<f64>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct ExportFileParams {
    /// Export format: stl, obj, amf, 3mf, svg, or dxf
    pub format: String,
    /// Absolute output path, or workspace-relative path when a workspace root is open
    pub file_path: String,
}

/// Workspace root of the window this MCP session is bound to, if any.
fn bound_workspace_root(inner: &Arc<Mutex<McpStateInner>>, session_id: &str) -> Option<String> {
    let locked = inner.lock().unwrap();
    let window_id = locked
        .sessions
        .get(session_id)
        .and_then(|session| session.bound_window_id.clone())?;
    locked
        .workspaces
        .get(&window_id)
        .and_then(|workspace| workspace.descriptor.workspace_root.clone())
}

/// A path split into a comparable anchor plus its `.`/`..`-resolved components.
///
/// Deliberately lexical: an export target does not exist yet, so
/// `fs::canonicalize` cannot be used on it. Both `/` and `\` are treated as
/// separators and Windows verbatim prefixes are stripped, because
/// `normalize_workspace_root` canonicalizes the workspace root into `\\?\C:\...`
/// while a caller will spell the same location `C:\...`.
///
/// Returns `None` when the path climbs above its own anchor, which no
/// confinement check should ever accept.
fn lexical_path_parts(path: &str) -> Option<(String, Vec<String>)> {
    let mut normalized = path.trim().replace('/', "\\");
    if normalized.is_empty() {
        return None;
    }

    if let Some(rest) = normalized.strip_prefix("\\\\?\\UNC\\") {
        normalized = format!("\\\\{rest}");
    } else if let Some(rest) = normalized.strip_prefix("\\\\?\\") {
        normalized = rest.to_string();
    } else if let Some(rest) = normalized.strip_prefix("\\\\.\\") {
        normalized = rest.to_string();
    }

    let bytes = normalized.as_bytes();
    let (anchor, rest) = if let Some(body) = normalized.strip_prefix("\\\\") {
        let mut segments = body.splitn(3, '\\');
        let server = segments.next().unwrap_or_default();
        let share = segments.next().unwrap_or_default();
        if server.is_empty() || share.is_empty() {
            return None;
        }
        (
            format!("\\\\{server}\\{share}"),
            segments.next().unwrap_or_default().to_string(),
        )
    } else if bytes.len() >= 2 && bytes[1] == b':' && bytes[0].is_ascii_alphabetic() {
        (
            normalized[..2].to_string(),
            normalized[2..].trim_start_matches('\\').to_string(),
        )
    } else if let Some(body) = normalized.strip_prefix('\\') {
        ("\\".to_string(), body.to_string())
    } else {
        (String::new(), normalized.clone())
    };

    let mut components: Vec<String> = Vec::new();
    for segment in rest.split('\\') {
        match segment {
            "" | "." => {}
            ".." => {
                components.pop()?;
            }
            other => components.push(other.to_string()),
        }
    }
    Some((anchor, components))
}

/// Is `requested` inside `workspace_root`?
///
/// Comparison is whole-component and case-insensitive, matching Windows path
/// semantics — a raw `starts_with` would accept `…\widget-evil\` for the root
/// `…\widget`.
fn export_path_is_confined(workspace_root: &str, requested: &str) -> bool {
    let Some((root_anchor, root_components)) = lexical_path_parts(workspace_root) else {
        return false;
    };

    // A relative path is resolved against the workspace root, which is how the
    // desktop side resolves it too (`desktopMcp.ts` `resolveExportDestination`).
    let requested_is_absolute = lexical_path_parts(requested)
        .map(|(anchor, _)| !anchor.is_empty())
        .unwrap_or(false);
    let combined = if requested_is_absolute {
        requested.trim().to_string()
    } else {
        format!("{}\\{}", workspace_root.trim(), requested.trim())
    };

    let Some((anchor, components)) = lexical_path_parts(&combined) else {
        return false;
    };

    if !anchor.eq_ignore_ascii_case(&root_anchor) {
        return false;
    }
    // Strictly inside: the root directory itself is not a file destination.
    if components.len() <= root_components.len() {
        return false;
    }
    root_components
        .iter()
        .zip(&components)
        .all(|(root_component, component)| component.eq_ignore_ascii_case(root_component))
}

/// Arguments forwarded to the desktop side for `export_file`, refused unless the
/// destination is confined to the workspace this MCP session is bound to.
///
/// `export_file` lets the caller choose the write path, so without this check an
/// MCP client can drive a file write anywhere the user can write. The caller's
/// original path string is forwarded verbatim once accepted, so nothing about a
/// legitimate export changes.
fn export_file_arguments(
    workspace_root: Option<&str>,
    params: &ExportFileParams,
) -> Result<Value, String> {
    let requested = params.file_path.trim();
    if requested.is_empty() {
        return Err("`export_file` requires a non-empty `file_path`.".to_string());
    }

    let Some(workspace_root) = workspace_root
        .map(str::trim)
        .filter(|root| !root.is_empty())
    else {
        return Err(
            "❌ `export_file` needs an open workspace to write into. Call `get_or_create_workspace(folder_path)` first, then export to a path inside that folder."
                .to_string(),
        );
    };

    if !export_path_is_confined(workspace_root, requested) {
        return Err(format!(
            "❌ `export_file` refused to write outside the workspace.\n\nRequested: {requested}\nWorkspace root: {workspace_root}\n\nExports over MCP are confined to the workspace this session is bound to. Choose a destination inside that folder, or export from the TinkerQuarry window where you can approve the destination yourself."
        ));
    }

    Ok(serde_json::json!({
        "format": params.format,
        "file_path": params.file_path,
    }))
}

// ── rmcp handler ──────────────────────────────────────────────────────────────

#[derive(Clone)]
struct OpenScadMcpHandler {
    tool_router: ToolRouter<OpenScadMcpHandler>,
    app: AppHandle,
    shared_state: Arc<Mutex<McpStateInner>>,
    session_id: String,
}

impl Drop for OpenScadMcpHandler {
    fn drop(&mut self) {
        let mut inner = self.shared_state.lock().unwrap();
        inner.sessions.remove(&self.session_id);
    }
}

impl OpenScadMcpHandler {
    fn new(app: AppHandle, shared_state: Arc<Mutex<McpStateInner>>) -> Self {
        let session_id = Uuid::new_v4().to_string();
        {
            let mut inner = shared_state.lock().unwrap();
            inner.sessions.entry(session_id.clone()).or_default();
        }
        Self {
            tool_router: Self::tool_router(),
            app,
            shared_state,
            session_id,
        }
    }

    async fn call_frontend(
        &self,
        tool_name: &str,
        arguments: Value,
    ) -> Result<CallToolResult, McpError> {
        let window_id = {
            let mut locked = self.shared_state.lock().unwrap();
            match require_bound_window_id(&mut locked, &self.session_id) {
                Ok(id) => id,
                Err(resp) => return Ok(mcp_response_to_call_tool_result(resp)),
            }
        };

        let app = self.app.clone();
        let state = self.shared_state.clone();
        let tool = tool_name.to_string();

        let result = tokio::task::spawn_blocking(move || {
            call_frontend_tool(&app, &state, &window_id, &tool, arguments)
        })
        .await
        .map_err(|e| McpError::internal_error(format!("{e}"), None))?;

        Ok(mcp_response_to_call_tool_result(
            result.unwrap_or_else(|e| text_tool_response(e, true)),
        ))
    }
}

#[tool_router]
impl OpenScadMcpHandler {
    #[tool(
        description = "Ensure this MCP session is bound to the exact requested workspace folder by attaching to an already-open match or opening/initializing it in TinkerQuarry."
    )]
    async fn get_or_create_workspace(
        &self,
        Parameters(params): Parameters<GetOrCreateWorkspaceParams>,
    ) -> Result<CallToolResult, McpError> {
        let args = serde_json::json!({ "folder_path": params.folder_path });
        let app = self.app.clone();
        let state = self.shared_state.clone();
        let session_id = self.session_id.clone();

        let result = tokio::task::spawn_blocking(move || {
            get_or_create_workspace_response(&app, &state, &session_id, &args)
        })
        .await
        .map_err(|e| McpError::internal_error(format!("{e}"), None))?;

        Ok(mcp_response_to_call_tool_result(result))
    }

    #[tool(
        description = "Get the current TinkerQuarry render target and workspace summary for the selected workspace."
    )]
    async fn get_project_context(&self) -> Result<CallToolResult, McpError> {
        let state = self.shared_state.clone();
        let session_id = self.session_id.clone();

        let result =
            tokio::task::spawn_blocking(move || get_project_context_response(&state, &session_id))
                .await
                .map_err(|e| McpError::internal_error(format!("{e}"), None))?;

        Ok(mcp_response_to_call_tool_result(result))
    }

    #[tool(description = "Change which workspace-relative file Studio compiles and previews.")]
    async fn set_render_target(
        &self,
        Parameters(params): Parameters<SetRenderTargetParams>,
    ) -> Result<CallToolResult, McpError> {
        let args = serde_json::json!({ "file_path": params.file_path });
        self.call_frontend("set_render_target", args).await
    }

    #[tool(
        description = "Render the current Studio render target and report the latest diagnostics without failing on compile errors."
    )]
    async fn get_diagnostics(&self) -> Result<CallToolResult, McpError> {
        self.call_frontend("get_diagnostics", serde_json::json!({}))
            .await
    }

    #[tool(
        description = "Render the current Studio render target, refresh the preview, and fail if the render reports errors."
    )]
    async fn trigger_render(&self) -> Result<CallToolResult, McpError> {
        self.call_frontend("trigger_render", serde_json::json!({}))
            .await
    }

    #[tool(
        description = "Capture a PNG screenshot of the latest settled render artifact for the current render target. Requires an explicit 3D view such as front, top, or isometric."
    )]
    async fn get_preview_screenshot(
        &self,
        Parameters(params): Parameters<GetPreviewScreenshotParams>,
    ) -> Result<CallToolResult, McpError> {
        let args = serde_json::json!({
            "view": params.view,
            "azimuth": params.azimuth,
            "elevation": params.elevation,
        });
        self.call_frontend("get_preview_screenshot", args).await
    }

    #[tool(
        description = "Export the current render target to a file path on desktop. If export cannot proceed, the response explains how to verify the render target and diagnostics."
    )]
    async fn export_file(
        &self,
        Parameters(params): Parameters<ExportFileParams>,
    ) -> Result<CallToolResult, McpError> {
        let workspace_root = bound_workspace_root(&self.shared_state, &self.session_id);
        let args = match export_file_arguments(workspace_root.as_deref(), &params) {
            Ok(args) => args,
            Err(message) => {
                return Ok(mcp_response_to_call_tool_result(text_tool_response(
                    message, true,
                )))
            }
        };
        self.call_frontend("export_file", args).await
    }
}

#[tool_handler]
impl ServerHandler for OpenScadMcpHandler {
    fn get_info(&self) -> ServerInfo {
        use rmcp::model::Implementation;
        ServerInfo::new(ServerCapabilities::builder().enable_tools().build())
            .with_server_info(Implementation::new(
                "tinkerquarry",
                env!("CARGO_PKG_VERSION"),
            ))
            .with_instructions(
                "TinkerQuarry MCP server — controls the TinkerQuarry desktop editor.".to_string(),
            )
    }
}

// ── Tauri commands ────────────────────────────────────────────────────────────

pub(crate) fn record_window_startup_phase(
    state: &McpServerState,
    window_label: &str,
    phase: impl Into<String>,
    detail: Option<String>,
) {
    let phase = phase.into();
    let mut inner = state.inner.lock().unwrap();
    let workspace = inner
        .workspaces
        .entry(window_label.to_string())
        .or_insert_with(|| RegisteredWorkspace {
            descriptor: WorkspaceDescriptor {
                window_id: window_label.to_string(),
                title: "TinkerQuarry".into(),
                workspace_root: None,
                render_target_path: None,
                is_focused: false,
            },
            show_welcome: true,
            mode: RegisteredWindowMode::Welcome,
            pending_request_id: None,
            startup_phase: "created".into(),
            startup_detail: None,
            context_ready: false,
            bridge_ready: false,
            last_focused_order: 0,
        });
    workspace.startup_phase = phase;
    workspace.startup_detail = detail;
}

#[tauri::command]
pub async fn configure_mcp_server(
    app: AppHandle,
    enabled: bool,
    port: u16,
    state: State<'_, McpServerState>,
) -> Result<McpServerStatus, String> {
    // Idempotency check: every window calls this on mount, but we must not
    // restart the server just because a secondary window opened. If the server
    // is already running with the same config, return early.
    {
        let inner = state.inner.lock().unwrap();
        if enabled && inner.running_server.is_some() && inner.status.port == port {
            return Ok(inner.status.clone());
        }
        if !enabled && inner.running_server.is_none() {
            return Ok(inner.status.clone());
        }
    }

    // Take ownership of any existing server handle so we can stop it.
    let previous = {
        let mut inner = state.inner.lock().unwrap();
        inner.status = build_status(
            enabled,
            port,
            if enabled {
                McpServerStateKind::Starting
            } else {
                McpServerStateKind::Disabled
            },
            None,
        );
        inner.running_server.take()
    };

    // Stop the previous server if any.
    if let Some(handle) = previous {
        handle.cancellation_token.cancel();
        let _ = handle.join_handle.await;
    }

    if !enabled {
        let mut inner = state.inner.lock().unwrap();
        inner.status = build_status(false, port, McpServerStateKind::Disabled, None);
        inner.sessions.clear();
        inner.window_open_requests.clear();
        return Ok(inner.status.clone());
    }

    // Try to bind the TCP listener before spawning anything.
    let address = format!("127.0.0.1:{port}");
    let tcp_listener = match tokio::net::TcpListener::bind(&address).await {
        Ok(l) => l,
        Err(error) => {
            let kind = if error
                .to_string()
                .to_lowercase()
                .contains("address already in use")
            {
                McpServerStateKind::PortConflict
            } else {
                McpServerStateKind::Error
            };
            let mut inner = state.inner.lock().unwrap();
            inner.status = build_status(enabled, port, kind, Some(error.to_string()));
            return Ok(inner.status.clone());
        }
    };

    let shared_state = state.inner.clone();
    let app_handle = app.clone();
    let session_token = state.session_token.clone();
    let ct = tokio_util::sync::CancellationToken::new();
    let ct_child = ct.child_token();

    let join_handle = tokio::spawn(async move {
        let service = StreamableHttpService::new(
            move || {
                let handler = OpenScadMcpHandler::new(app_handle.clone(), shared_state.clone());
                Ok(handler)
            },
            std::sync::Arc::new(LocalSessionManager::default()),
            build_mcp_config(ct_child.clone()),
        );

        let router = finish_mcp_router(
            axum::Router::new().nest_service("/mcp", service),
            session_token,
        );
        let _ = axum::serve(tcp_listener, router)
            .with_graceful_shutdown(async move {
                ct_child.cancelled().await;
            })
            .await;
    });

    let mut inner = state.inner.lock().unwrap();
    inner.running_server = Some(RunningServerHandle {
        cancellation_token: ct,
        join_handle,
    });
    inner.status = build_status(enabled, port, McpServerStateKind::Running, None);
    inner.status.session_token = Some(state.session_token.to_string());
    Ok(inner.status.clone())
}

#[tauri::command]
pub fn get_mcp_server_status(state: State<'_, McpServerState>) -> Result<McpServerStatus, String> {
    Ok(state.inner.lock().unwrap().status.clone())
}

#[tauri::command]
pub async fn mcp_mark_window_bridge_ready(
    window: Window,
    state: State<'_, McpServerState>,
) -> Result<(), String> {
    let label = window.label().to_string();
    let is_focused = window.is_focused().unwrap_or(false);
    let mut inner = state.inner.lock().unwrap();
    let workspace = inner
        .workspaces
        .entry(label.clone())
        .or_insert_with(|| RegisteredWorkspace {
            descriptor: WorkspaceDescriptor {
                window_id: label,
                title: "TinkerQuarry".into(),
                workspace_root: None,
                render_target_path: None,
                is_focused,
            },
            show_welcome: true,
            mode: RegisteredWindowMode::Welcome,
            pending_request_id: None,
            startup_phase: "created".into(),
            startup_detail: None,
            context_ready: false,
            bridge_ready: false,
            last_focused_order: 0,
        });
    workspace.bridge_ready = true;
    workspace.startup_phase = "bridge_ready".into();
    workspace.startup_detail = None;
    Ok(())
}

#[tauri::command]
pub async fn mcp_update_window_context(
    window: Window,
    payload: WindowContextPayload,
    state: State<'_, McpServerState>,
) -> Result<(), String> {
    let label = window.label().to_string();
    let normalized_root = payload
        .workspace_root
        .as_deref()
        .and_then(normalize_workspace_root);
    let title = payload.title.unwrap_or_else(|| "TinkerQuarry".into());
    let render_target_path = payload.render_target_path.clone();
    let is_focused = window.is_focused().unwrap_or(false);

    let mut inner = state.inner.lock().unwrap();
    let next_focus_order = if is_focused {
        inner.next_focus_order += 1;
        inner.next_focus_order
    } else {
        inner
            .workspaces
            .get(&label)
            .map(|w| w.last_focused_order)
            .unwrap_or(0)
    };
    let previous_bridge_ready = inner
        .workspaces
        .get(&label)
        .map(|w| w.bridge_ready)
        .unwrap_or(false);
    let previous_startup_phase = inner
        .workspaces
        .get(&label)
        .map(|w| w.startup_phase.clone())
        .unwrap_or_else(|| "context_updated".into());
    let previous_startup_detail = inner
        .workspaces
        .get(&label)
        .and_then(|w| w.startup_detail.clone());

    inner.workspaces.insert(
        label.clone(),
        RegisteredWorkspace {
            descriptor: WorkspaceDescriptor {
                window_id: label,
                title,
                workspace_root: normalized_root,
                render_target_path,
                is_focused,
            },
            show_welcome: payload.show_welcome,
            mode: payload.mode.unwrap_or(if payload.show_welcome {
                RegisteredWindowMode::Welcome
            } else {
                RegisteredWindowMode::Ready
            }),
            pending_request_id: payload.pending_request_id,
            startup_phase: previous_startup_phase,
            startup_detail: previous_startup_detail,
            context_ready: payload.ready,
            bridge_ready: previous_bridge_ready,
            last_focused_order: next_focus_order,
        },
    );
    Ok(())
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowOpenResultPayload {
    pub request_id: String,
    pub success: bool,
    pub message: Option<String>,
    pub opened_workspace_root: Option<String>,
}

#[tauri::command]
pub async fn report_window_open_result(
    window: Window,
    payload: WindowOpenResultPayload,
    state: State<'_, McpServerState>,
) -> Result<(), String> {
    let label = window.label().to_string();
    let mut inner = state.inner.lock().unwrap();
    inner
        .workspaces
        .entry(label.clone())
        .or_insert_with(|| RegisteredWorkspace {
            descriptor: WorkspaceDescriptor {
                window_id: label.clone(),
                title: "TinkerQuarry".into(),
                workspace_root: None,
                render_target_path: None,
                is_focused: false,
            },
            show_welcome: true,
            mode: RegisteredWindowMode::Welcome,
            pending_request_id: None,
            startup_phase: "created".into(),
            startup_detail: None,
            context_ready: false,
            bridge_ready: false,
            last_focused_order: 0,
        });

    if let Some(pending) = inner.window_open_requests.remove(&payload.request_id) {
        if let Some(workspace) = inner.workspaces.get_mut(&label) {
            workspace.pending_request_id = None;
            workspace.mode = if payload.success {
                if payload.opened_workspace_root.is_some() {
                    workspace.show_welcome = false;
                    RegisteredWindowMode::Ready
                } else if workspace.show_welcome {
                    RegisteredWindowMode::Welcome
                } else {
                    RegisteredWindowMode::Ready
                }
            } else {
                RegisteredWindowMode::OpenFailed
            };
        }
        let result = if payload.success {
            Ok(WindowOpenResult {
                message: payload
                    .message
                    .unwrap_or_else(|| "Opened target successfully.".into()),
                opened_workspace_root: payload
                    .opened_workspace_root
                    .as_deref()
                    .and_then(normalize_workspace_root),
            })
        } else {
            Err(payload
                .message
                .unwrap_or_else(|| "Failed to open target.".into()))
        };
        let _ = pending.sender.send(result);
    }
    Ok(())
}

#[tauri::command]
pub async fn mcp_report_window_startup_phase(
    window: Window,
    payload: WindowStartupPhasePayload,
    state: State<'_, McpServerState>,
) -> Result<(), String> {
    record_window_startup_phase(&state, window.label(), payload.phase, payload.detail);
    Ok(())
}

#[tauri::command]
pub async fn mcp_submit_tool_response(
    request_id: String,
    response: McpToolResponse,
    state: State<'_, McpServerState>,
) -> Result<(), String> {
    let sender = state.inner.lock().unwrap().pending.remove(&request_id);
    let Some(sender) = sender else {
        return Err(format!(
            "No pending MCP tool request found for {request_id}."
        ));
    };
    sender
        .send(response)
        .map_err(|error| format!("Failed to send MCP tool response: {error}"))
}

pub fn update_window_focus(state: &McpServerState, window_id: &str, is_focused: bool) {
    let mut inner = state.inner.lock().unwrap();
    if is_focused {
        inner.next_focus_order += 1;
    }
    let next_focus_order = inner.next_focus_order;
    if let Some(workspace) = inner.workspaces.get_mut(window_id) {
        workspace.descriptor.is_focused = is_focused;
        if is_focused {
            workspace.last_focused_order = next_focus_order;
        }
    }
}

pub fn remove_window(state: &McpServerState, window_id: &str) {
    let mut inner = state.inner.lock().unwrap();
    remove_window_and_invalidate_sessions_locked(&mut inner, window_id);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn workspace(
        window_id: &str,
        root: Option<&str>,
        title: &str,
        show_welcome: bool,
    ) -> RegisteredWorkspace {
        RegisteredWorkspace {
            descriptor: WorkspaceDescriptor {
                window_id: window_id.into(),
                title: title.into(),
                workspace_root: root.map(|value| value.into()),
                render_target_path: Some("main.scad".into()),
                is_focused: false,
            },
            show_welcome,
            mode: if show_welcome {
                RegisteredWindowMode::Welcome
            } else {
                RegisteredWindowMode::Ready
            },
            pending_request_id: None,
            startup_phase: if show_welcome {
                "welcome_ready".into()
            } else {
                "ready".into()
            },
            startup_detail: None,
            context_ready: true,
            bridge_ready: true,
            last_focused_order: 0,
        }
    }

    fn make_inner() -> McpStateInner {
        McpStateInner {
            running_server: None,
            pending: HashMap::new(),
            window_open_requests: HashMap::new(),
            status: build_status(false, MCP_DEFAULT_PORT, McpServerStateKind::Disabled, None),
            workspaces: HashMap::new(),
            sessions: HashMap::new(),
            next_focus_order: 0,
        }
    }

    #[test]
    fn require_bound_window_id_errors_when_unbound() {
        let mut inner = make_inner();
        inner
            .sessions
            .insert("session-1".into(), McpSessionBinding::default());

        let response = require_bound_window_id(&mut inner, "session-1").unwrap_err();
        assert!(response.is_error);
        assert!(matches!(
            response.content.first(),
            Some(McpContentItem::Text { text }) if text.contains("get_or_create_workspace")
        ));
    }

    #[test]
    fn remove_window_invalidates_bound_sessions() {
        let mut inner = make_inner();
        inner.workspaces.insert(
            "window-a".into(),
            workspace("window-a", Some("/tmp/project-a"), "Project A", false),
        );
        inner.sessions.insert(
            "session-1".into(),
            McpSessionBinding {
                bound_window_id: Some("window-a".into()),
            },
        );

        remove_window_and_invalidate_sessions_locked(&mut inner, "window-a");

        assert!(!inner.workspaces.contains_key("window-a"));
        assert_eq!(
            inner
                .sessions
                .get("session-1")
                .and_then(|session| session.bound_window_id.clone()),
            None
        );
    }

    #[test]
    fn choose_existing_workspace_for_root_prefers_matching_workspace() {
        let mut inner = make_inner();
        inner.workspaces.insert(
            "window-a".into(),
            workspace("window-a", Some("/tmp/project-a"), "Project A", false),
        );
        inner.workspaces.insert(
            "window-b".into(),
            workspace("window-b", None, "Welcome", true),
        );

        assert_eq!(
            choose_existing_workspace_for_root(&inner, "/tmp/project-a"),
            Some("window-a".into())
        );
    }

    #[test]
    fn choose_blank_welcome_window_ignores_non_welcome_windows_without_roots() {
        let mut inner = make_inner();
        inner.workspaces.insert(
            "window-a".into(),
            workspace("window-a", None, "Unsaved Scratch", false),
        );
        inner.workspaces.insert(
            "window-b".into(),
            workspace("window-b", None, "Welcome", true),
        );

        assert_eq!(choose_blank_welcome_window(&inner), Some("window-b".into()));
    }

    #[test]
    fn wait_for_window_tool_ready_requires_bridge_listener() {
        let inner = Arc::new(Mutex::new({
            let mut s = make_inner();
            s.workspaces.insert(
                "main".into(),
                RegisteredWorkspace {
                    descriptor: WorkspaceDescriptor {
                        window_id: "main".into(),
                        title: "Project".into(),
                        workspace_root: Some("/tmp/project".into()),
                        render_target_path: Some("main.scad".into()),
                        is_focused: true,
                    },
                    show_welcome: false,
                    mode: RegisteredWindowMode::Ready,
                    pending_request_id: None,
                    startup_phase: "ready".into(),
                    startup_detail: None,
                    context_ready: true,
                    bridge_ready: false,
                    last_focused_order: 1,
                },
            );
            s
        }));

        let result = wait_for_window_tool_ready(&inner, "main", Duration::from_millis(0));

        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .contains("finish starting its MCP bridge"));
    }

    #[test]
    fn wait_for_window_tool_ready_succeeds_when_context_and_bridge_are_ready() {
        let inner = Arc::new(Mutex::new({
            let mut s = make_inner();
            s.workspaces.insert(
                "main".into(),
                RegisteredWorkspace {
                    descriptor: WorkspaceDescriptor {
                        window_id: "main".into(),
                        title: "Project".into(),
                        workspace_root: Some("/tmp/project".into()),
                        render_target_path: Some("main.scad".into()),
                        is_focused: true,
                    },
                    show_welcome: false,
                    mode: RegisteredWindowMode::Ready,
                    pending_request_id: None,
                    startup_phase: "ready".into(),
                    startup_detail: None,
                    context_ready: true,
                    bridge_ready: true,
                    last_focused_order: 1,
                },
            );
            s
        }));

        let result = wait_for_window_tool_ready(&inner, "main", Duration::from_millis(100));

        assert!(result.is_ok());
    }

    // ── MCP-1: listener security ─────────────────────────────────────────────
    //
    // These drive the real axum + rmcp stack over a real loopback socket with
    // hand-written HTTP/1.1, so what is asserted is what the wire actually
    // carries — including the ABSENCE of `access-control-allow-origin`. The
    // router and config come from `finish_mcp_router` / `build_mcp_config`,
    // the same two functions `configure_mcp_server` uses, so a probe cannot
    // drift away from what ships.

    #[derive(Clone)]
    struct ProbeHandler;

    impl ServerHandler for ProbeHandler {}

    const PROBE_TOKEN: &str = "probe-token-0123456789abcdef";

    struct ProbeServer {
        addr: String,
        cancel: tokio_util::sync::CancellationToken,
        runtime: Option<tokio::runtime::Runtime>,
    }

    impl Drop for ProbeServer {
        fn drop(&mut self) {
            self.cancel.cancel();
            if let Some(runtime) = self.runtime.take() {
                runtime.shutdown_timeout(Duration::from_secs(2));
            }
        }
    }

    fn start_probe_server() -> ProbeServer {
        let runtime = tokio::runtime::Builder::new_multi_thread()
            .worker_threads(2)
            .enable_all()
            .build()
            .expect("probe runtime");
        let cancel = tokio_util::sync::CancellationToken::new();
        let ct_child = cancel.child_token();
        let listener = runtime
            .block_on(async { tokio::net::TcpListener::bind("127.0.0.1:0").await })
            .expect("probe listener");
        let addr = listener.local_addr().expect("probe addr").to_string();

        let serve_token = ct_child.clone();
        runtime.spawn(async move {
            let service = StreamableHttpService::new(
                || Ok(ProbeHandler),
                std::sync::Arc::new(LocalSessionManager::default()),
                build_mcp_config(ct_child.clone()),
            );
            let router = finish_mcp_router(
                axum::Router::new().nest_service("/mcp", service),
                Arc::from(PROBE_TOKEN),
            );
            let _ = axum::serve(listener, router)
                .with_graceful_shutdown(async move { serve_token.cancelled().await })
                .await;
        });

        ProbeServer {
            addr,
            cancel,
            runtime: Some(runtime),
        }
    }

    /// Write a raw HTTP/1.1 request and read whatever comes back. A short read
    /// timeout is what terminates the read for an SSE response, which by design
    /// never closes the connection.
    fn probe(addr: &str, request: &str) -> String {
        use std::io::{Read, Write};

        let mut stream = std::net::TcpStream::connect(addr).expect("probe connect");
        stream
            .set_read_timeout(Some(Duration::from_millis(1500)))
            .expect("probe read timeout");
        stream
            .write_all(request.as_bytes())
            .expect("probe write request");
        stream.flush().ok();

        let mut received = Vec::new();
        let mut chunk = [0_u8; 4096];
        loop {
            match stream.read(&mut chunk) {
                Ok(0) => break,
                Ok(n) => received.extend_from_slice(&chunk[..n]),
                Err(_) => break,
            }
        }
        String::from_utf8_lossy(&received).into_owned()
    }

    const INITIALIZE_BODY: &str = concat!(
        r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"#,
        r#""protocolVersion":"2025-06-18","capabilities":{},"#,
        r#""clientInfo":{"name":"probe","version":"1.0.0"}}}"#
    );

    fn post_probe(addr: &str, content_type: &str, extra_headers: &[&str], body: &str) -> String {
        let mut request = format!(
            "POST /mcp HTTP/1.1\r\nHost: {addr}\r\n\
             Accept: application/json, text/event-stream\r\n\
             Content-Type: {content_type}\r\n\
             Content-Length: {}\r\nConnection: close\r\n",
            body.len()
        );
        for header in extra_headers {
            request.push_str(header);
            request.push_str("\r\n");
        }
        request.push_str("\r\n");
        request.push_str(body);
        request
    }

    fn bearer(token: &str) -> String {
        format!("Authorization: Bearer {token}")
    }

    fn status_line(response: &str) -> String {
        response.lines().next().unwrap_or("<no response>").into()
    }

    fn header_present(response: &str, name: &str) -> bool {
        let head = response.split("\r\n\r\n").next().unwrap_or("");
        let needle = format!("{}:", name.to_ascii_lowercase());
        head.lines()
            .skip(1)
            .any(|line| line.to_ascii_lowercase().starts_with(&needle))
    }

    #[test]
    fn mcp_auth_accepts_only_an_exact_bearer_match() {
        assert_eq!(
            classify_mcp_auth(Some("Bearer abc123"), "abc123"),
            McpAuth::Ok
        );
        // Scheme name is case-insensitive per RFC 7235; the secret is not.
        assert_eq!(
            classify_mcp_auth(Some("bearer abc123"), "abc123"),
            McpAuth::Ok
        );
        assert_eq!(
            classify_mcp_auth(Some("Bearer ABC123"), "abc123"),
            McpAuth::Mismatch
        );
        assert_eq!(
            classify_mcp_auth(Some("Bearer abc123x"), "abc123"),
            McpAuth::Mismatch
        );
        assert_eq!(classify_mcp_auth(None, "abc123"), McpAuth::Missing);
        assert_eq!(
            classify_mcp_auth(Some("abc123"), "abc123"),
            McpAuth::Missing
        );
        assert_eq!(
            classify_mcp_auth(Some("Basic abc123"), "abc123"),
            McpAuth::Missing
        );
        assert_eq!(
            classify_mcp_auth(Some("Bearer "), "abc123"),
            McpAuth::Missing
        );
        assert_eq!(classify_mcp_auth(Some("Bearer "), ""), McpAuth::Missing);
    }

    #[test]
    fn mcp_rejects_a_request_with_no_token() {
        let server = start_probe_server();
        let response = probe(
            &server.addr,
            &post_probe(&server.addr, "application/json", &[], INITIALIZE_BODY),
        );

        assert!(
            status_line(&response).contains(" 401"),
            "an unauthenticated local process reached the MCP tools; status was: {}",
            status_line(&response)
        );
    }

    #[test]
    fn mcp_rejects_a_request_with_an_incorrect_token() {
        let server = start_probe_server();
        let response = probe(
            &server.addr,
            &post_probe(
                &server.addr,
                "application/json",
                &[&bearer("not-the-real-token")],
                INITIALIZE_BODY,
            ),
        );

        assert!(
            status_line(&response).contains(" 401"),
            "a wrong bearer token was accepted; status was: {}",
            status_line(&response)
        );
    }

    #[test]
    fn mcp_rejects_a_request_carrying_a_foreign_origin() {
        let server = start_probe_server();
        let response = probe(
            &server.addr,
            &post_probe(
                &server.addr,
                "application/json",
                &[&bearer(PROBE_TOKEN), "Origin: https://evil.example"],
                INITIALIZE_BODY,
            ),
        );

        assert!(
            status_line(&response).contains(" 403"),
            "a foreign Origin was accepted; status was: {}",
            status_line(&response)
        );
    }

    #[test]
    fn mcp_accepts_the_desktop_apps_own_origin() {
        let server = start_probe_server();
        let response = probe(
            &server.addr,
            &post_probe(
                &server.addr,
                "application/json",
                &[&bearer(PROBE_TOKEN), "Origin: http://tauri.localhost"],
                INITIALIZE_BODY,
            ),
        );

        let status = status_line(&response);
        assert!(
            !status.contains(" 403") && !status.contains(" 401"),
            "the app's own origin was locked out; status was: {status}"
        );
    }

    #[test]
    fn mcp_accepts_a_missing_origin_so_native_clients_keep_working() {
        // rmcp lets missing-`Origin` requests through by design; that is what
        // keeps non-browser MCP clients working. The bearer token, not the
        // Origin check, is what gates those callers.
        let server = start_probe_server();
        let response = probe(
            &server.addr,
            &post_probe(
                &server.addr,
                "application/json",
                &[&bearer(PROBE_TOKEN)],
                INITIALIZE_BODY,
            ),
        );

        let status = status_line(&response);
        assert!(
            !status.contains(" 403") && !status.contains(" 401"),
            "a native MCP client with a valid token was refused; status was: {status}"
        );
    }

    #[test]
    fn mcp_preflight_never_grants_a_browser_cross_origin_access() {
        // REGRESSION GUARD — do not delete.
        //
        // The only reason a hostile web page cannot reach `export_file` today is
        // that this preflight is refused: OPTIONS returns 405 with no
        // `Access-Control-Allow-Origin`, so the browser aborts before it ever
        // sends the POST. Bolting a `tower_http::cors::CorsLayer` onto this
        // router — the idiomatic axum way to "allow-list origins", and very
        // tempting the first time someone debugs a browser-based MCP client —
        // makes the server ANSWER preflights, which opens the exact drive-by
        // this fix exists to keep shut. Origin allow-listing belongs in
        // `build_mcp_config`, which validates without emitting CORS headers.
        let server = start_probe_server();

        for extra in [vec![], vec![bearer(PROBE_TOKEN)]] {
            let mut request = format!(
                "OPTIONS /mcp HTTP/1.1\r\nHost: {}\r\n\
                 Origin: https://evil.example\r\n\
                 Access-Control-Request-Method: POST\r\n\
                 Access-Control-Request-Headers: content-type\r\n\
                 Connection: close\r\n",
                server.addr
            );
            for header in &extra {
                request.push_str(header);
                request.push_str("\r\n");
            }
            request.push_str("\r\n");

            let response = probe(&server.addr, &request);
            assert!(
                !header_present(&response, "access-control-allow-origin"),
                "the preflight granted cross-origin access, which reopens the browser drive-by:\n{response}"
            );
            assert!(
                !status_line(&response).contains(" 200"),
                "the preflight succeeded; status was: {}",
                status_line(&response)
            );
        }
    }

    #[test]
    fn mcp_refuses_a_cors_safelisted_content_type() {
        // The other half of the browser barrier: `application/json` is not a
        // CORS-safelisted `Content-Type`, so a page cannot dodge the preflight
        // by downgrading to `text/plain` — rmcp answers 415.
        let server = start_probe_server();
        let response = probe(
            &server.addr,
            &post_probe(
                &server.addr,
                "text/plain",
                &[&bearer(PROBE_TOKEN)],
                INITIALIZE_BODY,
            ),
        );

        assert!(
            status_line(&response).contains(" 415"),
            "a CORS-safelisted content type was accepted; status was: {}",
            status_line(&response)
        );
    }

    // ── MCP-1: export_file path confinement ──────────────────────────────────

    fn export_params(file_path: &str) -> ExportFileParams {
        ExportFileParams {
            format: "stl".into(),
            file_path: file_path.into(),
        }
    }

    #[test]
    fn export_file_allows_a_path_inside_the_workspace() {
        let args = export_file_arguments(
            Some("C:\\Users\\me\\projects\\widget"),
            &export_params("C:\\Users\\me\\projects\\widget\\out\\widget.stl"),
        )
        .expect("an in-workspace export must be allowed");

        assert_eq!(
            args.get("file_path").and_then(Value::as_str),
            Some("C:\\Users\\me\\projects\\widget\\out\\widget.stl"),
            "the client's own path string must reach the desktop side unchanged"
        );
    }

    #[test]
    fn export_file_allows_a_workspace_relative_path() {
        let args = export_file_arguments(
            Some("C:\\Users\\me\\projects\\widget"),
            &export_params("out/widget.stl"),
        )
        .expect("a workspace-relative export must be allowed");

        assert_eq!(
            args.get("file_path").and_then(Value::as_str),
            Some("out/widget.stl")
        );
    }

    #[test]
    fn export_file_refuses_an_absolute_path_outside_the_workspace() {
        let error = export_file_arguments(
            Some("C:\\Users\\me\\projects\\widget"),
            &export_params("C:\\Windows\\System32\\drivers\\etc\\hosts"),
        )
        .expect_err("an arbitrary absolute write path must be refused");

        assert!(
            error.contains("outside the workspace"),
            "unexpected refusal message: {error}"
        );
    }

    #[test]
    fn export_file_refuses_a_relative_path_that_climbs_out_of_the_workspace() {
        let error = export_file_arguments(
            Some("C:\\Users\\me\\projects\\widget"),
            &export_params("..\\..\\..\\Startup\\payload.stl"),
        )
        .expect_err("a climbing relative path must be refused");

        assert!(
            error.contains("outside the workspace"),
            "unexpected refusal message: {error}"
        );
    }

    #[test]
    fn export_file_refuses_a_sibling_directory_sharing_the_root_prefix() {
        // A naive `starts_with` on the raw string accepts this. The check has to
        // compare whole path components.
        let error = export_file_arguments(
            Some("C:\\Users\\me\\projects\\widget"),
            &export_params("C:\\Users\\me\\projects\\widget-evil\\payload.stl"),
        )
        .expect_err("a sibling directory sharing the root's prefix must be refused");

        assert!(
            error.contains("outside the workspace"),
            "unexpected refusal message: {error}"
        );
    }

    #[test]
    fn export_file_refuses_an_escape_hidden_behind_a_verbatim_prefix() {
        let error = export_file_arguments(
            Some("C:\\Users\\me\\projects\\widget"),
            &export_params("\\\\?\\C:\\Users\\me\\projects\\widget\\..\\..\\payload.stl"),
        )
        .expect_err("a verbatim-prefixed escape must be refused");

        assert!(
            error.contains("outside the workspace"),
            "unexpected refusal message: {error}"
        );
    }

    #[test]
    fn export_file_matches_a_canonicalized_verbatim_workspace_root() {
        // `normalize_workspace_root` goes through `fs::canonicalize`, which on
        // Windows returns `\\?\C:\...`. Both sides must normalize to the same
        // shape or every legitimate export would be refused.
        export_file_arguments(
            Some("\\\\?\\C:\\Users\\me\\projects\\widget"),
            &export_params("C:/Users/Me/Projects/Widget/out/widget.stl"),
        )
        .expect("a canonicalized root must still match the user's own path spelling");
    }

    #[test]
    fn export_file_refuses_when_no_workspace_is_bound() {
        let error = export_file_arguments(None, &export_params("C:\\tmp\\widget.stl"))
            .expect_err("with no workspace root there is nothing to confine the write to");

        assert!(
            error.contains("workspace"),
            "unexpected refusal message: {error}"
        );
    }

    #[test]
    fn bound_workspace_root_finds_the_root_of_the_bound_window() {
        // If this lookup ever returns None for a properly bound session, every
        // legitimate export would be refused; if it returned the wrong window's
        // root, the confinement check would be guarding the wrong directory.
        let inner = Arc::new(Mutex::new({
            let mut state = make_inner();
            state.workspaces.insert(
                "window-a".into(),
                workspace("window-a", Some("/tmp/project-a"), "Project A", false),
            );
            state.workspaces.insert(
                "window-b".into(),
                workspace("window-b", Some("/tmp/project-b"), "Project B", false),
            );
            state.sessions.insert(
                "session-1".into(),
                McpSessionBinding {
                    bound_window_id: Some("window-b".into()),
                },
            );
            state
        }));

        assert_eq!(
            bound_workspace_root(&inner, "session-1"),
            Some("/tmp/project-b".to_string())
        );
    }

    #[test]
    fn bound_workspace_root_is_none_for_an_unbound_session() {
        let inner = Arc::new(Mutex::new({
            let mut state = make_inner();
            state
                .sessions
                .insert("session-1".into(), McpSessionBinding::default());
            state
        }));

        assert_eq!(bound_workspace_root(&inner, "session-1"), None);
        assert_eq!(bound_workspace_root(&inner, "no-such-session"), None);
    }

    #[test]
    fn export_file_refuses_an_empty_path() {
        export_file_arguments(
            Some("C:\\Users\\me\\projects\\widget"),
            &export_params("   "),
        )
        .expect_err("an empty path must be refused");
    }
}
