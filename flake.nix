{
  # The libe desktop app (the Tauri thin client) for NixOS — not the server, which ships as a
  # Docker image. User docs: docs/NIXOS.md. Maintainers: docs/RELEASING.md ("NixOS").
  #
  #   nix run github:antonsxh/libe/channel/stable          # released builds, from the binary cache
  #   nix run github:antonsxh/libe/channel/nightly
  #
  # The release pipeline builds every stable/nightly release on x86_64 and aarch64, pushes it to
  # https://libe.cachix.org and only then moves `channel/<track>` to that commit (the released
  # commit plus its version files and `nix/release.json`).
  description = "libe desktop app: a thin client for a self-hosted libe server";

  nixConfig = {
    extra-substituters = [ "https://libe.cachix.org" ];
    extra-trusted-public-keys = [
      "libe.cachix.org-1:GVJ+gyp4hy8MhlJbdHYuGHYSnzB39z7eCefKzo08LUk="
    ];
  };

  # The current stable NixOS release: its packages (WebKitGTK, GTK, Rust) are on
  # cache.nixos.org, so users of the binary cache download only libe itself.
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-26.05";

  outputs =
    { self, nixpkgs }:
    let
      inherit (nixpkgs) lib;
      systems = [
        "x86_64-linux"
        "aarch64-linux"
      ];
      forAllSystems = f: lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});

      # The files the client build reads (nix/source.nix).
      src = import ./nix/source.nix { inherit lib; };

      # Release commits (`channel/*`, written by release.yml) carry `nix/release.json` and the
      # release version in their version files. Any other commit reports the committed version
      # (the last stable release) plus the first 7 characters of the source's store hash, e.g.
      # `0.2.0+src.1a2b3c4`. Not the git revision: then every commit would be a new derivation,
      # and the cache (CI pushes main's builds) could never serve a commit that leaves
      # `src-tauri/` alone.
      committed = (lib.importJSON ./src-tauri/tauri.conf.json).version;
      release =
        if builtins.pathExists ./nix/release.json then lib.importJSON ./nix/release.json else null;
      sourceHash = builtins.substring 0 7 (
        builtins.unsafeDiscardStringContext (baseNameOf "${src}")
      );
      version =
        if release == null then
          "${committed}+src.${sourceHash}"
        else if release.version == committed then
          release.version
        else
          throw "nix/release.json names ${release.version}, but tauri.conf.json has ${committed}";
    in
    {
      packages = forAllSystems (
        pkgs:
        let
          desktop = pkgs.callPackage ./nix/libe-desktop.nix { inherit src version; };
        in
        {
          inherit desktop;
          default = desktop;
        }
      );

      apps = forAllSystems (
        pkgs:
        let
          app = {
            type = "app";
            program = lib.getExe self.packages.${pkgs.stdenv.hostPlatform.system}.desktop;
            meta.description = "libe desktop app";
          };
        in
        {
          desktop = app;
          default = app;
        }
      );

      checks = forAllSystems (pkgs: {
        desktop = self.packages.${pkgs.stdenv.hostPlatform.system}.desktop;
      });

      formatter = forAllSystems (pkgs: pkgs.nixfmt);
    };
}
