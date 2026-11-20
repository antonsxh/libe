# The libe desktop app (Tauri 2 thin client, `src-tauri/`) for NixOS / Nix on Linux.
#
# Built with `cargo tauri build --bundles deb` (nixpkgs' `cargo-tauri.hook`), whose `usr/`
# tree becomes `$out`: `bin/libe`, `share/applications/libe.desktop` and
# `share/icons/hicolor/*/apps/libe.png`. The frontend is the static pairing page in
# `src-tauri/ui/`, so neither Bun nor node_modules are involved.
#
# `LIBE_DISTRIBUTION=nix` (read at compile time, `src-tauri/src/updates.rs`) turns the in-app
# updater off: the store is read-only, so this build updates with the flake input instead.
{
  lib,
  rustPlatform,
  cargo-tauri,
  pkg-config,
  wrapGAppsHook3,
  webkitgtk_4_1,
  gtk3,
  libsoup_3,
  librsvg,
  glib-networking,
  dbus,
  # Version the app reports (Settings → Desktop app); see `flake.nix`.
  version,
}:

let
  tauriConf = lib.importJSON ../src-tauri/tauri.conf.json;
in
rustPlatform.buildRustPackage {
  pname = "libe-desktop";
  inherit version;

  # Only what the client build reads: changes to the web app (src/, e2e/, …) leave this
  # derivation, and therefore the cached store path, untouched.
  src = lib.fileset.toSource {
    root = ../.;
    fileset = lib.fileset.unions [
      ../src-tauri/Cargo.toml
      ../src-tauri/Cargo.lock
      ../src-tauri/build.rs
      ../src-tauri/tauri.conf.json
      ../src-tauri/capabilities
      ../src-tauri/icons
      ../src-tauri/src
      ../src-tauri/ui
    ];
  };

  # Every crate comes from the committed lock file (fixed-output fetches by checksum), so
  # there is no cargoHash to keep in sync.
  cargoLock.lockFile = ../src-tauri/Cargo.lock;
  buildAndTestSubdir = "src-tauri";

  # tauri.conf.json's `version` is what the app reports (`package_info()`); Cargo.toml and
  # Cargo.lock stay as committed so the lock file still matches.
  postPatch = lib.optionalString (version != tauriConf.version) ''
    substituteInPlace src-tauri/tauri.conf.json \
      --replace-fail '"version": "${tauriConf.version}"' '"version": "${version}"'
  '';

  nativeBuildInputs = [
    cargo-tauri.hook
    pkg-config
    wrapGAppsHook3
  ];

  buildInputs = [
    webkitgtk_4_1
    gtk3
    libsoup_3
    librsvg
    # TLS for the webview (GIO's TLS backend): without it no HTTPS server loads.
    glib-networking
    # keyring → Secret Service (GNOME Keyring / KWallet) over D-Bus.
    dbus
  ];

  env.LIBE_DISTRIBUTION = "nix";

  # The unit tests run in CI (`cargo test`, checks.yml). Here they would rebuild every
  # dependency: the release profile uses `panic = "abort"`, test builds need unwinding.
  doCheck = false;

  meta = {
    description = "Desktop app for a self-hosted libe server (thin Tauri client)";
    homepage = "https://github.com/antonsxh/libe";
    mainProgram = "libe";
    platforms = [
      "x86_64-linux"
      "aarch64-linux"
    ];
  };
}
