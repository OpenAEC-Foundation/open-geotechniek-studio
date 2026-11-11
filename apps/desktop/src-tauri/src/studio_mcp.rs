//! Authenticated loopback transport to the live Studio frontend.
use axum::{
    extract::{DefaultBodyLimit, State},
    http::{HeaderMap, StatusCode},
    routing::post,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    io::{self, BufRead, Write},
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tokio::sync::{oneshot, Mutex as AsyncMutex};

const MAX_BODY: usize = 1024 * 1024;
const SESSION_TTL_MS: u64 = 20_000;
fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
fn authorized(token: &str, header: Option<&str>) -> bool {
    header.is_some_and(|value| value.strip_prefix("Bearer ") == Some(token))
}
fn allowed_tool(tool: &str) -> bool {
    matches!(
        tool,
        "studio_get_state"
            | "studio_new_project"
            | "studio_open_file"
            | "studio_set_project_meta"
            | "studio_add_calculation"
            | "studio_update_calculation"
            | "studio_get_calculation"
            | "studio_select_calculation"
            | "studio_save_project"
            | "studio_get_cpt"
            | "studio_select_document"
            | "studio_show_view"
            | "studio_get_capacity_table"
            | "studio_export_report"
    )
}
fn valid_endpoint(url: &str) -> bool {
    // Check the literal authority too: URL parsers normalize alternate IPv4 forms.
    let Some(port) = url.strip_prefix("http://127.0.0.1:") else {
        return false;
    };
    !port.is_empty()
        && port.chars().all(|c| c.is_ascii_digit())
        && port.parse::<u16>().is_ok_and(|p| p > 0)
}
fn is_notification(request: &Value) -> bool {
    request.get("id").is_none()
}

#[derive(Default)]
struct Sessions(HashMap<String, (String, u64)>);
impl Sessions {
    fn connect(&mut self, name: &str, now: u64) -> String {
        let id = uuid::Uuid::new_v4().to_string();
        self.0
            .insert(id.clone(), (name.chars().take(128).collect(), now));
        id
    }
    fn heartbeat(&mut self, id: &str, now: u64) -> bool {
        self.expire(now);
        if let Some((_, last)) = self.0.get_mut(id) {
            *last = now;
            true
        } else {
            false
        }
    }
    fn expire(&mut self, now: u64) {
        self.0
            .retain(|_, (_, last)| now.saturating_sub(*last) <= SESSION_TTL_MS);
    }
    fn disconnect(&mut self, id: &str) {
        self.0.remove(id);
    }
}

#[derive(Clone, Debug, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct StudioMcpStatus {
    available: bool,
    connected_clients: usize,
    client_names: Vec<String>,
    active_tool: Option<String>,
    last_activity: Option<u64>,
    error: Option<String>,
}

