use super::studio_mcp::{StudioMcpBridge, StudioMcpStatus};
use serde_json::Value;
use std::sync::Arc;
use tauri::Emitter;

pub fn start(app: tauri::AppHandle, bridge: StudioMcpBridge) {
    bridge.attach_emitter(Arc::new(move |event, payload| {
        app.emit_to("main", event, payload)
            .map_err(|error| error.to_string())
    }));
    tauri::async_runtime::spawn(async move {
        bridge.run().await;
    });
}

#[tauri::command]
pub fn get_studio_mcp_status(state: tauri::State<'_, StudioMcpBridge>) -> StudioMcpStatus {
    state.status()
}
#[tauri::command]
pub fn studio_mcp_ready(ready: bool, state: tauri::State<'_, StudioMcpBridge>) {
    state.ready(ready);
}
#[tauri::command]
pub fn complete_studio_mcp_request(
    id: String,
    result: Option<Value>,
    error: Option<String>,
    state: tauri::State<'_, StudioMcpBridge>,
) -> Result<(), String> {
    state.complete(&id, result, error)
}
