//! Automatic updates of the desktop app (`tauri-plugin-updater`) on a user-chosen track.
//!
//! - **Tracks**: `stable` follows the stable releases, `nightly` the nightlies. The release
//!   pipeline keeps one signed Tauri update manifest per track as an asset of the GitHub
//!   release `update-feed` (`stable.json`, `nightly.json`; see docs/RELEASING.md). The chosen
//!   track is saved in `{app config dir}/updates.json`; without a saved choice a build follows
//!   the track it came from (nightlies and previews → nightly, releases → stable).
//! - **Automatic**: 10 s after start and then every 4 h the app checks its track and downloads
//!   an update in the background (the signature is verified against the public key in
//!   `tauri.conf.json`). A downloaded update installs on "Restart to update" or when the app
//!   quits — except for `.deb`/`.rpm` installs, which need an admin password and therefore
//!   only install when asked.
//! - **Switching tracks** installs the newest build of the new track even when it is older
//!   than the running one (nightly → stable). The app keeps no data a downgrade could break:
//!   its only state is the keychain entry, and the server is updated separately.
//! - The paired server's pages drive this from Settings via the `update_*` commands (the
//!   only commands that origin may call, see `lib.rs`).
//!
//! Debug builds only check when `LIBE_UPDATER_FEED` (base URL holding `<track>.json`) is set;
//! `LIBE_UPDATER_PUBKEY` replaces the public key there. Release builds ignore both.

use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::async_runtime::JoinHandle;
use tauri::{AppHandle, Manager};
use tauri_plugin_updater::{Error as UpdaterError, Update, UpdaterExt};
use url::Url;

/// The GitHub release whose assets are the per-track update manifests.
#[cfg_attr(debug_assertions, allow(dead_code))]
const FEED: &str = "https://github.com/antonsxh/libe/releases/download/update-feed";
const FIRST_CHECK: Duration = Duration::from_secs(10);
const CHECK_EVERY: Duration = Duration::from_secs(4 * 60 * 60);
const SETTINGS_FILE: &str = "updates.json";

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Track {
    Stable,
    Nightly,
}

impl Track {
    /// The track a build was released on: `-nightly.` builds → nightly, `-preview.` builds →
    /// none (they have no feed), everything else (including `-rc.N` prereleases) → stable.
    pub fn of_version(version: &str) -> Option<Track> {
        if version.contains("-preview.") {
            None
        } else if version.contains("-nightly.") {
            Some(Track::Nightly)
        } else {
            Some(Track::Stable)
        }
    }
    fn as_str(self) -> &'static str {
        match self {
            Track::Stable => "stable",
            Track::Nightly => "nightly",
        }
    }
}

/// Whether the release `remote` from `track`'s feed should replace the running `current`
/// build: newer on the same track; any other build when the app sits on another track
/// (that is how switching nightly → stable goes back to the older stable release).
pub fn accepts(current: &semver::Version, remote: &semver::Version, track: Track) -> bool {
    if remote == current {
        return false;
    }
    Track::of_version(&current.to_string()) != Some(track) || remote > current
}

#[derive(Clone, Debug, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Phase {
    Idle,
    Checking,
    UpToDate,
    #[serde(rename_all = "camelCase")]
    Downloading {
        version: String,
        downloaded: u64,
        total: Option<u64>,
    },
    #[serde(rename_all = "camelCase")]
    Ready {
        version: String,
        /// Installing asks for the admin password (`.deb`/`.rpm`); never done on quit.
        needs_password: bool,
    },
    Installing {
        version: String,
    },
    Failed {
        message: String,
    },
    /// This build can't update itself (development build, no feed entry for its kind of install).
    Unavailable {
        reason: String,
    },
}

/// What Settings shows (`update_state`).
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateState {
    /// The running app version.
    pub version: String,
    pub track: Track,
    pub phase: Phase,
    /// Last finished check, ms since the epoch.
    pub checked_at: Option<u64>,
}

#[derive(Serialize, Deserialize)]
struct Settings {
    track: Track,
}

