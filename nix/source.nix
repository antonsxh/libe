# The source of the desktop package: only what the client build reads. Changes to the web app
# (src/, e2e/, …) leave it, and therefore the derivation and its cached store path, untouched.
# flake.nix also derives the version of unreleased builds from its store hash.
{ lib }:

lib.fileset.toSource {
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
}