type ToolResult = Result<Value, String>;
pub type EventEmitter = Arc<dyn Fn(&str, Value) -> Result<(), String> + Send + Sync>;
#[derive(Default)]
struct BridgeData {
    status: StudioMcpStatus,
    listening: bool,
    ready: bool,
    sessions: Sessions,
    pending: HashMap<String, oneshot::Sender<ToolResult>>,
}
#[derive(Clone, Default)]
pub struct StudioMcpBridge {
    data: Arc<Mutex<BridgeData>>,
    emitter: Arc<Mutex<Option<EventEmitter>>>,
    serial: Arc<AsyncMutex<()>>,
}
impl StudioMcpBridge {
    pub fn status(&self) -> StudioMcpStatus {
        let mut data = self.data.lock().unwrap_or_else(|e| e.into_inner());
        data.sessions.expire(now_ms());
        data.status.connected_clients = data.sessions.0.len();
        data.status.client_names = data
            .sessions
            .0
            .values()
            .map(|(name, _)| name.clone())
            .collect();
        data.status.client_names.sort();
        data.status.available = data.ready && data.listening;
        data.status.clone()
    }
    fn emit_status(&self) {
        let status = self.status();
        let _ = self.emit(
            "ogs:mcp-status",
            serde_json::to_value(status).unwrap_or(Value::Null),
        );
    }
    fn fail(&self, error: String) {
        self.data
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .status
            .error = Some(error);
        self.emit_status();
    }
    pub fn attach_emitter(&self, emitter: EventEmitter) {
        *self.emitter.lock().unwrap_or_else(|e| e.into_inner()) = Some(emitter);
    }
    fn emit(&self, event: &str, payload: Value) -> Result<(), String> {
        let emitter = self
            .emitter
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone();
        emitter.ok_or("Studio window unavailable")?(event, payload)
    }
    pub async fn run(&self) {
        if let Err(error) = self.serve().await {
            self.fail(format!("Studio MCP: {error}"));
        }
    }
    pub fn ready(&self, ready: bool) {
        {
            let mut data = self.data.lock().unwrap_or_else(|e| e.into_inner());
            data.ready = ready;
            if !ready {
                for (_, sender) in data.pending.drain() {
                    let _ = sender.send(Err("Studio frontend disconnected".into()));
                }
                data.status.active_tool = None;
                data.status.error = None;
            }
        }
        self.emit_status();
    }
    pub fn complete(
        &self,
        id: &str,
        result: Option<Value>,
        error: Option<String>,
    ) -> Result<(), String> {
        {
            let mut data = self.data.lock().unwrap_or_else(|e| e.into_inner());
            let sender = data
                .pending
                .remove(id)
                .ok_or("Unknown or expired Studio request")?;
            // Sending under the same lock as removal closes the completion/deadline race.
            // A timed-out receiver is gone, but its frontend operation still completed.
            let _ = sender.send(match error.clone() {
                Some(error) => Err(error),
                None => Ok(result.unwrap_or(Value::Null)),
            });
            data.status.active_tool = None;
            data.status.last_activity = Some(now_ms());
            data.status.error = error;
        }
        self.emit_status();
        Ok(())
    }
    async fn serve(&self) -> Result<(), String> {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .map_err(|e| e.to_string())?;
        let endpoint = Endpoint {
            url: format!(
                "http://127.0.0.1:{}",
                listener.local_addr().map_err(|e| e.to_string())?.port()
            ),
            token: uuid::Uuid::new_v4().to_string(),
        };
        write_endpoint(&endpoint)?;
        let context = HttpContext {
            bridge: self.clone(),
            token: endpoint.token,
        };
        let router = bridge_router(context);
        self.data
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .listening = true;
        self.emit_status();
        let bridge = self.clone();
        let sweeper = tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_secs(1));
            loop {
                interval.tick().await;
                let changed = {
                    let mut data = bridge.data.lock().unwrap_or_else(|e| e.into_inner());
                    let before = data.sessions.0.len();
                    data.sessions.expire(now_ms());
                    before != data.sessions.0.len()
                };
                if changed {
                    bridge.emit_status();
                }
            }
        });
        let result = axum::serve(listener, router)
            .await
            .map_err(|e| e.to_string());
        sweeper.abort();
        self.data
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .listening = false;
        self.emit_status();
        result
    }
    async fn execute(&self, session: &str, tool: &str, arguments: Value) -> ToolResult {
        self.execute_until(
            session,
            tool,
            arguments,
            tokio::time::Instant::now() + Duration::from_secs(60),
        )
        .await
    }
    async fn execute_until(
        &self,
        session: &str,
        tool: &str,
        arguments: Value,
        deadline: tokio::time::Instant,
    ) -> ToolResult {
        if !allowed_tool(tool) {
            return Err("Unknown Studio tool".into());
        }
        if !arguments.is_object() {
            return Err("Tool arguments must be an object".into());
        }
        // Include queue waiting in the deadline; a disconnected client cannot leave an unbounded queue.
        let _serial = tokio::time::timeout_at(deadline, self.serial.lock())
            .await
            .map_err(|_| "Studio request queue timed out".to_string())?;
        let id = uuid::Uuid::new_v4().to_string();
        let (sender, mut receiver) = oneshot::channel();
        {
            let mut data = self.data.lock().unwrap_or_else(|e| e.into_inner());
            if !data.sessions.heartbeat(session, now_ms()) {
                return Err("Studio session expired".into());
            }
            if !data.ready || !data.listening {
                return Err("Studio frontend is not ready".into());
            }
            if !data.pending.is_empty() {
                return Err("Previous Studio request is still running; wait for frontend completion or restart the frontend".into());
            }
            data.status.active_tool = Some(tool.to_string());
            data.status.last_activity = Some(now_ms());
            data.status.error = None;
            data.pending.insert(id.clone(), sender);
        }
        self.emit_status();
        let emitted = self.emit(
            "ogs:mcp-request",
            json!({"id":id,"tool":tool,"arguments":arguments}),
        );
        let mut expired = false;
        let mut result = match emitted {
            Err(error) => Err(error),
            Ok(()) => match tokio::time::timeout_at(deadline, &mut receiver).await {
                Ok(Ok(result)) => result,
                Ok(Err(_)) => Err("Studio request cancelled".into()),
                Err(_) => {
                    expired = true;
                    Err("Studio frontend response timed out; operation may still be running. Do not repeat the operation".into())
                }
            },
        };
        {
            let mut data = self.data.lock().unwrap_or_else(|e| e.into_inner());
            if expired && !data.pending.contains_key(&id) {
                // complete() may have won just after the timer fired. Its send is
                // atomic with removal, so a completed result is already readable.
                if let Ok(completed) = receiver.try_recv() {
                    result = completed;
                }
            }
            if !expired || !data.pending.contains_key(&id) {
                data.pending.remove(&id);
                data.status.active_tool = None;
            }
            data.status.last_activity = Some(now_ms());
            data.status.error = result.as_ref().err().cloned();
        }
        self.emit_status();
        result
    }
}

#[derive(Clone)]
struct HttpContext {
    bridge: StudioMcpBridge,
    token: String,
}
fn bridge_router(context: HttpContext) -> Router {
    Router::new()
        .route("/connect", post(connect))
        .route("/heartbeat", post(heartbeat))
        .route("/disconnect", post(disconnect))
        .route("/call", post(call_tool))
        .layer(DefaultBodyLimit::max(MAX_BODY))
        .with_state(context)
}
type HttpResult = Result<Json<Value>, (StatusCode, Json<Value>)>;
fn http_error(status: StatusCode, message: &str) -> (StatusCode, Json<Value>) {
    (status, Json(json!({"error":message})))
}
fn check_auth(context: &HttpContext, headers: &HeaderMap) -> Result<(), (StatusCode, Json<Value>)> {
    if headers.contains_key("origin")
        || !authorized(
            &context.token,
            headers
                .get("authorization")
                .and_then(|value| value.to_str().ok()),
        )
    {
        Err(http_error(
            StatusCode::UNAUTHORIZED,
            "Unauthorized Studio bridge request",
        ))
    } else {
        Ok(())
    }
}
#[derive(Deserialize)]
struct ConnectRequest {
    #[serde(default)]
    name: String,
}
#[derive(Deserialize)]
struct SessionRequest {
    session: String,
}
#[derive(Deserialize)]
struct CallRequest {
    session: String,
    tool: String,
    #[serde(default = "empty_object")]
    arguments: Value,
}
fn empty_object() -> Value {
    json!({})
}
async fn connect(
    State(context): State<HttpContext>,
    headers: HeaderMap,
    Json(body): Json<ConnectRequest>,
) -> HttpResult {
    check_auth(&context, &headers)?;
    let id = {
        let mut data = context
            .bridge
            .data
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        if !data.ready || !data.listening {
            return Err(http_error(
                StatusCode::SERVICE_UNAVAILABLE,
                "Studio frontend is not ready",
            ));
        }
        data.sessions.expire(now_ms());
        if data.sessions.0.len() >= 64 {
            return Err(http_error(
                StatusCode::TOO_MANY_REQUESTS,
                "Studio session limit reached",
            ));
        }
        data.status.last_activity = Some(now_ms());
        data.sessions.connect(&body.name, now_ms())
    };
    context.bridge.emit_status();
    Ok(Json(json!({"session":id})))
}
async fn heartbeat(
    State(context): State<HttpContext>,
    headers: HeaderMap,
    Json(body): Json<SessionRequest>,
) -> HttpResult {
    check_auth(&context, &headers)?;
    let alive = context
        .bridge
        .data
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .sessions
        .heartbeat(&body.session, now_ms());
    if !alive {
        return Err(http_error(
            StatusCode::UNAUTHORIZED,
            "Studio session expired",
        ));
    }
    Ok(Json(json!({"ok":true})))
}
async fn disconnect(
    State(context): State<HttpContext>,
    headers: HeaderMap,
    Json(body): Json<SessionRequest>,
) -> HttpResult {
    check_auth(&context, &headers)?;
    context
        .bridge
        .data
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .sessions
        .disconnect(&body.session);
    context.bridge.emit_status();
    Ok(Json(json!({"ok":true})))
}
async fn call_tool(
    State(context): State<HttpContext>,
    headers: HeaderMap,
    Json(body): Json<CallRequest>,
) -> HttpResult {
    check_auth(&context, &headers)?;
    // Dropping the HTTP response future must not release the GUI execution gate.
    // A detached worker continues through completion or timeout/quarantine.
    let worker = tokio::spawn(async move {
        context
            .bridge
            .execute(&body.session, &body.tool, body.arguments)
            .await
    });
    match worker.await.map_err(|_| {
        http_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Studio request worker failed",
        )
    })? {
        Ok(result) => Ok(Json(json!({"result":result}))),
        Err(error) => Ok(Json(json!({"error":error}))),
    }
}