struct Inner {
    track: Track,
    phase: Phase,
    checked_at: Option<u64>,
    pending: Option<(Update, Vec<u8>)>,
    task: Option<JoinHandle<()>>,
    running: bool,
    /// Bumped by a track switch: results of an older run are dropped.
    run: u64,
}

pub struct Updates {
    inner: Mutex<Inner>,
}

impl Updates {
    pub fn state(&self, app: &AppHandle) -> UpdateState {
        let inner = self.inner.lock().unwrap();
        UpdateState {
            version: app.package_info().version.to_string(),
            track: inner.track,
            phase: inner.phase.clone(),
            checked_at: inner.checked_at,
        }
    }

    /// Sets the phase unless a newer run (track switch) took over.
    fn set(&self, run: u64, phase: Phase) {
        let mut inner = self.inner.lock().unwrap();
        if inner.run == run {
            inner.phase = phase;
        }
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or_default()
}

#[cfg(debug_assertions)]
fn feed_base() -> Option<String> {
    std::env::var("LIBE_UPDATER_FEED").ok()
}
#[cfg(not(debug_assertions))]
fn feed_base() -> Option<String> {
    Some(FEED.into())
}

#[cfg(debug_assertions)]
fn pubkey_override() -> Option<String> {
    std::env::var("LIBE_UPDATER_PUBKEY").ok()
}
#[cfg(not(debug_assertions))]
fn pubkey_override() -> Option<String> {
    None
}

/// `.deb`/`.rpm` installs go through `pkexec`/`sudo`: only when the user asks for it.
fn needs_password() -> bool {
    cfg!(target_os = "linux") && std::env::var_os("APPIMAGE").is_none()
}

fn settings_path(app: &AppHandle) -> Option<std::path::PathBuf> {
    app.path()
        .app_config_dir()
        .ok()
        .map(|d| d.join(SETTINGS_FILE))
}

fn load_track(app: &AppHandle) -> Track {
    settings_path(app)
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|raw| serde_json::from_str::<Settings>(&raw).ok())
        .map(|s| s.track)
        .or_else(|| Track::of_version(&app.package_info().version.to_string()))
        .unwrap_or(Track::Nightly)
}

fn save_track(app: &AppHandle, track: Track) -> Result<(), String> {
    let path = settings_path(app).ok_or("No settings folder for this app.")?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)
            .map_err(|e| format!("Could not save the update track: {e}"))?;
    }
    let raw = serde_json::to_string(&Settings { track }).map_err(|e| e.to_string())?;
    std::fs::write(path, raw).map_err(|e| format!("Could not save the update track: {e}"))
}

/// Registers the state and starts the background schedule.
pub fn init(app: &AppHandle) {
    app.manage(Updates {
        inner: Mutex::new(Inner {
            track: load_track(app),
            phase: Phase::Idle,
            checked_at: None,
            pending: None,
            task: None,
            running: false,
            run: 0,
        }),
    });
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(FIRST_CHECK).await;
        loop {
            check(&app, false);
            tokio::time::sleep(CHECK_EVERY).await;
        }
    });
}

/// Starts a check (and the download of whatever it finds) unless one is running.
/// Background checks leave a downloaded update alone; asked-for ones look again.
pub fn check(app: &AppHandle, asked: bool) {
    let updates = app.state::<Updates>();
    let mut inner = updates.inner.lock().unwrap();
    if inner.running {
        return;
    }
    if matches!(inner.phase, Phase::Installing { .. })
        || (!asked && matches!(inner.phase, Phase::Ready { .. }))
    {
        return;
    }
    let run = inner.run;
    let track = inner.track;
    // A finished download stays offered until the check finds something else.
    if !matches!(inner.phase, Phase::Ready { .. }) {
        inner.phase = Phase::Checking;
    }
    inner.running = true;
    let app = app.clone();
    inner.task = Some(tauri::async_runtime::spawn(async move {
        run_check(app.clone(), run, track).await;
        let updates = app.state::<Updates>();
        let mut inner = updates.inner.lock().unwrap();
        if inner.run == run {
            inner.running = false;
        }
    }));
}

