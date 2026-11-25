//! libe desktop app: a thin Tauri 2 shell around a self-hosted libe server.
//!
//! - First start: the bundled page `ui/index.html` asks for the server address, a pairing
//!   code (from an already paired device) and a device name. Rust redeems the code with
//!   `POST {server}/api/pair` (kind `tauri`), stores `{server, token}` in the OS keychain and
//!   navigates the main webview to `{server}/pair/session#token=…`, which swaps the token for
//!   the httpOnly `libe_device` cookie inside the webview's own cookie store.
//! - Later starts: keychain → `GET /api/pair/session` (Bearer) → session bootstrap → app.
//! - Revoked device / lost cookie: the server redirects the webview to `/pair`; the navigation
//!   guard intercepts that, re-checks the token and either restores the cookie or returns to
//!   the pairing screen. Unreachable server → the local page offers Retry / Change server.
//! - macOS: a menu in the global menu bar (Reload, Change server / Unpair…, Quit, Edit).
//!   Linux/Windows have no menu bar: `shortcuts.js` (injected into every page) handles
//!   Ctrl+R / Ctrl+Q, and Settings → Desktop app offers Change server / Unpair.
//! - Updates (`updates.rs`): background check + download on the chosen track (stable /
//!   nightly). The server's Settings page drives it through the `update_*` commands.
//! - The paired server's pages may call only the `update_*` commands, `app_unpair` and
//!   `app_quit` (a runtime capability for exactly that origin, see `allow_server_commands`).

mod problem;
mod server;
mod store;
mod updates;

use problem::Problem;
use serde::Serialize;
use std::collections::HashSet;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use store::Credentials;
use tauri::ipc::CapabilityBuilder;
#[cfg(target_os = "macos")]
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::window::Color;
use tauri::{AppHandle, Manager, RunEvent, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use url::Url;

const MAIN: &str = "main";
/// `--bg` of the web app, so there is no white flash while pages load.
const BACKGROUND: Color = Color(0, 0, 0, 255); // #000000

struct App {
    http: reqwest::Client,
    creds: Mutex<Option<Credentials>>,
    /// Message for the pairing screen ("This device was signed out…").
    notice: Mutex<Option<Problem>>,
    /// Pre-fills the server field after "Change server / Unpair".
    last_server: Mutex<Option<String>>,
    /// Loop guard for cookie recovery (see `recover`).
    recoveries: Mutex<Vec<Instant>>,
    /// Server origins whose pages may call the commands in `SERVER_COMMANDS`.
    server_origins: Mutex<HashSet<String>>,
}

impl App {
    fn creds(&self) -> Option<Credentials> {
        self.creds.lock().unwrap().clone()
    }
    fn set_creds(&self, app: &AppHandle, creds: Option<Credentials>) {
        if let Some(c) = &creds {
            allow_server_commands(app, &self.server_origins, &c.server);
            *self.last_server.lock().unwrap() = Some(c.server.clone());
        }
        *self.creds.lock().unwrap() = creds;
    }
    fn set_notice(&self, notice: Problem) {
        *self.notice.lock().unwrap() = Some(notice);
    }
}

/// What the paired server's pages may call: the updater (Settings → Desktop app), unpairing
/// (Settings → Desktop app) and quitting (Ctrl+Q from `shortcuts.js`). The pairing commands
/// stay local-only.
const SERVER_COMMANDS: [&str; 6] = [
    "allow-update-state",
    "allow-update-check",
    "allow-update-set-track",
    "allow-update-install",
    "allow-app-unpair",
    "allow-app-quit",
];

/// Grants the paired server's pages the commands in `SERVER_COMMANDS` — and nothing else.
/// Capabilities can't be removed at runtime; an origin from an earlier pairing keeps the
/// grant until restart, but the navigation guard never loads it again.
fn allow_server_commands(app: &AppHandle, granted: &Mutex<HashSet<String>>, server: &str) {
    let mut granted = granted.lock().unwrap();
    if granted.contains(server) {
        return;
    }
    let capability = SERVER_COMMANDS.iter().fold(
        CapabilityBuilder::new(format!("server-{}", granted.len()))
            .remote(format!("{server}/*"))
            .window(MAIN),
        |capability, permission| capability.permission(*permission),
    );
    match app.add_capability(capability) {
        Ok(()) => {
            granted.insert(server.to_string());
        }
        Err(e) => eprintln!("libe: could not grant {server} access to the app: {e}"),
    }
}

/// What the local page should show.
#[derive(Serialize)]
#[serde(tag = "state", rename_all = "camelCase")]
enum Status {
    /// Pairing form.
    Pair {
        server: Option<String>,
        /// English default device name; the page translates it by `platform`.
        name: String,
        platform: &'static str,
        notice: Option<Problem>,
    },
    /// Paired and valid: the webview is on its way to the server.
    Connecting { server: String },
    /// Paired, but the server can't be reached right now.
    Unreachable { server: String, error: Problem },
}

/// `macos` | `windows` | `linux` (the pairing page's default device name).
fn platform() -> &'static str {
    match std::env::consts::OS {
        "macos" => "macos",
        "windows" => "windows",
        _ => "linux",
    }
}

