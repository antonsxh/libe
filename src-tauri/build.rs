// The app manifest turns every command into a permission (`allow-<command>`), so a command
// is only callable where a capability grants it: the bundled pairing page gets all of them
// (capabilities/default.json), the paired server's pages only the `update_*` ones (added at
// runtime in `lib.rs`).
fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "resume",
            "pair",
            "unpair",
            "update_state",
            "update_check",
            "update_set_track",
            "update_install",
        ]),
    ))
    .expect("failed to run tauri-build");
}
