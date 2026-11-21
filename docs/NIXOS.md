# libe desktop app on NixOS

The flake in this repository (`flake.nix`, package `nix/libe-desktop.nix`) packages the
**desktop app**, the thin Tauri client from [TAURI.md](TAURI.md), for `x86_64-linux` and
`aarch64-linux`. The server is not part of it: run it with Docker (see the README).

Released builds come prebuilt from the binary cache **`https://libe.cachix.org`**; everything
else (WebKitGTK, GTK, …) comes from `cache.nixos.org`. Without the cache Nix compiles libe
itself (a Rust release build, roughly 10–20 minutes).

## Try it

```sh
nix run github:antonsxh/libe/channel/stable
```

Nix asks whether to use the flake's `extra-substituters` / `extra-trusted-public-keys`
(libe.cachix.org) — answer `y`, or pass `--accept-flake-config`. That only takes effect for
[trusted users](https://nix.dev/manual/nix/stable/command-ref/conf-file.html#conf-trusted-users);
on a multi-user install add the cache to the system configuration instead (below).

## Channels and pins

| Flake reference                                     | What you get                                                                        |
| --------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `github:antonsxh/libe/channel/stable`               | the newest stable release                                                           |
| `github:antonsxh/libe/channel/nightly`              | the newest nightly (at most every 6 h when `main` changed)                          |
| `github:antonsxh/libe/nix-v0.2.1`                   | exactly that release (every release's notes name its tag)                           |
| `github:antonsxh/libe` (or a branch / commit of it) | reports `<last stable>+src.<hash>`; cached when `main` built the same client source |

Each branch appears with the first release of its kind after the flake was added (no stable
release yet → use `channel/nightly`). The release pipeline moves `channel/stable` /
`channel/nightly` only after both architectures are in the binary cache. Their commits are the
released commit plus its version files and `nix/release.json`, so the app reports the real
version (Settings → Desktop app). Don't pin the plain release tag (`v0.2.1`): it predates those
files, so it reports `<previous stable>+src.<hash>`. Pin `nix-v0.2.1`
instead.

## NixOS configuration (flake)

```nix
# flake.nix of your system
{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-26.05";
    libe.url = "github:antonsxh/libe/channel/stable"; # or channel/nightly
    # No `libe.inputs.nixpkgs.follows`: libe is built against its own pinned nixpkgs, and only
    # that build is in the binary cache (with `follows` Nix compiles it on your machine).
  };

  outputs =
    { nixpkgs, libe, ... }:
    {
      nixosConfigurations.my-host = nixpkgs.lib.nixosSystem {
        modules = [
          ./configuration.nix
          (
            { pkgs, ... }:
            {
              environment.systemPackages = [ libe.packages.${pkgs.stdenv.hostPlatform.system}.desktop ];

              nix.settings = {
                extra-substituters = [ "https://libe.cachix.org" ];
                extra-trusted-public-keys = [
                  "libe.cachix.org-1:GVJ+gyp4hy8MhlJbdHYuGHYSnzB39z7eCefKzo08LUk="
                ];
              };

              # Only without GNOME or KDE (they run a Secret Service already), see below.
              services.gnome.gnome-keyring.enable = true;
            }
          )
        ];
      };
    };
}
```

`nix.settings` is only active after a switch, so the very first `nixos-rebuild switch` that
adds libe still compiles it unless the cache is configured already: switch once with just the
`nix.settings` block, or pass
`--option extra-substituters https://libe.cachix.org --option extra-trusted-public-keys libe.cachix.org-1:GVJ+gyp4hy8MhlJbdHYuGHYSnzB39z7eCefKzo08LUk=`
to that first `sudo nixos-rebuild switch --flake .#my-host`. (A flake's own `nixConfig` only
applies to the flake you build directly, never to its inputs.)

Home Manager works the same way: `home.packages = [ libe.packages.${pkgs.stdenv.hostPlatform.system}.desktop ];`.

The package installs `libe` into the `PATH`, a desktop entry (“libe”, category Office)
and its icons. Start it, pair it with a code from a paired device (see TAURI.md, “Pairing”).

## Keychain (Secret Service)

The app keeps its device token in the Secret Service over D-Bus. GNOME and KDE Plasma provide
one (GNOME Keyring, KWallet). On other desktops or window managers enable GNOME Keyring:

```nix
services.gnome.gnome-keyring.enable = true;
# unlock it with your login, e.g. for greetd / a display manager:
security.pam.services.greetd.enableGnomeKeyring = true;
```

Without a Secret Service the pairing page says “Could not read the keychain…” and the app
can't stay paired.

## Updates

The app doesn't update itself when it comes from Nix (the store is read-only): Settings →
Desktop app says “Updates come with Nix” and offers no update check or track switch. It
updates with its flake input:

```sh
nix flake update libe                       # in your system flake
sudo nixos-rebuild switch --flake .#my-host
```

The input's branch is the track: switch between `channel/stable` and `channel/nightly` by
changing `inputs.libe.url` (then `nix flake update libe`).

Automatically, with the NixOS auto-upgrade service and a system flake in a local git repository:

```nix
system.autoUpgrade = {
  enable = true;
  flake = "/etc/nixos#my-host"; # where your system flake lives
  flags = [
    "--update-input"
    "libe" # only libe; add "nixpkgs" too for the whole system
    "--commit-lock-file"
  ];
  dates = "daily";
};
```

A `nix run github:antonsxh/libe/channel/stable` always fetches the channel's current commit
(Nix caches the branch lookup for an hour; `--refresh` skips that).

## Troubleshooting

- **Blank or white window, “GBM” / “DMABUF” errors** (mostly the proprietary NVIDIA driver):
  WebKitGTK's DMABUF renderer. Start it with `WEBKIT_DISABLE_DMABUF_RENDERER=1 libe`; to make
  that permanent, `environment.sessionVariables.WEBKIT_DISABLE_DMABUF_RENDERER = "1";` (affects
  every WebKitGTK app). The package already sets `__NV_DISABLE_EXPLICIT_SYNC=1` (nixpkgs'
  Tauri hook) for the NVIDIA explicit-sync flicker. Overriding the package itself would change
  its store path and therefore build it locally.
- **Your server uses a self-signed certificate**: the app accepts only certificates the system
  trusts — add your CA with `security.pki.certificateFiles`.
- **Built from source although the cache is configured**: check that you didn't add
  `inputs.libe.inputs.nixpkgs.follows`, and that the reference is a channel or `nix-v…` tag
  (other commits are never in the cache).
