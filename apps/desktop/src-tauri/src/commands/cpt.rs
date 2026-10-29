//! CPT file open + parse commands.
//!
//! Elke functie bestaat in twee varianten:
//!   - `*_core(...&AppState)` — pure-Rust functie die zowel vanuit een
//!     Tauri-command-wrapper als vanuit de MCP-server kan worden aangeroepen
//!   - `#[tauri::command] *_cmd(...State<'_, AppState>)` — dunne wrapper
//!     die `state.inner()` doorgeeft aan `*_core`
//!
//! Dit pattern voorkomt duplicatie tussen GUI- en MCP-modes: één
//! implementatie, twee aanroep-vormen.

use tauri::State;
use cpt_core::{detect_layers as core_detect_layers, write, Cpt, Layer};
use crate::state::AppState;

// ─── Core implementations (state als &AppState) ────────────────────

pub fn open_cpt_core(content: &str, filename: &str, state: &AppState) -> Result<Cpt, String> {
    let lower = filename.to_lowercase();
    // Raw legacy parsing shifted invalid numeric columns and could silently lose
    // measurements. GUI imports already pass a snapshot from the shared diagnostic
    // parser. External consumers must use the supported Node core first as well.
    if !lower.ends_with(".ifcgeo") {
        return Err("Legacy raw GEF/BRO import is disabled: parse with the diagnostic Node core or desktop importer, then submit the CPT JSON snapshot with filename ending in .ifcgeo. See docs/API.md.".to_string());
    }
    let mut snapshot: serde_json::Value = serde_json::from_str(content).map_err(|e|e.to_string())?;
    let mut cpt = write::read_ifcgeo(content).map_err(|e| e.to_string())?;
    if cpt.id.trim().is_empty() || cpt.points.is_empty() || cpt.points.iter().any(|point| !point.depth.is_finite() || point.depth < 0.0) {
        return Err("Invalid CPT snapshot: require an id and non-empty points with finite non-negative depths".to_string());
    }
    if !lower.ends_with(".ifcgeo") || cpt.metadata.source_file.is_empty() {
        cpt.metadata.source_file = filename.to_string();
    }
    snapshot["metadata"]["source_file"]=serde_json::json!(cpt.metadata.source_file);
    state.cpt_snapshots.lock().unwrap().insert(cpt.id.clone(), snapshot);
    state.cpts.lock().unwrap().insert(cpt.id.clone(), cpt.clone());
    Ok(cpt)
}

pub fn close_cpt_core(id: &str, state: &AppState) -> Result<(), String> {
    state.cpts.lock().unwrap().remove(id);
    state.cpt_snapshots.lock().unwrap().remove(id);
    Ok(())
}

pub fn list_cpts_core(state: &AppState) -> Vec<Cpt> {
    state.cpts.lock().unwrap().values().cloned().collect()
}

pub fn cpt_snapshot_core(id: &str, state: &AppState) -> Result<serde_json::Value, String> {
    if let Some(value)=state.cpt_snapshots.lock().unwrap().get(id).cloned(){return Ok(value);}
    let cpts=state.cpts.lock().unwrap();
    let value=cpts.get(id).ok_or_else(||format!("unknown CPT id: {id}"))?;
    serde_json::to_value(value).map_err(|e|e.to_string())
}
pub fn list_snapshots_core(state: &AppState) -> Vec<serde_json::Value> {
    let ids:Vec<String>=state.cpts.lock().unwrap().keys().cloned().collect();
    ids.iter().filter_map(|id|cpt_snapshot_core(id,state).ok()).collect()
}

pub fn detect_layers_core(id: &str, state: &AppState) -> Result<Vec<Layer>, String> {
    let cpts = state.cpts.lock().unwrap();
    let cpt = cpts.get(id).ok_or_else(|| format!("unknown CPT id: {id}"))?;
    Ok(core_detect_layers(cpt))
}

