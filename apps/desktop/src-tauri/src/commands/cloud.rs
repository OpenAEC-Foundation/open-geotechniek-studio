//! Inloggen met het OpenAEC-account en lezen van de huisstijl uit de klantomgeving (SuperCloud).
//!
//! OAuth 2 authorization code met PKCE tegen de cloud, als publieke client `tools` met een loopback-adres
//! (zelfde client, poort en scopes als de andere OpenAEC-tools). Met het toegangstoken (RS256-JWT, een kwartier
//! geldig) leest de app alleen de huisstijl-methodes van een klantomgeving: `Authorization: Bearer <jwt>`, GET, op
//! `/api/method/<methode>`. Tokens staan in de app-datamap; de app vernieuwt ze ruim voor het verlopen.

use std::path::PathBuf;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use base64::engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD};
use base64::Engine;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

pub const CLOUD: &str = "https://cloud.open-aec.eu";
const CLIENT_ID: &str = "tools";
const POORT: u16 = 8765;
const TERUGPAD: &str = "/terug";
const REDIRECT: &str = "http://localhost:8765/terug";
const SCOPE: &str = "openid email profile ai";
const TOKEN: &str = "/api/method/frappe.integrations.oauth2.get_token";
const AUTORISEER: &str = "/api/method/frappe.integrations.oauth2.authorize";
/// Zoveel seconden voor het verlopen wordt het token al vernieuwd.
const MARGE: u64 = 180;
/// Alleen deze leesmethodes vraagt de app op een klantomgeving op.
const METHODES: [&str; 3] = ["openaec_beheer.huisstijl.get", "openaec_beheer.huisstijl.handelsnamen", "openaec_beheer.huisstijl.bestand"];

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Tokens {
    access_token: String,
    refresh_token: String,
    /// Unix-tijd in seconden.
    verloopt: u64,
}

