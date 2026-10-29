//! Refresh the browser calculation reference from the native engine.
//! cargo run --example browser_core_reference -- ../src/utils/__fixtures__/native-core.json
fn main() {
    let output = std::env::args().nth(1).expect("output fixture path");
    let cpt: cpt_core::Cpt = serde_json::from_value(serde_json::json!({
        "id": "native-reference", "metadata": {"source_file":"reference.gef", "ground_level_nap":2.0},
        "points": [
            {"depth":0.0,"qc":8.0,"fs":0.1,"rf":0.7,"u2":0.1},
            {"depth":1.0,"qc":8.0,"fs":0.3,"rf":0.7,"u2":1.2},
            {"depth":1.02,"qc":1.0,"fs":0.05,"rf":3.0},
            {"depth":1.04,"qc":1.0,"fs":0.05,"rf":3.0},
            {"depth":2.0,"qc":8.0,"fs":0.2,"rf":0.7,"u2":0.5},
            {"depth":10.0,"qc":30.0,"fs":0.25,"rf":10.0,"u2":1.0}
        ]
    })).unwrap();
    let fixture = serde_json::json!({"cpt": cpt, "layers":cpt_core::detect_layers(&cpt),"svg":cpt_core::render_cpt_svg(&cpt)});
    std::fs::write(output, serde_json::to_string_pretty(&fixture).unwrap()).unwrap();
}
