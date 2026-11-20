// The app manifest turns every command into a permission (`allow-<command>`), so a command
// is only callable where a capability grants it: the bundled pairing page gets all of them
// (capabilities/default.json), the paired server's pages only `update_*`, `app_unpair` and
// `app_quit` (added at runtime in `lib.rs`, `SERVER_COMMANDS`).
fn main() {
    // `LIBE_DISTRIBUTION=nix` (nix/libe-desktop.nix) turns the self-updater off, see
    // `updates::Distribution`. Refuse typos instead of silently building a self-updating app.
    println!("cargo:rerun-if-env-changed=LIBE_DISTRIBUTION");
    if let Ok(value) = std::env::var("LIBE_DISTRIBUTION") {
        assert!(
            value.is_empty() || value == "nix",
            "LIBE_DISTRIBUTION must be unset or \"nix\", not {value:?}"
        );
    }
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "resume",
            "pair",
            "unpair",
            "app_unpair",
            "app_quit",
            "update_state",
            "update_check",
            "update_set_track",
            "update_install",
        ]),
    ))
    .expect("failed to run tauri-build");
}
