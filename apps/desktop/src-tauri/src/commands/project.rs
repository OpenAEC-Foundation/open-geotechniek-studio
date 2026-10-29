//! Project save / open commands using the `.ifcgis` JSON container.
//!
//! Elke functie bestaat in twee varianten (`*_core` voor Rust-aanroepers
//! incl. MCP, en `#[tauri::command]` als wrapper voor de frontend) zodat
//! GUI en MCP-server dezelfde implementatie delen.

use std::path::PathBuf;
use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use tauri::State;

use cpt_core::{Cpt, ifcgis};

use crate::state::AppState;

#[derive(Debug, Deserialize, Serialize)]
pub struct ProjectMetaInput {
    pub title: String,
    pub client: String,
    pub location: String,
    pub project_number: String,
    pub author: String,
    pub date: String, // ISO 8601
}

#[derive(Debug, Serialize)]
pub struct ProjectOpenResult {
    pub project: ProjectMetaInput,
    pub cpts: Vec<serde_json::Value>,
}

fn parse_date(s: &str) -> NaiveDate {
    NaiveDate::parse_from_str(s, "%Y-%m-%d")
        .unwrap_or_else(|_| chrono::Local::now().date_naive())
}

// ─── Core implementations ──────────────────────────────────────────

pub fn save_project_ifcgis_core(
    project: ProjectMetaInput,
    path: &str,
    state: &AppState,
) -> Result<(), String> {
    let cpts: Vec<Cpt> = state.cpts.lock().unwrap().values().cloned().collect();
    let info = ifcgis::ProjectInfo {
        kind: "OpenGeoProject".into(),
        title: project.title,
        client: project.client,
        location: project.location,
        project_number: project.project_number,
        author: project.author,
        date: parse_date(&project.date),
    };
    let text = ifcgis::save(info, cpts).map_err(|e| e.to_string())?;
    let mut value:serde_json::Value=serde_json::from_str(&text).map_err(|e|e.to_string())?;
    value["header"]["metadata"]["openGeoStudio"]["cpts"]=serde_json::json!(crate::commands::cpt::list_snapshots_core(state));
    let text=serde_json::to_string_pretty(&value).map_err(|e|e.to_string())?;
    std::fs::write(PathBuf::from(path), text).map_err(|e| e.to_string())
}

pub fn open_project_ifcgis_core(path: &str, state: &AppState) -> Result<ProjectOpenResult, String> {
    let text = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    let file = ifcgis::load(&text).map_err(|e| e.to_string())?;
    let raw:serde_json::Value=serde_json::from_str(&text).map_err(|e|e.to_string())?;
    let payload=raw.pointer("/header/metadata/openGeoStudio").cloned().unwrap_or(raw);

    let mut cpts_map = state.cpts.lock().unwrap();
    for cpt in &file.cpts {
        let original=payload.get("cpts").and_then(|v|v.as_array()).and_then(|values|values.iter().find(|value|value.get("id").and_then(|id|id.as_str())==Some(cpt.id.as_str()))).cloned().unwrap_or(serde_json::to_value(cpt).map_err(|e|e.to_string())?);
        state.cpt_snapshots.lock().unwrap().insert(cpt.id.clone(),original);
        cpts_map.insert(cpt.id.clone(), cpt.clone());
    }

    Ok(ProjectOpenResult {
        project: ProjectMetaInput {
            title: file.project.title,
            client: file.project.client,
            location: file.project.location,
            project_number: file.project.project_number,
            author: file.project.author,
            date: file.project.date.to_string(),
        },
        cpts: payload.get("cpts").and_then(|v|v.as_array()).cloned().unwrap_or_default(),
    })
}

pub fn save_project_ifcgis_full_core(payload: serde_json::Value, path: &str) -> Result<(), String> {
    let text=preview_project_ifcx_core(payload)?;
    std::fs::write(PathBuf::from(path), text).map_err(|e| e.to_string())
}

pub fn preview_project_ifcx_core(payload: serde_json::Value) -> Result<String, String> {
    // Validate the known schema, but retain the complete source payload in the
    // editable IFCX header. Typed rendering entities must not own the source data.
    let file: ifcgis::ProjectFile = serde_json::from_value(payload.clone())
        .map_err(|e| format!("invalid ifcgis payload: {e}"))?;
    let text=ifcgis::to_ifcx_json(&file).map_err(|e|format!("ifcgis serialize: {e}"))?;
    let mut value:serde_json::Value=serde_json::from_str(&text).map_err(|e|e.to_string())?;
    value["header"]["metadata"]["openGeoStudio"]=payload;
    serde_json::to_string_pretty(&value).map_err(|e|e.to_string())
}