async fn run_check(app: AppHandle, run: u64, track: Track) {
    let updates = app.state::<Updates>();
    let found = match find_update(&app, track).await {
        Ok(found) => found,
        Err(phase) => {
            let mut inner = updates.inner.lock().unwrap();
            if inner.run == run {
                inner.checked_at = Some(now_ms());
                if !matches!(inner.phase, Phase::Ready { .. }) {
                    inner.phase = phase;
                }
            }
            return;
        }
    };
    {
        let mut inner = updates.inner.lock().unwrap();
        if inner.run != run {
            return;
        }
        inner.checked_at = Some(now_ms());
        match &found {
            None => {
                inner.pending = None;
                inner.phase = Phase::UpToDate;
                return;
            }
            Some(update) => {
                if let (Phase::Ready { version, .. }, Some(_)) = (&inner.phase, &inner.pending) {
                    if *version == update.version {
                        return; // already downloaded
                    }
                }
                inner.pending = None;
                inner.phase = Phase::Downloading {
                    version: update.version.clone(),
                    downloaded: 0,
                    total: None,
                };
            }
        }
    }
    let update = found.expect("checked above");
    let version = update.version.clone();
    let mut downloaded = 0u64;
    let progress = |chunk: usize, total: Option<u64>| {
        downloaded += chunk as u64;
        updates.set(
            run,
            Phase::Downloading {
                version: version.clone(),
                downloaded,
                total,
            },
        );
    };
    match update.download(progress, || {}).await {
        Ok(bytes) => {
            let mut inner = updates.inner.lock().unwrap();
            if inner.run == run {
                inner.phase = Phase::Ready {
                    version: update.version.clone(),
                    needs_password: needs_password(),
                };
                inner.pending = Some((update, bytes));
            }
        }
        Err(e) => updates.set(
            run,
            Phase::Failed {
                message: format!("Downloading libe {version} failed: {e}"),
            },
        ),
    }
}

/// `Ok(None)`: up to date. `Err`: the phase that explains why nothing was found.
async fn find_update(app: &AppHandle, track: Track) -> Result<Option<Update>, Phase> {
    let Some(base) = feed_base() else {
        return Err(Phase::Unavailable {
            reason: "Development builds don't update themselves.".into(),
        });
    };
    let url = Url::parse(&format!(
        "{}/{}.json",
        base.trim_end_matches('/'),
        track.as_str()
    ))
    .map_err(|e| Phase::Failed {
        message: e.to_string(),
    })?;
    let mut builder = app
        .updater_builder()
        .version_comparator(move |current, remote| accepts(&current, &remote.version, track))
        .timeout(Duration::from_secs(30));
    if let Some(key) = pubkey_override() {
        builder = builder.pubkey(key);
    }
    let checked = match builder.endpoints(vec![url]) {
        Ok(b) => match b.build() {
            Ok(updater) => updater.check().await,
            Err(e) => Err(e),
        },
        Err(e) => Err(e),
    };
    checked.map_err(|e| match e {
        UpdaterError::TargetNotFound(_) | UpdaterError::TargetsNotFound(_) => Phase::Unavailable {
            reason: "There are no automatic updates for this kind of install. Download new versions from the GitHub releases.".into(),
        },
        UpdaterError::ReleaseNotFound => Phase::Failed {
            message: format!("No {} release is published yet.", track.as_str()),
        },
        e => Phase::Failed {
            message: format!("Couldn't check for updates: {e}"),
        },
    })
}

/// Saves the track and looks for its newest build right away (a downloaded update of the old
/// track is dropped).
pub fn set_track(app: &AppHandle, track: Track) -> Result<(), String> {
    let updates = app.state::<Updates>();
    {
        let mut inner = updates.inner.lock().unwrap();
        if matches!(inner.phase, Phase::Installing { .. }) {
            return Err("An update is being installed.".into());
        }
        save_track(app, track)?;
        if inner.track == track {
            drop(inner);
            check(app, true);
            return Ok(());
        }
        if let Some(task) = inner.task.take() {
            task.abort();
        }
        inner.track = track;
        inner.run += 1;
        inner.running = false;
        inner.pending = None;
        inner.phase = Phase::Idle;
        inner.checked_at = None;
    }
    check(app, true);
    Ok(())
}

