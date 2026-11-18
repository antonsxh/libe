//! Where the device credentials live: the OS credential store (macOS Keychain, Windows
//! Credential Manager, Secret Service on Linux). Debug builds can be pointed at a plain file
//! with `LIBE_TAURI_CREDENTIALS_FILE` — only for headless tests without a keyring daemon;
//! release builds ignore the variable.

use serde::{Deserialize, Serialize};

const SERVICE: &str = "libe";
const ACCOUNT: &str = "device";

/// A paired device: the server origin and its secret device token.
#[derive(Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Credentials {
    pub server: String,
    pub token: String,
}

impl std::fmt::Debug for Credentials {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Credentials")
            .field("server", &self.server)
            .field("token", &"<redacted>")
            .finish()
    }
}

#[cfg(debug_assertions)]
fn test_file() -> Option<std::path::PathBuf> {
    std::env::var_os("LIBE_TAURI_CREDENTIALS_FILE").map(Into::into)
}

#[cfg(not(debug_assertions))]
fn test_file() -> Option<std::path::PathBuf> {
    None
}

fn entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICE, ACCOUNT).map_err(|e| format!("Keychain unavailable: {e}"))
}

pub fn load() -> Result<Option<Credentials>, String> {
    let raw = if let Some(path) = test_file() {
        match std::fs::read_to_string(path) {
            Ok(s) => s,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(e) => return Err(e.to_string()),
        }
    } else {
        match entry()?.get_password() {
            Ok(s) => s,
            Err(keyring::Error::NoEntry) => return Ok(None),
            Err(e) => return Err(format!("Could not read the keychain: {e}")),
        }
    };
    // A corrupt entry is treated like no entry (the user pairs again).
    Ok(serde_json::from_str(&raw).ok())
}

pub fn save(creds: &Credentials) -> Result<(), String> {
    let raw = serde_json::to_string(creds).map_err(|e| e.to_string())?;
    if let Some(path) = test_file() {
        return std::fs::write(path, raw).map_err(|e| e.to_string());
    }
    entry()?
        .set_password(&raw)
        .map_err(|e| format!("Could not save to the keychain: {e}"))
}

pub fn clear() -> Result<(), String> {
    if let Some(path) = test_file() {
        return match std::fs::remove_file(path) {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.to_string()),
            _ => Ok(()),
        };
    }
    match entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("Could not delete the keychain entry: {e}")),
    }
}