#[derive(Deserialize)]
struct TokenAntwoord {
    access_token: String,
    #[serde(default)]
    refresh_token: Option<String>,
    #[serde(default)]
    expires_in: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Omgeving {
    pub host: String,
    #[serde(default)]
    pub soort: Option<String>,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CloudStatus {
    pub ingelogd: bool,
    pub email: Option<String>,
    pub naam: Option<String>,
    pub omgevingen: Vec<Omgeving>,
}

fn nu() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

fn sessiebestand(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("openaec-sessie.json"))
}

fn lees_tokens(app: &AppHandle) -> Option<Tokens> {
    let pad = sessiebestand(app).ok()?;
    serde_json::from_str(&std::fs::read_to_string(pad).ok()?).ok()
}

fn bewaar_tokens(app: &AppHandle, tokens: &Tokens) -> Result<(), String> {
    let pad = sessiebestand(app)?;
    std::fs::write(&pad, serde_json::to_string(tokens).map_err(|e| e.to_string())?).map_err(|e| e.to_string())
}

/// Willekeurige 32 bytes, base64url (verifier en state).
fn willekeurig() -> String {
    let mut bytes = Vec::with_capacity(32);
    bytes.extend_from_slice(uuid::Uuid::new_v4().as_bytes());
    bytes.extend_from_slice(uuid::Uuid::new_v4().as_bytes());
    URL_SAFE_NO_PAD.encode(bytes)
}

pub fn challenge(verifier: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}

pub fn autorisatie_url(challenge: &str, state: &str) -> String {
    let mut url = reqwest::Url::parse(&format!("{CLOUD}{AUTORISEER}")).expect("geldige cloud-url");
    url.query_pairs_mut()
        .append_pair("client_id", CLIENT_ID)
        .append_pair("response_type", "code")
        .append_pair("scope", SCOPE)
        .append_pair("redirect_uri", REDIRECT)
        .append_pair("code_challenge", challenge)
        .append_pair("code_challenge_method", "S256")
        .append_pair("state", state);
    url.to_string()
}

/// De claims van het toegangstoken, zonder controle van de handtekening: alleen om te tonen wie er is ingelogd en
/// welke omgevingen er zijn. De klantomgeving controleert het token zelf.
pub fn claims(jwt: &str) -> Option<serde_json::Value> {
    let deel = jwt.split('.').nth(1)?;
    serde_json::from_slice(&URL_SAFE_NO_PAD.decode(deel.trim_end_matches('=')).ok()?).ok()
}

fn status_uit(tokens: Option<&Tokens>) -> CloudStatus {
    let Some(t) = tokens else { return CloudStatus::default() };
    let c = claims(&t.access_token).unwrap_or_default();
    let tekst = |k: &str| c.get(k).and_then(|v| v.as_str()).map(str::to_string);
    let omgevingen = c
        .get("omgevingen")
        .and_then(|v| serde_json::from_value::<Vec<Omgeving>>(v.clone()).ok())
        .unwrap_or_default();
    CloudStatus { ingelogd: true, email: tekst("email"), naam: tekst("name"), omgevingen }
}

fn pagina(tekst: &str) -> String {
    let html = format!(
        "<!doctype html><meta charset=utf-8><title>Open Geotechniek Studio</title>\
         <body style=\"font-family:system-ui;margin:3rem\"><h2>Open Geotechniek Studio</h2><p>{tekst}</p></body>"
    );
    format!("HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{html}", html.len())
}

/// Wacht op de redirect van de browser en geeft de code terug als `state` klopt.
async fn wacht_op_code(listener: TcpListener, state: &str) -> Result<String, String> {
    loop {
        let (mut verbinding, _) = listener.accept().await.map_err(|e| e.to_string())?;
        let mut buffer = vec![0u8; 8192];
        let n = verbinding.read(&mut buffer).await.map_err(|e| e.to_string())?;
        let verzoek = String::from_utf8_lossy(&buffer[..n]);
        let doel = verzoek.lines().next().and_then(|r| r.split_whitespace().nth(1)).unwrap_or("").to_string();
        if !doel.starts_with(TERUGPAD) {
            let _ = verbinding.write_all(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n").await;
            continue;
        }
        let url = reqwest::Url::parse(&format!("http://127.0.0.1{doel}")).map_err(|e| e.to_string())?;
        let waarde = |k: &str| url.query_pairs().find(|(s, _)| s == k).map(|(_, v)| v.to_string());
        let uitkomst = match (waarde("code"), waarde("state"), waarde("error")) {
            (_, _, Some(fout)) => Err(format!("inloggen geweigerd: {fout}")),
            (Some(code), Some(s), _) if s == state => Ok(code),
            _ => Err("ongeldig antwoord van de inlogpagina".to_string()),
        };
        let tekst = if uitkomst.is_ok() {
            "Je bent ingelogd. Je kunt dit venster sluiten en teruggaan naar Open Geotechniek Studio."
        } else {
            "Inloggen is niet gelukt. Probeer het opnieuw vanuit de app."
        };
        let _ = verbinding.write_all(pagina(tekst).as_bytes()).await;
        let _ = verbinding.shutdown().await;
        return uitkomst;
    }
}

async fn token_verzoek(velden: &[(&str, &str)], oud_refresh: Option<&str>) -> Result<Tokens, String> {
    let antwoord = reqwest::Client::new()
        .post(format!("{CLOUD}{TOKEN}"))
        .form(velden)
        .timeout(Duration::from_secs(20))
        .send()
        .await
        .map_err(|e| format!("cloud niet bereikbaar: {e}"))?;
    let status = antwoord.status();
    if !status.is_success() {
        let tekst = antwoord.text().await.unwrap_or_default();
        return Err(format!("cloud weigert het token ({status}): {}", tekst.chars().take(200).collect::<String>()));
    }
    let t: TokenAntwoord = antwoord.json().await.map_err(|e| e.to_string())?;
    let refresh_token = t
        .refresh_token
        .or_else(|| oud_refresh.map(str::to_string))
        .ok_or_else(|| "geen refresh-token ontvangen".to_string())?;
    Ok(Tokens { access_token: t.access_token, refresh_token, verloopt: nu() + t.expires_in.unwrap_or(900) })
}

/// Een geldig toegangstoken; vernieuwt het als het binnen de marge verloopt.
async fn geldig_token(app: &AppHandle) -> Result<String, String> {
    let tokens = lees_tokens(app).ok_or_else(|| "niet ingelogd bij OpenAEC".to_string())?;
    if nu() + MARGE < tokens.verloopt {
        return Ok(tokens.access_token);
    }
    let nieuw = token_verzoek(
        &[("grant_type", "refresh_token"), ("refresh_token", &tokens.refresh_token), ("client_id", CLIENT_ID)],
        Some(&tokens.refresh_token),
    )
    .await?;
    bewaar_tokens(app, &nieuw)?;
    Ok(nieuw.access_token)
}

/// Een klantomgeving is een host onder open-aec.eu (of .com); nooit een willekeurig adres.
pub fn controleer_host(host: &str) -> Result<String, String> {
    let host = host.trim().trim_start_matches("https://").trim_end_matches('/').to_ascii_lowercase();
    let geldig = !host.is_empty()
        && host.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '.')
        && (host.ends_with(".open-aec.eu") || host.ends_with(".open-aec.com"));
    if geldig { Ok(host) } else { Err(format!("onbekende omgeving: {host}")) }
}

#[tauri::command]
pub fn cloud_status(app: AppHandle) -> CloudStatus {
    status_uit(lees_tokens(&app).as_ref())
}

#[tauri::command]
pub async fn cloud_login(app: AppHandle) -> Result<CloudStatus, String> {
    let verifier = willekeurig();
    let state = willekeurig();
    let listener = TcpListener::bind(("127.0.0.1", POORT))
        .await
        .map_err(|e| format!("poort {POORT} is bezet ({e}); sluit een andere OpenAEC-tool die aan het inloggen is"))?;
    app.opener()
        .open_url(autorisatie_url(&challenge(&verifier), &state), None::<&str>)
        .map_err(|e| format!("browser openen mislukt: {e}"))?;
    let code = tokio::time::timeout(Duration::from_secs(300), wacht_op_code(listener, &state))
        .await
        .map_err(|_| "inloggen duurde te lang (5 minuten)".to_string())??;
    let tokens = token_verzoek(
        &[
            ("grant_type", "authorization_code"),
            ("code", &code),
            ("redirect_uri", REDIRECT),
            ("client_id", CLIENT_ID),
            ("code_verifier", &verifier),
        ],
        None,
    )
    .await?;
    bewaar_tokens(&app, &tokens)?;
    Ok(status_uit(Some(&tokens)))
}

#[tauri::command]
pub fn cloud_logout(app: AppHandle) -> Result<(), String> {
    let pad = sessiebestand(&app)?;
    if pad.exists() {
        std::fs::remove_file(pad).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Roept een leesmethode van de huisstijl aan op een klantomgeving en geeft `message` terug.
#[tauri::command]
pub async fn cloud_method(app: AppHandle, host: String, methode: String, query: Vec<(String, String)>) -> Result<serde_json::Value, String> {
    if !METHODES.contains(&methode.as_str()) {
        return Err(format!("methode niet toegestaan: {methode}"));
    }
    let host = controleer_host(&host)?;
    let token = geldig_token(&app).await?;
    let antwoord = reqwest::Client::new()
        .get(format!("https://{host}/api/method/{methode}"))
        .query(&query)
        .bearer_auth(token)
        .timeout(Duration::from_secs(20))
        .send()
        .await
        .map_err(|e| format!("{host} niet bereikbaar: {e}"))?;
    let status = antwoord.status();
    if !status.is_success() {
        return Err(match status.as_u16() {
            401 => format!("{host} accepteert het token niet (geen account op deze omgeving, of de cloud is tijdelijk onbereikbaar)"),
            403 => format!("geen toegang tot de huisstijl op {host}"),
            _ => format!("{host} gaf {status}"),
        });
    }
    let json: serde_json::Value = antwoord.json().await.map_err(|e| e.to_string())?;
    Ok(json.get("message").cloned().unwrap_or(json))
}

/// Haalt een bestand van de huisstijl op (een logo onder `/files/` of een getekend adres) als data-URL.
#[tauri::command]
pub async fn cloud_file(app: AppHandle, host: String, pad: String) -> Result<String, String> {
    let host = controleer_host(&host)?;
    let toegestaan = (pad.starts_with("/files/") && !pad.contains(".."))
        || pad.starts_with("/api/method/openaec_beheer.huisstijl.bestand?");
    if !toegestaan {
        return Err(format!("bestand niet toegestaan: {pad}"));
    }
    let mut verzoek = reqwest::Client::new().get(format!("https://{host}{pad}")).timeout(Duration::from_secs(30));
    if pad.starts_with("/api/") {
        verzoek = verzoek.bearer_auth(geldig_token(&app).await?);
    }
    let antwoord = verzoek.send().await.map_err(|e| format!("{host} niet bereikbaar: {e}"))?;
    if !antwoord.status().is_success() {
        return Err(format!("bestand {pad} gaf {}", antwoord.status()));
    }
    let soort = antwoord
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.split(';').next().unwrap_or(s).trim().to_string())
        .unwrap_or_else(|| "application/octet-stream".to_string());
    let bytes = antwoord.bytes().await.map_err(|e| e.to_string())?;
    if bytes.len() > 10 * 1024 * 1024 {
        return Err("bestand is groter dan 10 MB".to_string());
    }
    Ok(format!("data:{soort};base64,{}", STANDARD.encode(&bytes)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn challenge_volgt_rfc7636() {
        // Voorbeeld uit RFC 7636, bijlage B.
        assert_eq!(challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"), "E9Melhoe2OwvBxC1_wAhXIhkQ6BUjhW6eMr8V2AgFIM");
    }

    #[test]
    fn autorisatie_url_bevat_pkce_en_redirect() {
        let url = autorisatie_url("abc", "xyz");
        assert!(url.starts_with("https://cloud.open-aec.eu/api/method/frappe.integrations.oauth2.authorize?"));
        assert!(url.contains("client_id=tools"));
        assert!(url.contains("code_challenge=abc"));
        assert!(url.contains("code_challenge_method=S256"));
        assert!(url.contains("redirect_uri=http%3A%2F%2Flocalhost%3A8765%2Fterug"));
        assert!(!url.contains("scope=all"));
    }

    #[test]
    fn alleen_openaec_hosts() {
        assert_eq!(controleer_host("https://3bm.cloud.open-aec.eu/").unwrap(), "3bm.cloud.open-aec.eu");
        assert!(controleer_host("evil.example.com").is_err());
        assert!(controleer_host("x.open-aec.eu.evil.com").is_err());
        assert!(controleer_host("a/b.open-aec.eu").is_err());
    }

    #[test]
    fn claims_lezen_omgevingen() {
        let payload = URL_SAFE_NO_PAD.encode(br#"{"email":"a@b.nl","omgevingen":[{"host":"x.cloud.open-aec.eu","soort":"Betaald"}]}"#);
        let t = Tokens { access_token: format!("h.{payload}.s"), refresh_token: "r".into(), verloopt: 0 };
        let s = status_uit(Some(&t));
        assert_eq!(s.email.as_deref(), Some("a@b.nl"));
        assert_eq!(s.omgevingen, vec![Omgeving { host: "x.cloud.open-aec.eu".into(), soort: Some("Betaald".into()) }]);
    }
}