fn default_device_name() -> String {
    match platform() {
        "macos" => "Mac app",
        "windows" => "Windows app",
        _ => "Linux app",
    }
    .into()
}

fn pair_status(state: &App, notice: Option<Problem>) -> Status {
    Status::Pair {
        server: state.last_server.lock().unwrap().clone(),
        name: default_device_name(),
        platform: platform(),
        notice,
    }
}

fn main_window(app: &AppHandle) -> Result<WebviewWindow, Problem> {
    app.get_webview_window(MAIN)
        .ok_or_else(|| Problem::internal("main window is gone"))
}

/// The bundled pairing page (`tauri://localhost` on macOS/Linux, `http://tauri.localhost`
/// on Windows).
fn is_local(url: &Url) -> bool {
    url.scheme() == "tauri" || url.host_str() == Some("tauri.localhost")
}

fn local_url() -> Url {
    let base = if cfg!(windows) {
        "http://tauri.localhost/index.html"
    } else {
        "tauri://localhost/index.html"
    };
    Url::parse(base).expect("static URL")
}

/// `{server}/pair/session#token=…&next=…` — the token travels in the fragment, which never
/// reaches the server or its logs; the page exchanges it for the cookie and drops it from
/// the history.
fn session_url(creds: &Credentials, next: &str) -> Result<Url, Problem> {
    let next: String = url::form_urlencoded::byte_serialize(next.as_bytes()).collect();
    Url::parse(&format!(
        "{}/pair/session#token={}&next={}",
        creds.server, creds.token, next
    ))
    .map_err(|e| Problem::internal(e.to_string()))
}

fn open_session(app: &AppHandle, creds: &Credentials, next: &str) -> Result<(), Problem> {
    let url = session_url(creds, next)?;
    main_window(app)?
        .navigate(url)
        .map_err(|e| Problem::internal(e.to_string()))
}

/// Back to the bundled pairing page (it calls `resume` on load and shows `notice`).
fn show_local(app: &AppHandle, notice: Option<Problem>) {
    if let Some(n) = notice {
        app.state::<App>().set_notice(n);
    }
    if let Ok(window) = main_window(app) {
        let _ = window.navigate(local_url());
    }
}

fn signed_out() -> Problem {
    Problem::new(
        "signedOut",
        "This device was signed out (revoked on another device). Pair it again with a new code.",
    )
}

// ─── Commands (called by ui/main.js) ─────────────────────────────────────────

/// Start-up: use the stored token if there is one, else show the pairing form.
#[tauri::command]
async fn resume(app: AppHandle, state: State<'_, App>) -> Result<Status, Problem> {
    let notice = state.notice.lock().unwrap().take();
    let Some(creds) = state.creds() else {
        return Ok(pair_status(&state, notice));
    };
    match server::check(&state.http, &creds.server, &creds.token).await {
        server::Session::Valid => {
            open_session(&app, &creds, "/")?;
            Ok(Status::Connecting {
                server: creds.server,
            })
        }
        server::Session::SignedOut => {
            store::clear()?;
            state.set_creds(&app, None);
            Ok(pair_status(&state, Some(signed_out())))
        }
        server::Session::Unreachable(error) => Ok(Status::Unreachable {
            server: creds.server,
            error,
        }),
    }
}

