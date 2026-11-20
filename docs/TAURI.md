# libe desktop app (Tauri 2)

`src-tauri/` is a thin native shell: one window whose webview shows **your libe server**. The
server stays the single source of truth; the app only adds a pairing screen, keeps the device
token in the OS keychain and restores the session on start.

## How it works

| Step              | What happens                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First start       | The bundled page `src-tauri/ui/` (libe look) asks for the **server address**, a **pairing code** and a **device name**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Pair              | Rust (`reqwest`, not the webview) sends `POST {server}/api/pair` `{ code, name, kind: "tauri" }` → `{ token }` and stores `{ server, token }` as one JSON entry in the OS keychain (`keyring` crate; service `libe`, account `device`).                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Session bootstrap | The main webview navigates to `{server}/pair/session#token=…&next=/`. That public page sends the token as `Authorization: Bearer` to `POST /api/pair/session`, which sets the httpOnly `libe_device` cookie **in the webview's own cookie store** (same origin), then replaces itself with the app. The token sits in the URL fragment, so it never reaches the server logs, and the page removes it from the history.                                                                                                                                                                                                                                                 |
| Later starts      | Keychain → `GET {server}/api/pair/session` (Bearer): valid → session bootstrap → app; `401` → keychain entry deleted, pairing screen ("This device was signed out…"); unreachable → "Can't reach your server" with **Retry** and **Change server / Unpair**.                                                                                                                                                                                                                                                                                                                                                                                                           |
| While running     | A navigation guard sees every page load. When the server sends the webview to `/pair` or `/setup` (cookie expired/cleared, or the device was revoked) the app re-checks the token: still valid → the cookie is restored and you land where you were; revoked → pairing screen. Navigations to other origins are blocked. Remote pages get **no** Tauri IPC beyond the few commands listed under "Access from the server's pages" below.                                                                                                                                                                                                                                |
| Menu & shortcuts  | **macOS**: menu bar **libe → Reload** (⌘R), **Change server / Unpair…**, **Quit libe** (⌘Q) plus the standard Edit menu (copy/paste shortcuts). **Linux / Windows**: no menu bar (it would be a second bar between the title bar and libe's nav); `src/shortcuts.js`, injected into every page of the webview, handles **Ctrl+R** (reload) and **Ctrl+Q** (quit, `app_quit`). **Change server / Unpair…** is in Settings → Desktop app on every platform (inline confirmation, `app_unpair`): revokes the device on the server when reachable, deletes the keychain entry, clears the webview's cookies/caches, back to the pairing screen with the server pre-filled. |
| Updates           | Settings → **Desktop app** (on the server's Settings page, only inside the app): version, **Check for updates**, **Update track** Stable / Nightly, **Restart to update**. The app checks 10 s after start and every 4 h, downloads in the background and installs on restart or quit — see "Updates" below.                                                                                                                                                                                                                                                                                                                                                           |
| Window            | Title "libe", background `#0e0e10` (no white flash), 1280×860 default, min 380×560; size/position are remembered (`tauri-plugin-window-state`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

**Language.** The pairing screen is English or German, picked from `navigator.languages` in
`ui/main.js`. Rust reports errors and notices as `Problem { code, message, detail }`
(`src/problem.rs`); the page translates the code and falls back to the English `message`.
`pair` forwards the page's languages as `Accept-Language`, so the server's own pairing errors
come back in that language. Update phases `failed` / `unavailable` carry a `code` too (see
`UpdateErrorInfo` in `src/lib/desktop.ts`). The native menu (macOS only) stays English.

Why not Tauri's cookie API? Tauri 2.12 has `WebviewWindow::set_cookie`, but the server-issued
cookie carries exactly the server's attributes (`Secure` behind HTTPS, `SameSite`, 400-day
expiry, sliding renewal) and works the same on every platform and webview, so the app lets the
server set it. No CSRF exemption is needed: the pairing call comes from Rust with a JSON body,
and the session exchange is a same-origin `fetch` in the webview.

## Updates

`src-tauri/src/updates.rs` with `tauri-plugin-updater`:

- **Tracks.** Stable follows the stable releases, Nightly the nightlies. Each track's manifest is
  an asset of the GitHub release `update-feed` (`stable.json`, `nightly.json`, uploaded by
  `release.yml`). The choice is saved in `{config dir}/app.libe.desktop/updates.json`; without one
  a build follows the track it came from (previews → Nightly).
- **Switching** saves the track and immediately looks for that track's newest build — also
  when it is older than the running one (Nightly → Stable goes back to the last stable release).
- **Install.** Downloads are verified against the public key in `tauri.conf.json`
  (`plugins.updater.pubkey`, `requireSignedVersion`). macOS replaces the `.app`, AppImage the
  file, Windows runs the NSIS installer (passive), `.deb` installs through `pkexec`/`sudo` and
  therefore only on "Install and restart", never silently on quit. A plain `cargo build`
  binary has no bundle type and gets no updates.
- **Access from the server's pages.** Remote pages normally get no IPC. While paired, the app
  grants the server's origin a runtime capability with only `update_state`, `update_check`,
  `update_set_track`, `update_install`, `app_unpair` (Settings → Desktop app → Change server /
  Unpair…) and `app_quit` (Ctrl+Q on Linux/Windows) — `SERVER_COMMANDS` in `lib.rs`;
  `build.rs` declares an app manifest so every command needs an explicit permission (the
  pairing commands `resume`, `pair`, `unpair` stay local-only). Settings tells an older app
  that rejects `app_unpair` apart ("… not allowed", Tauri's ACL) and points to its menu.
- **Signing key.** `bun run tauri signer generate -w ~/.config/libe/updater.key` made the pair;
  the private key is the repository secret `TAURI_SIGNING_PRIVATE_KEY` (optional
  `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`). Losing it means installed apps can't update any more
  (they would need a manual reinstall with a new public key).
- **Debug builds** never update unless `LIBE_UPDATER_FEED` (base URL with `<track>.json`) is set;
  `LIBE_UPDATER_PUBKEY` overrides the key. `e2e/tauri/tauri.spec.ts` uses both with a local,
  test-signed feed (download + verification, track persistence, tampered signature).

## Prerequisites

All platforms: **Rust ≥ 1.80** (`rustup`, stable) and **Bun** (for the CLI via
`bun install`), or install the CLI with Cargo: `cargo install tauri-cli --version "^2" --locked`.

- **macOS**: Xcode Command Line Tools (`xcode-select --install`).
- **Windows**: Microsoft C++ Build Tools ("Desktop development with C++") and the WebView2
  runtime (preinstalled on Windows 10/11). `aws-lc-rs` (TLS) builds with the MSVC toolchain;
  if it asks for NASM/CMake, install them (`winget install NASM.NASM Kitware.CMake`).
- **Linux** (Debian/Ubuntu):
  ```sh
  sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev \
    libssl-dev libayatana-appindicator3-dev librsvg2-dev
  ```
  The keychain is the Secret Service (GNOME Keyring or KWallet) — a desktop session normally
  runs one.

## Build and run

From the repository root:

```sh
bun install                 # installs @tauri-apps/cli (devDependency)
bun run tauri:dev           # debug build + run (no dev server: the UI is src-tauri/ui)
bun run tauri:build         # release build + installers for this OS
#   macOS: src-tauri/target/release/bundle/{macos/libe.app,dmg/*.dmg}
#   Windows: src-tauri/target/release/bundle/{msi,nsis}/*
#   Linux: src-tauri/target/release/bundle/{deb,rpm,appimage}/*
bun run tauri:build -- --bundles deb      # only one bundle type
```

Without Bun: `cd src-tauri && cargo tauri dev` / `cargo tauri build` (after
`cargo install tauri-cli --version "^2" --locked`). Plain `cargo build` also works for a
binary without installers. Icons in `src-tauri/icons/` are generated from the libe logo; to
regenerate them from a 1024² PNG: `bun run tauri icon path/to/icon.png`.

The release build is not code-signed. macOS Gatekeeper: right-click the app → Open (or
`xattr -dr com.apple.quarantine libe.app`); Windows SmartScreen: "More info → Run anyway".

## Pairing

1. Make sure the server is reachable from this computer (ideally via **HTTPS**; plain `http://`
   works for LAN/localhost addresses typed explicitly — a bare host name defaults to https).
2. On a paired device: avatar menu → **Pair new device** → a 6-digit code (valid 10 min).
3. In the app: server address (e.g. `https://libe.example.com`), the code, a device name
   (defaults to "Mac app" / "Windows app" / "Linux app") → **Pair device**.
4. The device shows up in **Settings → Devices** as "Desktop app". Revoking it there signs the
   app out within seconds (open timer stream closes, next request goes to the pairing screen).

## What was verified (on the Linux dev box) and what you still need to check

Built and tested here (Linux x86-64, WebKitGTK 2.52, Rust 1.100, Tauri 2.12.7):

- `cargo build` (debug) with 0 warnings, `cargo clippy --all-targets -- -D warnings` clean,
  `cargo fmt --check` clean, `cargo test` (address/code normalisation) green, `Cargo.lock`
  committed. `bun run tauri:build -- --bundles deb` produced `libe_0.1.0_amd64.deb` (2.6 MB, depends on
  `libwebkit2gtk-4.1-0`, `libgtk-3-0`, ships a `.desktop` entry + icons); the release binary
  starts under Xvfb and, without a Secret Service, shows "Could not read the keychain…" on the
  pairing page (and would undo a pairing whose token it can't store) instead of crashing.
- End-to-end with **tauri-driver + WebKitWebDriver under Xvfb** against a local server —
  in the repo as `bun run test:tauri` (`e2e/tauri/tauri.spec.ts`; builds the debug app, starts
  its own server on `libe_e2e_tauri`, runs under `xvfb-run`): first start shows the pairing page; a wrong code shows the server's message;
  pairing lands on Home with a live timer stream and the device has kind `tauri`; in-app
  navigation keeps the session; restarting the app reuses the stored token and goes straight
  to Home; revoking the device in Settings brings the running app back to the pairing page
  (credentials deleted, server pre-filled); the window has **no menu bar** (the webview fills
  the window); Settings → Desktop app → **Change server / Unpair…** (inline confirmation)
  returns to the pairing page with the server pre-filled and revokes the device on the server;
  with the server down the app shows "Can't reach your server" and **Retry** works once it is
  back; **Ctrl+R** reloads and **Ctrl+Q** quits, both on libe's pages and on the pairing page. (The in-repo spec found that the server-side revoke of **Unpair** had silently
  failed: a bodyless `DELETE /api/pair/session` from Rust is rejected by SvelteKit's CSRF check
  with 403 — the app now sends a JSON body.)
- **Keychain not tested**: the headless box has no Secret Service daemon, so the debug build
  was pointed at a file via `LIBE_TAURI_CREDENTIALS_FILE` (honoured **only in debug builds**;
  release builds always use the keychain).

Please check on your machine (macOS / Windows / a Linux desktop):

- [ ] `bun run tauri:build` succeeds and the installer/app starts (macOS: unsigned app → right-click → Open).
- [ ] First start shows the pairing page (dark, no white flash); pairing with a fresh code opens libe.
- [ ] The OS keychain holds an entry "libe / device" (macOS Keychain Access, Windows Credential
      Manager → Generic credentials, Linux Seahorse) and quitting + restarting goes straight to Home.
- [ ] The timer works (start on Home → the nav chip ticks; pause from another device updates here).
- [ ] Revoke the app in Settings on another device → within a few seconds it shows "This device was signed out".
- [ ] Settings → Desktop app → Change server / Unpair… → pairing page, server pre-filled; the device is gone from Settings (macOS: also the menu item).
- [ ] Windows: no menu bar under the title bar; Ctrl+R reloads (once — WebView2's own browser
      shortcut may also react) and Ctrl+Q quits. macOS: ⌘R / ⌘Q still work through the menu.
- [ ] Stop the server → restart the app → "Can't reach your server" → start the server → Retry.
- [ ] Window size/position are restored after a restart; ⌘C/⌘V work in text fields (macOS);
      Ctrl+C/Ctrl+V work on Linux/Windows without a menu.
- [ ] With an HTTPS server (e.g. the Caddy overlay) the cookie is `Secure` and everything above still works.

## Limitations

- One server per app install (Change server = unpair + pair again).
- No offline mode: when the server goes away while the app is open, the page shows libe's
  offline page (where the webview supports service workers) or the webview's error page —
  use **Reload** (Ctrl/⌘ R) once the server is back.
- Self-signed HTTPS certificates are only accepted if the OS trusts them (the app uses the
  platform certificate verifier).
- No code signing, no tray icon, no notifications (yet). The server is not updated by the app
  (pick its track with the Docker image tag).