/// Export the CPT identified by `cpt_id` to disk in `format` ("gef" |
/// "bro" | "ifcgeo"). Path is the absolute target path.
pub fn save_cpt_as_core(
    cpt_id: &str,
    format: &str,
    path: &str,
    state: &AppState,
) -> Result<(), String> {
    if format=="ifcgeo" {
        let value=cpt_snapshot_core(cpt_id,state)?;
        let text=serde_json::to_string_pretty(&value).map_err(|e|e.to_string())?;
        return std::fs::write(path,text).map_err(|e|format!("write {path}: {e}"));
    }
    let cpts = state.cpts.lock().unwrap();
    let cpt = cpts
        .get(cpt_id)
        .ok_or_else(|| format!("unknown CPT id: {cpt_id}"))?;
    let text = match format {
        "gef" => return Err("Legacy GEF export is disabled. Use the shared desktop exporter or exportGef in @openaec/geotechniek-core to retain source columns and validated depth/CRS metadata.".to_string()),
        "bro" | "xml" => write::write_bro_xml(cpt),
        "ifcgeo" => write::write_ifcgeo(cpt).map_err(|e| e.to_string())?,
        other => return Err(format!("unsupported format: {other}")),
    };
    std::fs::write(path, text).map_err(|e| format!("write {path}: {e}"))
}

// ─── Tauri command wrappers ────────────────────────────────────────

#[tauri::command]
pub fn open_cpt(content: String, filename: String, state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let value=open_cpt_core(&content, &filename, state.inner())?;
    cpt_snapshot_core(&value.id,state.inner())
}

#[tauri::command]
pub fn close_cpt(id: String, state: State<'_, AppState>) -> Result<(), String> {
    close_cpt_core(&id, state.inner())
}

#[tauri::command]
pub fn list_cpts(state: State<'_, AppState>) -> Vec<serde_json::Value> {
    list_snapshots_core(state.inner())
}

#[tauri::command]
pub fn detect_layers(id: String, state: State<'_, AppState>) -> Result<Vec<Layer>, String> {
    detect_layers_core(&id, state.inner())
}

/// Tauri-wrapper. De caller (TS code via @tauri-apps/plugin-dialog) is
/// verantwoordelijk voor het kiezen van het target-pad.
#[tauri::command]
pub fn save_cpt_as(
    cpt_id: String,
    format: String,
    path: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    save_cpt_as_core(&cpt_id, &format, &path, state.inner())
}


#[cfg(test)]
mod diagnostic_import_tests {
    use super::*;
    #[test]
    fn rejects_legacy_raw_import_without_caching_partial_data() {
        let state = AppState::default();
        let result = open_cpt_core("#GEFID=1,0,0\n#EOH=\n1 bad .02", "unsafe.gef", &state);
        assert!(result.unwrap_err().contains("diagnostic Node core"));
        assert!(state.cpts.lock().unwrap().is_empty());
    }
    #[test]
    fn accepts_a_snapshot_from_the_shared_importer() {
        let state = AppState::default();
        let source = r#"{"id":"SYNTHETIC","metadata":{"source_file":"original.gef"},"points":[{"depth":1,"qc":2,"fs":0.02}]}"#;
        let value = open_cpt_core(source, "validated.ifcgeo", &state).unwrap();
        assert_eq!(value.metadata.source_file, "original.gef");
        assert_eq!(value.points[0].qc, Some(2.0));
    }
    #[test]
    fn full_snapshot_fields_survive_native_cache_and_file_roundtrip() {
        let state=AppState::default();
        let source=serde_json::json!({"id":"FULL","metadata":{"source_file":"original.gef","pre_excavated_depth_m":0.5,"measurements":[{"name":"coneSurfaceArea","value":1000,"unit":"mm2"}]},"points":[{"depth":1,"qc":2,"parameters":{"99":42,"future":null},"pre_excavated":true}],"future":{"keep":true}});
        open_cpt_core(&source.to_string(),"full.ifcgeo",&state).unwrap();
        assert_eq!(cpt_snapshot_core("FULL",&state).unwrap(),source);
        assert_eq!(list_snapshots_core(&state),vec![source.clone()]);
        let nonce=std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos();
        let path=std::env::temp_dir().join(format!("ogs-full-snapshot-{}-{nonce}.ifcgeo",std::process::id()));
        save_cpt_as_core("FULL","ifcgeo",path.to_str().unwrap(),&state).unwrap();
        let read:serde_json::Value=serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
        std::fs::remove_file(path).unwrap();
        assert_eq!(read,source);
        close_cpt_core("FULL",&state).unwrap();
        assert!(cpt_snapshot_core("FULL",&state).is_err());
        assert!(state.cpt_snapshots.lock().unwrap().is_empty());
    }

}