pub fn open_project_ifcgis_full_core(
    path: &str,
    state: &AppState,
) -> Result<serde_json::Value, String> {
    let text = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    let file = ifcgis::load(&text).map_err(|e| e.to_string())?;
    let raw:serde_json::Value=serde_json::from_str(&text).map_err(|e|e.to_string())?;
    let payload=raw.pointer("/header/metadata/openGeoStudio").cloned().unwrap_or(raw);
    let mut cpts_map = state.cpts.lock().unwrap();
    for cpt in &file.cpts {
        let original=payload.get("cpts").and_then(|v|v.as_array()).and_then(|values|values.iter().find(|value|value.get("id").and_then(|id|id.as_str())==Some(cpt.id.as_str()))).cloned().unwrap_or(serde_json::to_value(cpt).map_err(|e|e.to_string())?);
        state.cpt_snapshots.lock().unwrap().insert(cpt.id.clone(),original);
        cpts_map.insert(cpt.id.clone(), cpt.clone());
    }
    drop(cpts_map);
    Ok(payload)
}

// ─── Tauri command wrappers ────────────────────────────────────────

/// Save the current AppState (project meta + loaded CPTs) to `path` as `.ifcgis`.
#[tauri::command]
pub fn save_project_ifcgis(
    project: ProjectMetaInput,
    path: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    save_project_ifcgis_core(project, &path, state.inner())
}

/// Open a `.ifcgis` file: parse, MERGE the file's CPTs into AppState's CPT
/// cache (additive — does NOT clear), and return both the project metadata
/// and the CPTs so the frontend can update its store in one round-trip.
#[tauri::command]
pub fn open_project_ifcgis(
    path: String,
    state: State<'_, AppState>,
) -> Result<ProjectOpenResult, String> {
    open_project_ifcgis_core(&path, state.inner())
}

/// Full-fidelity save — frontend bouwt het complete ifcgis JSON payload
/// (inclusief bores, tekening-layout, title-block, crs, gis, deliverable).
#[tauri::command]
pub fn save_project_ifcgis_full(
    payload: serde_json::Value,
    path: String,
) -> Result<(), String> {
    save_project_ifcgis_full_core(payload, &path)
}

/// IFCX-preview: convert dezelfde payload als save naar de strict
/// IFCX-JSON representatie (IFC5 alpha) zonder naar schijf te schrijven.
#[tauri::command]
pub fn preview_project_ifcx(payload: serde_json::Value) -> Result<String, String> {
    preview_project_ifcx_core(payload)
}

/// Full-fidelity open — leest een `.ifcgis` van schijf, valideert tegen
/// het schema, mergeed de CPTs in de Rust-cache, en geeft het complete
/// JSON document terug aan de frontend.
#[tauri::command]
pub fn open_project_ifcgis_full(
    path: String,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    open_project_ifcgis_full_core(&path, state.inner())
}


#[cfg(test)]
mod source_fidelity_tests {
    use super::*;
    #[test]
    fn full_project_source_survives_ifcx_save_and_native_reopen() {
        let cpt=serde_json::json!({"id":"PROJECT-CPT","metadata":{"source_file":"source.gef","pre_excavated_depth_m":0.5},"points":[{"depth":1,"qc":2,"parameters":{"future":42}}]});
        let payload=serde_json::json!({"header":{"schema":"ifcgis-0.4","originating_system":"Open Geotechniek Studio","timestamp":"2026-10-29T00:00:00Z"},"project":{"type":"OpenGeoProject","title":"Synthetic","client":"","location":"","project_number":"","author":"","date":"2026-10-29"},"cpts":[cpt.clone()],"bores":[],"futureProjectField":{"retain":true},"calculations":[]});
        let preview:serde_json::Value=serde_json::from_str(&preview_project_ifcx_core(payload.clone()).unwrap()).unwrap();
        assert_eq!(preview.pointer("/header/metadata/openGeoStudio").unwrap(),&payload);
        let nonce=std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos();
        let path=std::env::temp_dir().join(format!("ogs-project-{}-{nonce}.ifcx",std::process::id()));
        save_project_ifcgis_full_core(payload.clone(),path.to_str().unwrap()).unwrap();
        let state=AppState::default();
        let opened=open_project_ifcgis_full_core(path.to_str().unwrap(),&state).unwrap();
        std::fs::remove_file(path).unwrap();
        assert_eq!(opened,payload);
        assert_eq!(crate::commands::cpt::cpt_snapshot_core("PROJECT-CPT",&state).unwrap(),cpt);
    }
}