fn take_pending(app: &AppHandle) -> Option<(Update, Vec<u8>)> {
    let updates = app.state::<Updates>();
    let mut inner = updates.inner.lock().unwrap();
    let pending = inner.pending.take()?;
    inner.phase = Phase::Installing {
        version: pending.0.version.clone(),
    };
    Some(pending)
}

/// "Restart to update": install the downloaded update and start the new version. On Windows
/// the installer takes over and closes the app itself.
pub async fn install_and_restart(app: AppHandle) -> Result<(), String> {
    let Some((update, bytes)) = take_pending(&app) else {
        return Err("No update has been downloaded yet.".into());
    };
    // The update comes back either way, so a failed install can be retried.
    let (result, update, bytes) = tauri::async_runtime::spawn_blocking(move || {
        let result = update.install(&bytes).map_err(|e| e.to_string());
        (result, update, bytes)
    })
    .await
    .map_err(|e| e.to_string())?;
    match result {
        Ok(()) => app.restart(),
        Err(message) => {
            let updates = app.state::<Updates>();
            let mut inner = updates.inner.lock().unwrap();
            inner.phase = Phase::Ready {
                version: update.version.clone(),
                needs_password: needs_password(),
            };
            inner.pending = Some((update, bytes));
            Err(format!("Installing the update failed: {message}"))
        }
    }
}

/// On quit: install a downloaded update so the next start runs it (not for `.deb`/`.rpm`,
/// whose password prompt would pop up after the window closed).
pub fn install_on_exit(app: &AppHandle) {
    if needs_password() {
        return;
    }
    if let Some((update, bytes)) = take_pending(app) {
        let _ = update.install(&bytes);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn v(s: &str) -> semver::Version {
        semver::Version::parse(s).unwrap()
    }

    #[test]
    fn track_of_version() {
        assert_eq!(Track::of_version("0.2.1"), Some(Track::Stable));
        assert_eq!(Track::of_version("0.3.0-rc.1"), Some(Track::Stable));
        assert_eq!(Track::of_version("0.0.0"), Some(Track::Stable));
        assert_eq!(
            Track::of_version("0.2.1-nightly.20261119.42"),
            Some(Track::Nightly)
        );
        assert_eq!(Track::of_version("0.2.1-preview.20261119.43"), None);
    }

    #[test]
    fn same_track_only_moves_forward() {
        let t = Track::Stable;
        assert!(accepts(&v("0.2.0"), &v("0.2.1"), t));
        assert!(!accepts(&v("0.2.1"), &v("0.2.1"), t));
        assert!(!accepts(&v("0.2.1"), &v("0.2.0"), t));
        let n = Track::Nightly;
        assert!(accepts(
            &v("0.2.1-nightly.20261119.42"),
            &v("0.2.1-nightly.20261120.50"),
            n
        ));
        // Numeric prerelease identifiers compare as numbers (run 100 > run 99).
        assert!(accepts(
            &v("0.2.1-nightly.20261119.99"),
            &v("0.2.1-nightly.20261119.100"),
            n
        ));
        assert!(!accepts(
            &v("0.2.1-nightly.20261120.50"),
            &v("0.2.1-nightly.20261119.42"),
            n
        ));
    }

    #[test]
    fn switching_tracks_takes_the_other_tracks_build_even_if_older() {
        // nightly build, stable track: back to the (older) stable release
        assert!(accepts(
            &v("0.2.1-nightly.20261119.42"),
            &v("0.2.0"),
            Track::Stable
        ));
        // stable build, nightly track
        assert!(accepts(
            &v("0.2.1"),
            &v("0.2.1-nightly.20261119.42"),
            Track::Nightly
        ));
        // a preview build (no feed of its own) takes the track's build
        assert!(accepts(
            &v("0.2.1-preview.20261119.43"),
            &v("0.2.1-nightly.20261119.42"),
            Track::Nightly
        ));
    }
}
