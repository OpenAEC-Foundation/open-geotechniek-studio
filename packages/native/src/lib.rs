//! Stable C ABI for snapshot validation and 1D settlement. No GUI or Tauri dependency.
use serde_json::{json, Value};
use std::ffi::{c_char, CString};
static VERSION: &[u8] = concat!(env!("CARGO_PKG_VERSION"), "\0").as_bytes();
#[no_mangle]
pub extern "C" fn ogs_core_version() -> *const c_char {
    VERSION.as_ptr().cast()
}
pub fn execute(request: &Value) -> Result<Value, String> {
    let input = &request["input"];
    match request["operation"].as_str() {
        Some("settlement") => {
            let read = |key: &str| {
                input[key]
                    .as_f64()
                    .filter(|v| v.is_finite())
                    .ok_or_else(|| format!("Missing finite number: {key}"))
            };
            let h = read("thicknessM")?;
            let q = read("stressIncreaseKpa")?;
            let m = read("constrainedModulusMpa")?;
            if h <= 0.0 || q < 0.0 || m <= 0.0 || !(m * 1000.0).is_finite() {
                return Err("Positive thickness/modulus and non-negative stress required".into());
            }
            let strain = q / (m * 1000.0);
            let s = h * strain * 1000.0;
            if !s.is_finite() || strain >= 1.0 {
                return Err("Outside small-strain model".into());
            }
            Ok(
                json!({"settlementMm":s,"strain":strain,"warning":if strain>0.05{Some("Strain exceeds 5%; review constant-modulus assumption")}else{None}}),
            )
        }
        Some("validate_cpt") => {
            let mut errors = Vec::<String>::new();
            if input["id"]
                .as_str()
                .filter(|s| !s.trim().is_empty())
                .is_none()
            {
                errors.push("CPT id is required".into());
            }
            if !input["metadata"]["source_file"].is_string() {
                errors.push("metadata.source_file is required".into());
            }
            match input["points"].as_array() {
                Some(points) if !points.is_empty() => {
                    for (i, p) in points.iter().enumerate() {
                        if p["depth"]
                            .as_f64()
                            .filter(|d| d.is_finite() && *d >= 0.0)
                            .is_none()
                        {
                            errors
                                .push(format!("points[{i}].depth must be finite and non-negative"));
                        }
                        for key in ["qc", "fs", "rf", "u2", "inclination"] {
                            if !p[key].is_null()
                                && p[key].as_f64().filter(|v| v.is_finite()).is_none()
                            {
                                errors.push(format!("points[{i}].{key} must be finite"));
                            }
                        }
                    }
                }
                _ => errors.push("points must be a non-empty array".into()),
            }
            if !input["position"].is_null() {
                for key in ["x_rd", "y_rd"] {
                    if input["position"][key]
                        .as_f64()
                        .filter(|v| v.is_finite())
                        .is_none()
                    {
                        errors.push(format!("position.{key} must be finite"));
                    }
                }
            }
            Ok(json!({"valid":errors.is_empty(),"errors":errors}))
        }
        _ => Err("Unknown operation; supported: settlement, validate_cpt".into()),
    }
}
/// Caller supplies a readable UTF-8 buffer of `length` bytes. Returns an owned
/// NUL-terminated JSON response, released exactly once with ogs_core_free.
/// Null input/zero length returns a JSON error. Never unwinds across the ABI.
#[no_mangle]
pub unsafe extern "C" fn ogs_core_call(data: *const u8, length: usize) -> *mut c_char {
    let result = std::panic::catch_unwind(|| {
        if data.is_null() || length == 0 {
            return Err("Input buffer is empty".to_string());
        }
        let bytes = unsafe { std::slice::from_raw_parts(data, length) };
        let request: Value = serde_json::from_slice(bytes).map_err(|e| e.to_string())?;
        execute(&request)
    });
    let response = match result {
        Ok(Ok(value)) => json!({"ok":true,"result":value}),
        Ok(Err(error)) => json!({"ok":false,"error":error}),
        Err(_) => json!({"ok":false,"error":"Core panic"}),
    };
    CString::new(response.to_string())
        .expect("JSON has no embedded NUL")
        .into_raw()
}
/// `data` must be null or a live allocation returned by ogs_core_call, once only.
#[no_mangle]
pub unsafe extern "C" fn ogs_core_free(data: *mut c_char) {
    if !data.is_null() {
        drop(unsafe { CString::from_raw(data) });
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn hand_calculation() {
        let r=execute(&json!({"operation":"settlement","input":{"thicknessM":2,"stressIncreaseKpa":50,"constrainedModulusMpa":5}})).unwrap();
        assert_eq!(r["settlementMm"], 20.0);
    }
    #[test]
    fn invalid_modulus() {
        assert!(execute(&json!({"operation":"settlement","input":{"thicknessM":2,"stressIncreaseKpa":50,"constrainedModulusMpa":0}})).is_err());
    }
    #[test]
    fn abi_json_and_ownership() {
        let input = b"{invalid";
        unsafe {
            let out = ogs_core_call(input.as_ptr(), input.len());
            assert!(std::ffi::CStr::from_ptr(out)
                .to_str()
                .unwrap()
                .contains("false"));
            ogs_core_free(out);
            ogs_core_free(std::ptr::null_mut());
        }
    }
    #[test]
    fn invalid_snapshot() {
        let r=execute(&json!({"operation":"validate_cpt","input":{"id":"x","metadata":{"source_file":"test"},"points":[{"depth":-1}]}})).unwrap();
        assert_eq!(r["valid"], false);
    }
}