/// Pair with a code from another device, keep the token in the keychain, open libe.
/// `language`: the page's `navigator.languages` (for the server's error messages).
#[tauri::command]
async fn pair(
    app: AppHandle,
    state: State<'_, App>,
    server: String,
    code: String,
    name: String,
    language: Option<String>,
) -> Result<(), Problem> {
    let server = server::normalize_server(&server)?;
    let code = server::normalize_code(&code)?;
    let name = name.split_whitespace().collect::<Vec<_>>().join(" ");
    if name.is_empty() || name.chars().count() > 60 {
        return Err(Problem::new(
            "nameInvalid",
            "Give this device a name (up to 60 characters).",
        ));
    }
    let token = server::pair(&state.http, &server, &code, &name, language.as_deref()).await?;
    let creds = Credentials { server, token };
    if let Err(e) = store::save(&creds) {
        // Without the keychain the token would be lost on restart: undo the pairing.
        server::revoke(&state.http, &creds.server, &creds.token).await;
        return Err(e);
    }
    state.set_creds(&app, Some(creds.clone()));
    open_session(&app, &creds, "/")
}

/// Forget this server: revoke the device there (best effort), clear the keychain entry and
/// the webview's cookies/caches.
#[tauri::command]
async fn unpair(app: AppHandle, state: State<'_, App>) -> Result<Status, Problem> {
    if let Some(creds) = state.creds() {
        server::revoke(&state.http, &creds.server, &creds.token).await;
    }
    store::clear()?;
    state.set_creds(&app, None);
    if let Ok(window) = main_window(&app) {
        let _ = window.clear_all_browsing_data();
    }
    Ok(pair_status(&state, None))
}

/// `unpair`, then the pairing page (server pre-filled; a failure shows as its notice).
async fn unpair_to_pairing(app: AppHandle) {
    let notice = unpair(app.clone(), app.state::<App>()).await.err();
    show_local(&app, notice);
}

// ─── App (also called by the server's pages) ─────────────────────────────────

/// Settings → Desktop app → "Change server / Unpair…" (the menu item on macOS). The webview
/// leaves the calling page, so the caller usually never sees the answer.
#[tauri::command]
async fn app_unpair(app: AppHandle) {
    unpair_to_pairing(app).await;
}

/// Ctrl+Q on Linux/Windows (`shortcuts.js`); macOS quits through the menu.
#[tauri::command]
fn app_quit(app: AppHandle) {
    app.exit(0);
}

// ─── Updates (also called by the server's Settings page) ──────────────────────

#[tauri::command]
fn update_state(app: AppHandle) -> updates::UpdateState {
    app.state::<updates::Updates>().state(&app)
}

/// Starts a check (and download); Settings polls `update_state` for the outcome.
#[tauri::command]
fn update_check(app: AppHandle) -> updates::UpdateState {
    updates::check(&app, true);
    app.state::<updates::Updates>().state(&app)
}

#[tauri::command]
fn update_set_track(app: AppHandle, track: updates::Track) -> Result<updates::UpdateState, String> {
    updates::set_track(&app, track)?;
    Ok(app.state::<updates::Updates>().state(&app))
}

/// Installs the downloaded update and restarts into it.
#[tauri::command]
async fn update_install(app: AppHandle) -> Result<(), String> {
    updates::install_and_restart(app).await
}

// ─── Navigation guard ────────────────────────────────────────────────────────

/// Decides every top-level navigation of the main webview.
fn allow_navigation(app: &AppHandle, url: &Url) -> bool {
    if is_local(url) || url.scheme() == "about" {
        return true;
    }
    let Some(creds) = app.state::<App>().creds() else {
        return false; // not paired: only the local page
    };
    if url.origin().ascii_serialization() != creds.server {
        return false; // libe never links elsewhere; don't turn the app into a browser
    }
    if url.path() == "/pair" || url.path() == "/setup" {
        // The server sends devices without a valid cookie here. Find out why, off the
        // main thread, and keep the webview where it is meanwhile.
        let next = url
            .query_pairs()
            .find(|(k, _)| k == "next")
            .map(|(_, v)| v.into_owned())
            .filter(|n| n.starts_with('/') && !n.starts_with("//"))
            .unwrap_or_else(|| "/".into());
        let app = app.clone();
        tauri::async_runtime::spawn(async move { recover(app, creds, next).await });
        return false;
    }
    true
}

