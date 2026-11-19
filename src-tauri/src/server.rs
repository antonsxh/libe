//! HTTP calls to the libe server (from Rust, so no browser CORS/CSRF is involved).

use crate::problem::Problem;
use serde::Deserialize;
use serde_json::json;
use std::time::Duration;
use url::Url;

/// `"libe.example.com"`, `"https://libe.example.com/plan"` → `"https://libe.example.com"`.
/// Plain `http://` is kept when typed explicitly (LAN / localhost servers).
pub fn normalize_server(input: &str) -> Result<String, Problem> {
    let s = input.trim();
    if s.is_empty() {
        return Err(Problem::new(
            "serverEmpty",
            "Enter the address of your libe server.",
        ));
    }
    let with_scheme = if s.contains("://") {
        s.to_string()
    } else {
        format!("https://{s}")
    };
    let invalid = || Problem::new("serverInvalid", "That doesn't look like a server address.");
    let url = Url::parse(&with_scheme).map_err(|_| invalid())?;
    if url.scheme() != "https" && url.scheme() != "http" {
        return Err(Problem::new(
            "serverScheme",
            "The server address must start with https:// or http://.",
        ));
    }
    if url.host_str().is_none() {
        return Err(invalid());
    }
    Ok(url.origin().ascii_serialization())
}

/// Digits only, `"482 913"` → `"482913"`.
pub fn normalize_code(input: &str) -> Result<String, Problem> {
    let digits: String = input
        .chars()
        .filter(|c| !c.is_whitespace() && *c != '-')
        .collect();
    if digits.len() == 6 && digits.chars().all(|c| c.is_ascii_digit()) {
        Ok(digits)
    } else {
        Err(Problem::new(
            "codeFormat",
            "Enter the 6-digit code shown on your other device.",
        ))
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

/// `POST /api/pair` → the new device token. `language` (the pairing page's
/// `navigator.languages`) becomes `Accept-Language`, so the server's own error messages
/// ("Wrong code…") arrive in the page's language.
pub async fn pair(
    http: &reqwest::Client,
    server: &str,
    code: &str,
    name: &str,
    language: Option<&str>,
) -> Result<String, Problem> {
    let mut req = http
        .post(format!("{server}/api/pair"))
        .json(&json!({ "code": code, "name": name, "kind": "tauri" }));
    if let Some(lang) = language.and_then(accept_language) {
        req = req.header(reqwest::header::ACCEPT_LANGUAGE, lang);
    }
    let res = req
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
        // Already in the page's language (see `Accept-Language` above).
        Some(PairResponse {
            error: Some(error), ..
        }) => Err(Problem::new("server", error)),
        _ => Err(Problem::with_detail(
            "notLibe",
            format!("The server answered {status}. Is this a libe server?"),
            status.to_string(),
        )),
    }
}

/// A header-safe `Accept-Language` value from the page (`"de-DE,de,en-US"`), else `None`.
fn accept_language(raw: &str) -> Option<String> {
    let ok = !raw.is_empty()
        && raw.len() <= 200
        && raw.chars().all(|c| {
            c.is_ascii_alphanumeric() || matches!(c, '-' | ',' | ';' | '=' | '.' | ' ' | '*')
        });
    ok.then(|| raw.to_string())
}

/// Is the token still valid?
pub enum Session {
    Valid,
    /// Revoked or unknown token (401).
    SignedOut,
    Unreachable(Problem),
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
        Ok(res) => Session::Unreachable(Problem::with_detail(
            "serverStatus",
            format!("The server answered {}.", res.status()),
            res.status().to_string(),
        )),
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

fn unreachable_message(server: &str, e: &reqwest::Error) -> Problem {
    if e.is_timeout() {
        Problem::with_detail(
            "timeout",
            format!("{server} did not answer in time."),
            server,
        )
    } else {
        Problem::with_detail(
            "unreachable",
            format!("Can't reach {server}. Check the address and your connection."),
            server,
        )
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
        assert_eq!(normalize_server("").unwrap_err().code, "serverEmpty");
        assert_eq!(
            normalize_server("ftp://x").unwrap_err().code,
            "serverScheme"
        );
    }

    #[test]
    fn codes() {
        assert_eq!(normalize_code("482 913").unwrap(), "482913");
        assert_eq!(normalize_code("482-913").unwrap(), "482913");
        assert!(normalize_code("48291").is_err());
        assert_eq!(normalize_code("48291a").unwrap_err().code, "codeFormat");
    }

    #[test]
    fn accept_language_values() {
        assert_eq!(
            accept_language("de-DE,de;q=0.9,en").as_deref(),
            Some("de-DE,de;q=0.9,en")
        );
        assert_eq!(accept_language(""), None);
        assert_eq!(accept_language("de\r\nX-Evil: 1"), None);
    }
}
