//! HTTP calls to the libe server (from Rust, so no browser CORS/CSRF is involved).

use serde::Deserialize;
use serde_json::json;
use std::time::Duration;
use url::Url;

/// `"libe.example.com"`, `"https://libe.example.com/plan"` → `"https://libe.example.com"`.
/// Plain `http://` is kept when typed explicitly (LAN / localhost servers).
pub fn normalize_server(input: &str) -> Result<String, String> {
    let s = input.trim();
    if s.is_empty() {
        return Err("Enter the address of your libe server.".into());
    }
    let with_scheme = if s.contains("://") {
        s.to_string()
    } else {
        format!("https://{s}")
    };
    let url = Url::parse(&with_scheme).map_err(|_| "That doesn't look like a server address.")?;
    if url.scheme() != "https" && url.scheme() != "http" {
        return Err("The server address must start with https:// or http://.".into());
    }
    if url.host_str().is_none() {
        return Err("That doesn't look like a server address.".into());
    }
    Ok(url.origin().ascii_serialization())
}

/// Digits only, `"482 913"` → `"482913"`.
pub fn normalize_code(input: &str) -> Result<String, String> {
    let digits: String = input
        .chars()
        .filter(|c| !c.is_whitespace() && *c != '-')
        .collect();
    if digits.len() == 6 && digits.chars().all(|c| c.is_ascii_digit()) {
        Ok(digits)
    } else {
        Err("Enter the 6-digit code shown on your other device.".into())
    }
}

pub fn client() -> reqwest::Client {
    reqwest::Client::builder()
        .user_agent(concat!("libe-desktop/", env!("CARGO_PKG_VERSION")))
        .connect_timeout(Duration::from_secs(8))
        .timeout(Duration::from_secs(15))
        .build()
        .expect("HTTP client")
}

#[derive(Deserialize)]
struct PairResponse {
    ok: bool,
    token: Option<String>,
    error: Option<String>,
}

/// `POST /api/pair` → the new device token.
pub async fn pair(
    http: &reqwest::Client,
    server: &str,
    code: &str,
    name: &str,
) -> Result<String, String> {
    let res = http
        .post(format!("{server}/api/pair"))
        .json(&json!({ "code": code, "name": name, "kind": "tauri" }))
        .send()
        .await
        .map_err(|e| unreachable_message(server, &e))?;
    let status = res.status();
    let body: Option<PairResponse> = res.json().await.ok();
    match body {
        Some(PairResponse {
            ok: true,
            token: Some(token),
            ..
        }) => Ok(token),
        Some(PairResponse {
            error: Some(error), ..
        }) => Err(error),
        _ => Err(format!(
            "The server answered {status}. Is this a libe server?"
        )),
    }
}

/// Is the token still valid?
pub enum Session {
    Valid,
    /// Revoked or unknown token (401).
    SignedOut,
    Unreachable(String),
}

/// `GET /api/pair/session` with the Bearer token.
pub async fn check(http: &reqwest::Client, server: &str, token: &str) -> Session {
    match http
        .get(format!("{server}/api/pair/session"))
        .bearer_auth(token)
        .send()
        .await
    {
        Ok(res) if res.status().is_success() => Session::Valid,
        Ok(res) if res.status() == reqwest::StatusCode::UNAUTHORIZED => Session::SignedOut,
        Ok(res) => Session::Unreachable(format!("The server answered {}.", res.status())),
        Err(e) => Session::Unreachable(unreachable_message(server, &e)),
    }
}

/// `DELETE /api/pair/session`: revoke this device on the server (best effort).
/// The JSON body matters: SvelteKit's CSRF check rejects bodyless (form-like) non-GET
/// requests without a same-origin `Origin` header with 403.
pub async fn revoke(http: &reqwest::Client, server: &str, token: &str) {
    let _ = http
        .delete(format!("{server}/api/pair/session"))
        .bearer_auth(token)
        .json(&serde_json::json!({}))
        .send()
        .await;
}

fn unreachable_message(server: &str, e: &reqwest::Error) -> String {
    if e.is_timeout() {
        format!("{server} did not answer in time.")
    } else {
        format!("Can't reach {server}. Check the address and your connection.")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn server_addresses() {
        assert_eq!(
            normalize_server("libe.example.com").unwrap(),
            "https://libe.example.com"
        );
        assert_eq!(
            normalize_server(" https://libe.example.com/plan?x=1 ").unwrap(),
            "https://libe.example.com"
        );
        assert_eq!(
            normalize_server("http://127.0.0.1:3000/").unwrap(),
            "http://127.0.0.1:3000"
        );
        assert!(normalize_server("").is_err());
        assert!(normalize_server("ftp://x").is_err());
    }

    #[test]
    fn codes() {
        assert_eq!(normalize_code("482 913").unwrap(), "482913");
        assert_eq!(normalize_code("482-913").unwrap(), "482913");
        assert!(normalize_code("48291").is_err());
        assert!(normalize_code("48291a").is_err());
    }
}
