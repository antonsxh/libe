//! Errors and notices shown on the bundled pairing page (`ui/`).
//!
//! Every one carries a stable `code` that `ui/main.js` translates (English / German, from
//! `navigator.language`), an English `message` (logs, fallback for codes the page doesn't
//! know) and an optional untranslated `detail` (an address, an HTTP status, an OS error).

use serde::Serialize;

#[derive(Clone, Debug, Serialize)]
pub struct Problem {
    pub code: &'static str,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

impl Problem {
    pub fn new(code: &'static str, message: impl Into<String>) -> Self {
        Problem {
            code,
            message: message.into(),
            detail: None,
        }
    }

    /// `message` is the English text with `detail` already filled in.
    pub fn with_detail(
        code: &'static str,
        message: impl Into<String>,
        detail: impl Into<String>,
    ) -> Self {
        Problem {
            code,
            message: message.into(),
            detail: Some(detail.into()),
        }
    }

    /// An unexpected internal error (no translation, the page shows `message`).
    pub fn internal(message: impl Into<String>) -> Self {
        Problem::new("internal", message)
    }
}

impl std::fmt::Display for Problem {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.message)
    }
}