/// Valid token → restore the cookie (it expired or was cleared); revoked → pairing screen.
async fn recover(app: AppHandle, creds: Credentials, next: String) {
    let state = app.state::<App>();
    match server::check(&state.http, &creds.server, &creds.token).await {
        server::Session::Valid => {
            let looping = {
                let mut recent = state.recoveries.lock().unwrap();
                recent.retain(|t| t.elapsed() < Duration::from_secs(30));
                recent.push(Instant::now());
                recent.len() > 2
            };
            if looping {
                show_local(
                    &app,
                    Some(Problem::new(
                        "cookieLoop",
                        "libe could not keep a session cookie. Check the server's ORIGIN / HTTPS setup.",
                    )),
                );
            } else if open_session(&app, &creds, &next).is_err() {
                show_local(&app, None);
            }
        }
        server::Session::SignedOut => {
            let _ = store::clear();
            state.set_creds(&app, None);
            show_local(&app, Some(signed_out()));
        }
        server::Session::Unreachable(error) => show_local(&app, Some(error)),
    }
}

// ─── Menu (macOS only) ───────────────────────────────────────────────────────
//
// macOS shows it in the global menu bar and needs the Edit menu for ⌘C/⌘V/…. Linux and
// Windows would draw it as an extra bar inside the window, so there the shortcuts come from
// `shortcuts.js` and "Change server / Unpair" lives in Settings → Desktop app.

#[cfg(target_os = "macos")]
fn build_menu(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let reload = MenuItem::with_id(app, "reload", "Reload", true, Some("CmdOrCtrl+R"))?;
    let unpair = MenuItem::with_id(app, "unpair", "Change server / Unpair…", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Quit libe", true, Some("CmdOrCtrl+Q"))?;
    let libe = Submenu::with_items(app, "libe", true, &[&reload, &unpair, &separator, &quit])?;
    let edit = Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
        ],
    )?;
    Menu::with_items(app, &[&libe, &edit])
}

#[cfg(target_os = "macos")]
fn on_menu(app: &AppHandle, id: &str) {
    match id {
        "reload" => {
            if let Ok(window) = main_window(app) {
                let _ = window.reload();
            }
        }
        "quit" => app.exit(0),
        "unpair" => {
            tauri::async_runtime::spawn(unpair_to_pairing(app.clone()));
        }
        _ => {}
    }
}

/// Ctrl+R / Ctrl+Q without a menu (Linux, Windows): runs in every page of the main webview.
#[cfg(not(target_os = "macos"))]
const SHORTCUTS: &str = include_str!("shortcuts.js");

// ─── Entry point ─────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            resume,
            pair,
            unpair,
            app_unpair,
            app_quit,
            update_state,
            update_check,
            update_set_track,
            update_install
        ])
        .setup(|app| {
            let (creds, notice) = match store::load() {
                Ok(creds) => (creds, None),
                Err(e) => (None, Some(e)),
            };
            let server_origins = Mutex::new(HashSet::new());
            if let Some(c) = &creds {
                allow_server_commands(app.handle(), &server_origins, &c.server);
            }
            app.manage(App {
                http: server::client(),
                last_server: Mutex::new(creds.as_ref().map(|c| c.server.clone())),
                creds: Mutex::new(creds),
                notice: Mutex::new(notice),
                recoveries: Mutex::new(Vec::new()),
                server_origins,
            });
            updates::init(app.handle());

            #[cfg(target_os = "macos")]
            {
                let handle = app.handle().clone();
                app.set_menu(build_menu(&handle)?)?;
                app.on_menu_event(|app, event| on_menu(app, event.id().as_ref()));
            }

            let guard = app.handle().clone();
            let window = WebviewWindowBuilder::new(app, MAIN, WebviewUrl::App("index.html".into()))
                .title("libe")
                .inner_size(1280.0, 860.0)
                .min_inner_size(380.0, 560.0)
                .background_color(BACKGROUND)
                .on_navigation(move |url| allow_navigation(&guard, url));
            #[cfg(not(target_os = "macos"))]
            let window = window.initialization_script(SHORTCUTS);
            window.build()?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building libe")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                updates::install_on_exit(app);
            }
        });
}