#[derive(Clone, Deserialize, Serialize)]
struct Endpoint {
    url: String,
    token: String,
}
fn endpoint_path() -> Result<PathBuf, String> {
    if let Some(path) = std::env::var_os("OGS_MCP_ENDPOINT_FILE") {
        return Ok(PathBuf::from(path));
    }
    Ok(dirs::config_dir()
        .ok_or("Cannot locate user config directory")?
        .join("foundation.openaec.opengeotechniekstudio")
        .join("studio-mcp.json"))
}
fn write_endpoint(endpoint: &Endpoint) -> Result<(), String> {
    let path = endpoint_path()?;
    write_endpoint_at(endpoint, &path)
}
fn write_endpoint_at(endpoint: &Endpoint, path: &std::path::Path) -> Result<(), String> {
    let parent = path
        .parent()
        .filter(|path| !path.as_os_str().is_empty())
        .ok_or("Endpoint path must include a directory")?;
    #[cfg(unix)]
    let parent_existed = parent.exists();
    std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    if !parent_existed {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(parent, std::fs::Permissions::from_mode(0o700))
            .map_err(|e| e.to_string())?;
    }
    let temp = parent.join(format!("studio-mcp-{}.tmp", uuid::Uuid::new_v4()));
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(&temp).map_err(|e| e.to_string())?;
    let result = (|| {
        file.write_all(&serde_json::to_vec(endpoint).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
        file.sync_all().map_err(|e| e.to_string())?;
        drop(file);
        // Windows rename does not replace an existing file. Remove only the known endpoint file.
        if path.exists() {
            std::fs::remove_file(&path).map_err(|e| e.to_string())?;
        }
        std::fs::rename(&temp, &path).map_err(|e| e.to_string())
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(temp);
    }
    result
}
fn read_endpoint() -> Result<Endpoint, String> {
    let path = endpoint_path()?;
    let metadata = std::fs::metadata(&path)
        .map_err(|_| "Open Studio first: no MCP endpoint found".to_string())?;
    if metadata.len() > 4096 {
        return Err("Invalid Studio endpoint file".into());
    }
    let endpoint: Endpoint =
        serde_json::from_slice(&std::fs::read(path).map_err(|e| e.to_string())?)
            .map_err(|_| "Invalid Studio endpoint file".to_string())?;
    if !valid_endpoint(&endpoint.url) || uuid::Uuid::parse_str(&endpoint.token).is_err() {
        return Err("Unsafe Studio endpoint configuration".into());
    }
    Ok(endpoint)
}

fn tool_definitions() -> Value {
    let definitions = [
        (
            "studio_get_state",
            "Read compact live Studio project state",
            json!({}),
            vec![],
        ),
        (
            "studio_new_project",
            "Create and activate a new Studio project",
            json!({"title":{"type":"string"}}),
            vec![],
        ),
        (
            "studio_open_file",
            "Open a local project or CPT in Studio",
            json!({"path":{"type":"string"}}),
            vec!["path"],
        ),
        (
            "studio_set_project_meta",
            "Update project metadata",
            json!({"patch":{"type":"object"}}),
            vec!["patch"],
        ),
        (
            "studio_add_calculation",
            "Add and select a vertical or lateral pile calculation, or a foundation advice report that bundles them",
            json!({"moduleId":{"type":"string","enum":["pile-bearing-capacity","laterally-loaded-pile","foundation-advice"]},"name":{"type":"string"},"input":{"type":"object"}}),
            vec![],
        ),
        (
            "studio_update_calculation",
            "Update an existing calculation",
            json!({"id":{"type":"string"},"patch":{"type":"object"}}),
            vec!["id", "patch"],
        ),
        (
            "studio_get_calculation",
            "Read a complete calculation and results",
            json!({"id":{"type":"string"}}),
            vec!["id"],
        ),
        (
            "studio_select_calculation",
            "Select a calculation in Studio and open a view: sheet, model, table (bearing capacity, optionally one sounding), print or settings",
            json!({"id":{"type":"string"},"view":{"type":"string","enum":["sheet","model","table","print","settings"]},"cptId":{"type":["string","null"]}}),
            vec!["id"],
        ),
        (
            "studio_get_capacity_table",
            "Read the bearing capacity table: Rc;net;d per sounding, pile size and toe level, with the shortest pile per size that reaches the search band and the level spread",
            json!({"id":{"type":"string"}}),
            vec!["id"],
        ),
        (
            "studio_export_report",
            "Write the PDF report of a calculation to an absolute .pdf path",
            json!({"id":{"type":"string"},"path":{"type":"string"}}),
            vec!["id", "path"],
        ),
        (
            "studio_save_project",
            "Save the project to an absolute path",
            json!({"path":{"type":"string"}}),
            vec!["path"],
        ),
        (
            "studio_get_cpt",
            "Read a complete opened CPT with measurements and diagnostics",
            json!({"id":{"type":"string"}}),
            vec!["id"],
        ),
        (
            "studio_select_document",
            "Activate an already opened Studio document",
            json!({"id":{"type":"string"}}),
            vec!["id"],
        ),
        (
            "studio_show_view",
            "Open a Studio view (ribbon tab): home, map, report, drawing, calculations, model3d (3D soil model from the project's CPTs) or ifc. Drawing and calculations only appear when their extension is enabled",
            json!({"view":{"type":"string","enum":["home","map","report","drawing","calculations","model3d","ifc"]}}),
            vec!["view"],
        ),
    ];
    Value::Array(definitions.into_iter().map(|(name, description, properties, required)| json!({"name":name,"description":description,"inputSchema":{"type":"object","properties":properties,"required":required,"additionalProperties":false}})).collect())
}

struct HeartbeatTask {
    task: tokio::task::JoinHandle<()>,
    needs_reconnect: Arc<AtomicBool>,
}
async fn heartbeat_once(client: &reqwest::Client, endpoint: &Endpoint, id: &str) -> bool {
    client
        .post(format!("{}/heartbeat", endpoint.url))
        .bearer_auth(&endpoint.token)
        .json(&json!({"session":id}))
        .timeout(Duration::from_secs(3))
        .send()
        .await
        .is_ok_and(|response| response.status().is_success())
}
fn spawn_heartbeat(
    client: reqwest::Client,
    endpoint: Endpoint,
    id: String,
    period: Duration,
) -> HeartbeatTask {
    let needs_reconnect = Arc::new(AtomicBool::new(false));
    let health = needs_reconnect.clone();
    let task = tokio::spawn(async move {
        loop {
            tokio::time::sleep(period).await;
            // Keep retrying after transient transport failures. A successful probe
            // confirms the current session; an expired one is reconnected before a tool.
            health.store(
                !heartbeat_once(&client, &endpoint, &id).await,
                Ordering::SeqCst,
            );
        }
    });
    HeartbeatTask {
        task,
        needs_reconnect,
    }
}
struct ProxySession {
    endpoint: Endpoint,
    id: String,
    heartbeat: HeartbeatTask,
}
struct StdioProxy {
    client: reqwest::Client,
    session: Option<ProxySession>,
    client_name: Option<String>,
}
impl StdioProxy {
    fn new() -> Result<Self, String> {
        let client = reqwest::Client::builder()
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .timeout(Duration::from_secs(65))
            .build()
            .map_err(|e| e.to_string())?;
        Ok(Self {
            client,
            session: None,
            client_name: None,
        })
    }
    async fn post(&self, endpoint: &Endpoint, route: &str, body: Value) -> Result<Value, String> {
        self.client
            .post(format!("{}{route}", endpoint.url))
            .bearer_auth(&endpoint.token)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Studio bridge connection failed: {e}"))?
            .error_for_status()
            .map_err(|e| format!("Studio bridge rejected request: {e}"))?
            .json()
            .await
            .map_err(|e| e.to_string())
    }
    async fn connect_session(&mut self, endpoint: Endpoint, name: String) -> Result<(), String> {
        let response = self
            .post(&endpoint, "/connect", json!({"name":name}))
            .await?;
        let id = response
            .get("session")
            .and_then(Value::as_str)
            .ok_or("Invalid Studio connection response")?
            .to_string();
        let heartbeat = spawn_heartbeat(
            self.client.clone(),
            endpoint.clone(),
            id.clone(),
            Duration::from_secs(5),
        );
        self.session = Some(ProxySession {
            endpoint,
            id,
            heartbeat,
        });
        Ok(())
    }
    async fn initialize(&mut self, params: &Value) -> Result<Value, String> {
        self.disconnect().await;
        let endpoint = read_endpoint()?;
        let name: String = params
            .pointer("/clientInfo/name")
            .and_then(Value::as_str)
            .unwrap_or("MCP client")
            .chars()
            .take(128)
            .collect();
        self.client_name = Some(name.clone());
        self.connect_session(endpoint, name).await?;
        Ok(
            json!({"protocolVersion":"2024-11-05","capabilities":{"tools":{"listChanged":false}},"serverInfo":{"name":"open-geotechniek-studio-live","version":env!("CARGO_PKG_VERSION")}}),
        )
    }
    async fn ensure_session(&mut self) -> Result<(), String> {
        let name = self
            .client_name
            .clone()
            .ok_or("Initialize Studio MCP before calling tools")?;
        let Some(session) = self.session.as_ref() else {
            return self.connect_session(read_endpoint()?, name).await;
        };
        // Probe immediately before every tool, including after system sleep. This
        // avoids relying on timers or wall-clock deltas while the process was suspended.
        let reconnect_needed = session.heartbeat.needs_reconnect.load(Ordering::SeqCst);
        if !reconnect_needed && heartbeat_once(&self.client, &session.endpoint, &session.id).await {
            session
                .heartbeat
                .needs_reconnect
                .store(false, Ordering::SeqCst);
            return Ok(());
        }
        session
            .heartbeat
            .needs_reconnect
            .store(true, Ordering::SeqCst);
        let endpoint = read_endpoint()?;
        self.disconnect().await;
        self.connect_session(endpoint, name).await
    }
    async fn disconnect(&mut self) {
        if let Some(session) = self.session.take() {
            session.heartbeat.task.abort();
            let _ = tokio::time::timeout(
                Duration::from_secs(2),
                self.post(
                    &session.endpoint,
                    "/disconnect",
                    json!({"session":session.id}),
                ),
            )
            .await;
        }
    }
    async fn request(&mut self, request: &Value) -> Option<Value> {
        if is_notification(request) {
            return None;
        }
        let id = request.get("id").cloned().unwrap_or(Value::Null);
        let method = request.get("method").and_then(Value::as_str).unwrap_or("");
        let params = request.get("params").cloned().unwrap_or(Value::Null);
        let result = match method {
            "initialize" => self.initialize(&params).await,
            "ping" => Ok(json!({})),
            "tools/list" => Ok(json!({"tools":tool_definitions()})),
            "tools/call" => {
                let tool = params.get("name").and_then(Value::as_str).unwrap_or("");
                let arguments = params
                    .get("arguments")
                    .cloned()
                    .unwrap_or_else(empty_object);
                if !allowed_tool(tool) {
                    Err("Unknown Studio tool".into())
                } else if let Err(error) = self.ensure_session().await {
                    Ok(json!({"content":[{"type":"text","text":error}],"isError":true}))
                } else if let Some(session) = self.session.as_ref() {
                    match self
                        .post(
                            &session.endpoint,
                            "/call",
                            json!({"session":session.id,"tool":tool,"arguments":arguments}),
                        )
                        .await
                    {
                        Ok(body) => {
                            let error = body.get("error").and_then(Value::as_str);
                            let content = if let Some(error) = error {
                                error.to_string()
                            } else {
                                serde_json::to_string(&body["result"]).unwrap_or_default()
                            };
                            Ok(
                                json!({"content":[{"type":"text","text":content}],"isError":error.is_some()}),
                            )
                        }
                        Err(error) => {
                            Ok(json!({"content":[{"type":"text","text":error}],"isError":true}))
                        }
                    }
                } else {
                    Err("Initialize Studio MCP before calling tools".into())
                }
            }
            _ => Err("Unknown MCP method".into()),
        };
        Some(match result {
            Ok(result) => json!({"jsonrpc":"2.0","id":id,"result":result}),
            Err(error) => {
                let code = match method {
                    "initialize" => -32000,
                    "tools/call" => -32602,
                    "tools/list" | "ping" => -32603,
                    _ => -32601,
                };
                json!({"jsonrpc":"2.0","id":id,"error":{"code":code,"message":error}})
            }
        })
    }
}

/// Stdio transport deliberately keeps all diagnostics off stdout.
pub fn run_stdio() {
    let runtime = match tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
    {
        Ok(runtime) => runtime,
        Err(error) => {
            eprintln!("Studio MCP runtime: {error}");
            return;
        }
    };
    let mut proxy = match StdioProxy::new() {
        Ok(proxy) => proxy,
        Err(error) => {
            eprintln!("Studio MCP client: {error}");
            return;
        }
    };
    let stdin = io::stdin();
    let mut input = stdin.lock();
    let mut output = io::stdout().lock();
    loop {
        // Read in bounded chunks without allocating an unbounded line.
        let mut line = Vec::new();
        let mut finished = false;
        loop {
            let buffer = match input.fill_buf() {
                Ok(buffer) => buffer,
                Err(_) => {
                    finished = true;
                    break;
                }
            };
            if buffer.is_empty() {
                finished = true;
                break;
            }
            let count = buffer
                .iter()
                .position(|byte| *byte == b'\n')
                .map_or(buffer.len(), |index| index + 1);
            let newline = buffer[count - 1] == b'\n';
            if line.len() + count > MAX_BODY {
                eprintln!("Studio MCP request exceeds size limit");
                runtime.block_on(proxy.disconnect());
                return;
            }
            line.extend_from_slice(&buffer[..count]);
            input.consume(count);
            if newline {
                break;
            }
        }
        if line.is_empty() || (finished && line.len() >= MAX_BODY) {
            break;
        }
        let response = match serde_json::from_slice::<Value>(&line) {
            Ok(request) => runtime.block_on(proxy.request(&request)),
            Err(_) => Some(
                json!({"jsonrpc":"2.0","id":null,"error":{"code":-32700,"message":"Invalid JSON request"}}),
            ),
        };
        if let Some(response) = response {
            if writeln!(output, "{response}")
                .and_then(|_| output.flush())
                .is_err()
            {
                break;
            }
        }
        if finished {
            break;
        }
    }
    runtime.block_on(proxy.disconnect());
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn authentication_requires_exact_bearer_token() {
        assert!(!authorized("secret", None));
        assert!(!authorized("secret", Some("Bearer wrong")));
        assert!(!authorized("secret", Some("secret")));
        assert!(authorized("secret", Some("Bearer secret")));
    }
    #[test]
    fn tool_allowlist_rejects_arbitrary_execution() {
        assert!(!allowed_tool("eval"));
        assert!(!allowed_tool("open_cpt"));
        assert!(allowed_tool("studio_get_state"));
        assert!(allowed_tool("studio_save_project"));
        assert!(allowed_tool("studio_get_capacity_table"));
        assert!(allowed_tool("studio_export_report"));
    }
    #[test]
    fn endpoints_allow_only_explicit_loopback_http_origin() {
        for url in [
            "https://127.0.0.1:1234",
            "http://localhost:1234",
            "http://192.168.1.1:1234",
            "http://127.0.0.1:1234/evil",
            "http://user@127.0.0.1:1234",
            "http://127.0.0.1:1234?x=y",
        ] {
            assert!(!valid_endpoint(url), "{url}");
        }
        assert!(valid_endpoint("http://127.0.0.1:1234"));
    }
    #[test]
    fn notifications_never_require_response() {
        assert!(is_notification(
            &json!({"jsonrpc":"2.0","method":"notifications/initialized"})
        ));
        assert!(is_notification(
            &json!({"jsonrpc":"2.0","method":"tools/list"})
        ));
        assert!(!is_notification(
            &json!({"jsonrpc":"2.0","method":"tools/list","id":1})
        ));
    }
    #[test]
    fn sessions_expire_and_disconnect_without_stale_clients() {
        let mut sessions = Sessions::default();
        let first = sessions.connect("Client A", 1000);
        let second = sessions.connect("Client B", 1000);
        assert_ne!(first, second);
        assert_eq!(sessions.0.len(), 2);
        assert!(sessions.heartbeat(&first, 16000));
        sessions.expire(21001);
        assert_eq!(sessions.0.len(), 1);
        assert!(!sessions.heartbeat(&second, 21002));
        sessions.disconnect(&first);
        assert!(sessions.0.is_empty());
    }
}

#[cfg(test)]
mod transport_tests {
    use super::*;
    #[cfg(unix)]
    #[test]
    fn endpoint_writer_preserves_existing_parent_permissions() {
        use std::os::unix::fs::PermissionsExt;
        let parent =
            std::env::temp_dir().join(format!("studio-mcp-permissions-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&parent).unwrap();
        std::fs::set_permissions(&parent, std::fs::Permissions::from_mode(0o755)).unwrap();
        let path = parent.join("studio-mcp.json");
        write_endpoint_at(
            &Endpoint {
                url: "http://127.0.0.1:1234".into(),
                token: uuid::Uuid::new_v4().to_string(),
            },
            &path,
        )
        .unwrap();
        assert_eq!(
            std::fs::metadata(&parent).unwrap().permissions().mode() & 0o777,
            0o755
        );
        assert_eq!(
            std::fs::metadata(&path).unwrap().permissions().mode() & 0o777,
            0o600
        );
        std::fs::remove_file(path).unwrap();
        std::fs::remove_dir(parent).unwrap();
    }
    #[test]
    fn frontend_event_roundtrip_preserves_correlation_and_tool_result() {
        let runtime = tokio::runtime::Runtime::new().unwrap();
        runtime.block_on(async {
            let bridge = StudioMcpBridge::default();
            let session = {
                let mut data = bridge.data.lock().unwrap();
                data.listening = true;
                data.sessions.connect("Test client", now_ms())
            };
            bridge.ready(true);
            let weak = Arc::downgrade(&bridge.data);
            bridge.attach_emitter(Arc::new(move |event, payload| {
                if event == "ogs:mcp-request" {
                    assert_eq!(payload["tool"], "studio_get_calculation");
                    assert_eq!(payload["arguments"], json!({"id":"calculation-123"}));
                    let id = payload["id"].as_str().unwrap();
                    let data = weak.upgrade().unwrap();
                    let mut data = data.lock().unwrap();
                    assert_eq!(
                        data.status.active_tool.as_deref(),
                        Some("studio_get_calculation")
                    );
                    assert!(data.pending.remove("wrong-correlation-id").is_none());
                    let sender = data.pending.remove(id).unwrap();
                    sender
                        .send(Ok(
                            json!({"id":"calculation-123","result":{"capacity":456}}),
                        ))
                        .unwrap();
                }
                Ok(())
            }));
            assert_eq!(
                bridge
                    .execute(
                        &session,
                        "studio_get_calculation",
                        json!({"id":"calculation-123"})
                    )
                    .await
                    .unwrap(),
                json!({"id":"calculation-123","result":{"capacity":456}})
            );
            let status = bridge.status();
            assert!(status.active_tool.is_none());
            assert!(status.last_activity.is_some());
            assert!(status.error.is_none());
            assert!(bridge.complete("wrong-correlation-id", None, None).is_err());
        });
    }
    #[test]
    fn actual_stdio_dispatch_silences_notifications_and_limits_tool_catalog() {
        let runtime = tokio::runtime::Runtime::new().unwrap();
        runtime.block_on(async {
            let mut proxy = StdioProxy::new().unwrap();
            assert!(proxy.request(&json!({"jsonrpc":"2.0","method":"notifications/initialized"})).await.is_none());
            assert!(proxy.request(&json!({"jsonrpc":"2.0","method":"tools/call","params":{"name":"studio_new_project"}})).await.is_none());
            let response = proxy.request(&json!({"jsonrpc":"2.0","id":7,"method":"tools/list"})).await.unwrap();
            let tools = response["result"]["tools"].as_array().unwrap();
            assert_eq!(tools.len(), 13);
            for name in ["studio_get_capacity_table", "studio_export_report"] {
                assert!(tools.iter().any(|tool| tool["name"] == name), "{name} ontbreekt in de toolcatalogus");
            }
            assert!(tools.iter().all(|tool| tool["name"].as_str().unwrap().starts_with("studio_")));
            let response = proxy.request(&json!({"jsonrpc":"2.0","id":8,"method":"tools/call","params":{"name":"eval"}})).await.unwrap();
            assert!(response.get("error").is_some());
        });
    }
    #[test]
    fn real_http_authentication_sessions_origin_and_payload_limits() {
        let runtime = tokio::runtime::Runtime::new().unwrap();
        runtime.block_on(async {
            let bridge = StudioMcpBridge::default();
            let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
            let base = format!("http://{}", listener.local_addr().unwrap());
            let router = bridge_router(HttpContext {
                bridge: bridge.clone(),
                token: "test-token".into(),
            });
            let server = tokio::spawn(async move { axum::serve(listener, router).await.unwrap() });
            let client = reqwest::Client::builder().no_proxy().build().unwrap();
            let endpoint = format!("{base}/connect");
            assert_eq!(
                client
                    .post(&endpoint)
                    .json(&json!({"name":"A"}))
                    .send()
                    .await
                    .unwrap()
                    .status(),
                StatusCode::UNAUTHORIZED
            );
            assert_eq!(
                client
                    .post(&endpoint)
                    .bearer_auth("wrong")
                    .json(&json!({"name":"A"}))
                    .send()
                    .await
                    .unwrap()
                    .status(),
                StatusCode::UNAUTHORIZED
            );
            assert_eq!(
                client
                    .post(&endpoint)
                    .bearer_auth("test-token")
                    .header("Origin", "https://example.com")
                    .json(&json!({"name":"A"}))
                    .send()
                    .await
                    .unwrap()
                    .status(),
                StatusCode::UNAUTHORIZED
            );
            assert_eq!(
                client
                    .post(&endpoint)
                    .bearer_auth("test-token")
                    .json(&json!({"name":"A"}))
                    .send()
                    .await
                    .unwrap()
                    .status(),
                StatusCode::SERVICE_UNAVAILABLE
            );
            {
                let mut data = bridge.data.lock().unwrap();
                data.listening = true;
                data.ready = true;
            }
            let body: Value = client
                .post(&endpoint)
                .bearer_auth("test-token")
                .json(&json!({"name":"A".repeat(200)}))
                .send()
                .await
                .unwrap()
                .json()
                .await
                .unwrap();
            let session = body["session"].as_str().unwrap();
            assert_eq!(bridge.status().connected_clients, 1);
            assert_eq!(bridge.status().client_names[0].len(), 128);
            assert_eq!(
                client
                    .post(format!("{base}/heartbeat"))
                    .bearer_auth("test-token")
                    .json(&json!({"session":session}))
                    .send()
                    .await
                    .unwrap()
                    .status(),
                StatusCode::OK
            );
            let rejected: Value = client
                .post(format!("{base}/call"))
                .bearer_auth("test-token")
                .json(&json!({"session":session,"tool":"eval","arguments":{}}))
                .send()
                .await
                .unwrap()
                .json()
                .await
                .unwrap();
            assert!(rejected["error"].as_str().unwrap().contains("Unknown"));
            assert_eq!(
                client
                    .post(&endpoint)
                    .bearer_auth("test-token")
                    .header("content-type", "application/json")
                    .body("x".repeat(MAX_BODY + 1))
                    .send()
                    .await
                    .unwrap()
                    .status(),
                StatusCode::PAYLOAD_TOO_LARGE
            );
            assert_eq!(
                client
                    .post(format!("{base}/disconnect"))
                    .bearer_auth("test-token")
                    .json(&json!({"session":session}))
                    .send()
                    .await
                    .unwrap()
                    .status(),
                StatusCode::OK
            );
            assert_eq!(bridge.status().connected_clients, 0);
            assert_eq!(
                client
                    .post(format!("{base}/heartbeat"))
                    .bearer_auth("test-token")
                    .json(&json!({"session":session}))
                    .send()
                    .await
                    .unwrap()
                    .status(),
                StatusCode::UNAUTHORIZED
            );
            server.abort();
        });
    }
}

#[cfg(test)]
mod recovery_tests {
    use super::*;
    #[test]
    fn heartbeat_retries_after_a_single_failed_response() {
        let runtime = tokio::runtime::Runtime::new().unwrap();
        runtime.block_on(async {
            use std::sync::atomic::{AtomicUsize, Ordering};
            let attempts = Arc::new(AtomicUsize::new(0));
            let observed = attempts.clone();
            let router = Router::new().route(
                "/heartbeat",
                post(move || {
                    let attempts = observed.clone();
                    async move {
                        if attempts.fetch_add(1, Ordering::SeqCst) == 0 {
                            StatusCode::SERVICE_UNAVAILABLE
                        } else {
                            StatusCode::OK
                        }
                    }
                }),
            );
            let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
            let endpoint = Endpoint {
                url: format!("http://{}", listener.local_addr().unwrap()),
                token: uuid::Uuid::new_v4().to_string(),
            };
            let server = tokio::spawn(async move { axum::serve(listener, router).await.unwrap() });
            let heartbeat = spawn_heartbeat(
                reqwest::Client::builder().no_proxy().build().unwrap(),
                endpoint,
                "session".into(),
                Duration::from_millis(5),
            );
            tokio::time::sleep(Duration::from_millis(150)).await;
            let still_running = !heartbeat.task.is_finished();
            heartbeat.task.abort();
            server.abort();
            assert!(
                still_running,
                "Heartbeat stopped permanently after a temporary failure"
            );
            assert!(attempts.load(Ordering::SeqCst) >= 2);
        });
    }

    #[test]
    fn timed_out_frontend_request_remains_busy_until_late_completion() {
        let runtime = tokio::runtime::Runtime::new().unwrap();
        runtime.block_on(async {
            let bridge = StudioMcpBridge::default();
            let session = {
                let mut data = bridge.data.lock().unwrap();
                data.listening = true;
                data.sessions.connect("Client", now_ms())
            };
            bridge.ready(true);
            let requests = Arc::new(Mutex::new(Vec::new()));
            let recorded = requests.clone();
            bridge.attach_emitter(Arc::new(move |event, payload| {
                if event == "ogs:mcp-request" {
                    recorded.lock().unwrap().push(payload);
                }
                Ok(())
            }));
            let result = bridge
                .execute_until(
                    &session,
                    "studio_open_file",
                    json!({"path":"/sample.ifcgeo"}),
                    tokio::time::Instant::now() + Duration::from_millis(10),
                )
                .await;
            assert!(result.is_err());
            assert_eq!(
                bridge.status().active_tool.as_deref(),
                Some("studio_open_file")
            );
            let blocked = bridge
                .execute_until(
                    &session,
                    "studio_new_project",
                    json!({}),
                    tokio::time::Instant::now() + Duration::from_millis(10),
                )
                .await;
            assert!(blocked.unwrap_err().contains("still running"));
            assert_eq!(requests.lock().unwrap().len(), 1);
            let id = requests.lock().unwrap()[0]["id"]
                .as_str()
                .unwrap()
                .to_string();
            assert!(bridge
                .complete(&id, Some(json!({"opened":true})), None)
                .is_ok());
            assert!(bridge.status().active_tool.is_none());
            let weak = Arc::downgrade(&bridge.data);
            bridge.attach_emitter(Arc::new(move |event, payload| {
                if event == "ogs:mcp-request" {
                    let data = weak.upgrade().unwrap();
                    let sender = data
                        .lock()
                        .unwrap()
                        .pending
                        .remove(payload["id"].as_str().unwrap())
                        .unwrap();
                    let _ = sender.send(Ok(json!({"created":true})));
                }
                Ok(())
            }));
            assert_eq!(
                bridge
                    .execute(&session, "studio_new_project", json!({}))
                    .await
                    .unwrap(),
                json!({"created":true})
            );
        });
    }
    #[test]
    fn frontend_reinitialization_releases_timed_out_request() {
        let runtime = tokio::runtime::Runtime::new().unwrap();
        runtime.block_on(async {
            let bridge = StudioMcpBridge::default();
            let session = {
                let mut data = bridge.data.lock().unwrap();
                data.listening = true;
                data.sessions.connect("Client", now_ms())
            };
            bridge.ready(true);
            bridge.attach_emitter(Arc::new(|_, _| Ok(())));
            let _ = bridge
                .execute_until(
                    &session,
                    "studio_open_file",
                    json!({}),
                    tokio::time::Instant::now() + Duration::from_millis(10),
                )
                .await;
            bridge.ready(false);
            bridge.ready(true);
            assert!(bridge.status().active_tool.is_none());
            assert!(bridge.data.lock().unwrap().pending.is_empty());
        });
    }
    #[test]
    fn proxy_recovers_expired_live_session_before_next_tool_without_replaying_calls() {
        let runtime = tokio::runtime::Runtime::new().unwrap();
        runtime.block_on(async {
            let bridge=StudioMcpBridge::default();
            bridge.data.lock().unwrap().listening=true;
            bridge.ready(true);
            let weak=Arc::downgrade(&bridge.data);
            let seen=Arc::new(Mutex::new(0));let seen_emitter=seen.clone();
            bridge.attach_emitter(Arc::new(move|event,payload| {
                if event=="ogs:mcp-request" {
                    *seen_emitter.lock().unwrap()+=1;
                    let data=weak.upgrade().unwrap();
                    let sender=data.lock().unwrap().pending.remove(payload["id"].as_str().unwrap()).unwrap();
                    let _=sender.send(Ok(json!({"ok":true})));
                }
                Ok(())
            }));
            let listener=tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
            let endpoint=Endpoint{url:format!("http://{}",listener.local_addr().unwrap()),token:uuid::Uuid::new_v4().to_string()};
            let router=bridge_router(HttpContext{bridge:bridge.clone(),token:endpoint.token.clone()});
            let server=tokio::spawn(async move{axum::serve(listener,router).await.unwrap()});
            let directory=std::env::temp_dir().join(format!("studio-recovery-{}",uuid::Uuid::new_v4()));
            std::fs::create_dir(&directory).unwrap();
            let endpoint_file=directory.join("studio-mcp.json");write_endpoint_at(&endpoint,&endpoint_file).unwrap();
            let previous=std::env::var_os("OGS_MCP_ENDPOINT_FILE");std::env::set_var("OGS_MCP_ENDPOINT_FILE",&endpoint_file);
            let mut proxy=StdioProxy::new().unwrap();
            proxy.initialize(&json!({"clientInfo":{"name":"Recovered client"}})).await.unwrap();
            let old=proxy.session.as_ref().unwrap().id.clone();
            bridge.data.lock().unwrap().sessions.disconnect(&old);
            let response=proxy.request(&json!({"id":1,"method":"tools/call","params":{"name":"studio_new_project","arguments":{}}})).await.unwrap();
            let names=bridge.status().client_names;
            let expired=proxy.session.as_ref().unwrap().id.clone();
            bridge.data.lock().unwrap().sessions.disconnect(&expired);
            write_endpoint_at(&Endpoint{url:endpoint.url.clone(),token:uuid::Uuid::new_v4().to_string()},&endpoint_file).unwrap();
            let failed=proxy.request(&json!({"id":2,"method":"tools/call","params":{"name":"studio_new_project","arguments":{}}})).await.unwrap();
            write_endpoint_at(&endpoint,&endpoint_file).unwrap();
            let resumed=proxy.request(&json!({"id":3,"method":"tools/call","params":{"name":"studio_new_project","arguments":{}}})).await.unwrap();
            proxy.disconnect().await;
            if let Some(previous)=previous{std::env::set_var("OGS_MCP_ENDPOINT_FILE",previous)}else{std::env::remove_var("OGS_MCP_ENDPOINT_FILE")}
            std::fs::remove_file(endpoint_file).unwrap();std::fs::remove_dir(directory).unwrap();server.abort();
            assert_eq!(response["result"]["isError"],false);
            assert_eq!(names,vec!["Recovered client"]);
            assert_eq!(failed["result"]["isError"],true);
            assert_eq!(resumed["result"]["isError"],false);
            assert_eq!(*seen.lock().unwrap(),2);
        });
    }
}

#[cfg(test)]
mod cancellation_tests {
    use super::*;
    #[test]
    fn dropping_http_response_does_not_release_frontend_execution_gate() {
        let runtime = tokio::runtime::Runtime::new().unwrap();
        runtime.block_on(async {
            let bridge = StudioMcpBridge::default();
            let session = {
                let mut data = bridge.data.lock().unwrap();
                data.listening = true;
                data.sessions.connect("Client", now_ms())
            };
            bridge.ready(true);
            let (sent, mut received) = tokio::sync::mpsc::unbounded_channel();
            bridge.attach_emitter(Arc::new(move |event, payload| {
                if event == "ogs:mcp-request" {
                    sent.send(payload).unwrap();
                }
                Ok(())
            }));
            let mut headers = HeaderMap::new();
            headers.insert("authorization", "Bearer token".parse().unwrap());
            let response = tokio::spawn(call_tool(
                State(HttpContext {
                    bridge: bridge.clone(),
                    token: "token".into(),
                }),
                headers,
                Json(CallRequest {
                    session,
                    tool: "studio_open_file".into(),
                    arguments: json!({}),
                }),
            ));
            let request = received.recv().await.unwrap();
            response.abort();
            let _ = response.await;
            tokio::task::yield_now().await;
            assert!(
                bridge.serial.try_lock().is_err(),
                "HTTP cancellation released the execution lock"
            );
            assert_eq!(
                bridge.status().active_tool.as_deref(),
                Some("studio_open_file")
            );
            bridge
                .complete(
                    request["id"].as_str().unwrap(),
                    Some(json!({"done":true})),
                    None,
                )
                .unwrap();
            drop(
                tokio::time::timeout(Duration::from_secs(1), bridge.serial.lock())
                    .await
                    .unwrap(),
            );
            assert!(bridge.status().active_tool.is_none());
        });
    }
    #[test]
    fn completion_at_deadline_never_leaves_a_stale_quarantine() {
        let runtime = tokio::runtime::Runtime::new().unwrap();
        runtime.block_on(async {
            for delay in [4, 5, 6] {
                let bridge = StudioMcpBridge::default();
                let session = {
                    let mut data = bridge.data.lock().unwrap();
                    data.listening = true;
                    data.sessions.connect("Client", now_ms())
                };
                bridge.ready(true);
                let completer = bridge.clone();
                let task = Arc::new(Mutex::new(None));
                let spawned = task.clone();
                bridge.attach_emitter(Arc::new(move |event, payload| {
                    if event == "ogs:mcp-request" {
                        let completer = completer.clone();
                        let id = payload["id"].as_str().unwrap().to_string();
                        *spawned.lock().unwrap() = Some(tokio::spawn(async move {
                            tokio::time::sleep(Duration::from_millis(delay)).await;
                            completer.complete(&id, Some(json!({"done":true})), None)
                        }));
                    }
                    Ok(())
                }));
                let _ = bridge
                    .execute_until(
                        &session,
                        "studio_new_project",
                        json!({}),
                        tokio::time::Instant::now() + Duration::from_millis(5),
                    )
                    .await;
                let task = task.lock().unwrap().take().unwrap();
                assert!(task.await.unwrap().is_ok());
                assert!(bridge.data.lock().unwrap().pending.is_empty());
                assert!(bridge.status().active_tool.is_none());
                assert!(bridge.serial.try_lock().is_ok());
                bridge.attach_emitter(Arc::new(|_, _| Ok(())));
            }
        });
    }
}
