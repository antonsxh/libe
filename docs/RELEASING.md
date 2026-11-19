# Releasing

CI and releases run on GitHub Actions, modelled on
[pingdotgg/t3code](https://github.com/pingdotgg/t3code)'s release train: nightlies are the release
candidates, stable promotes a nightly that people already ran, previews test the pipeline itself.

## Workflows

| File                            | Trigger                                    | What                                                                                                        |
| ------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `.github/workflows/ci.yml`      | pull requests, pushes to `main`            | `checks.yml` + `docker.yml` (build and smoke test, no push)                                                 |
| `.github/workflows/release.yml` | hourly schedule, manual dispatch, `v*` tag | plan → checks + desktop + docker in parallel → tag image → GitHub release → (stable) version bump on `main` |
| `.github/workflows/checks.yml`  | called by both                             | typecheck, lint, unit tests, build · e2e desktop + iPhone/iPad (one job) · Tauri clippy + e2e (Xvfb)        |
| `.github/workflows/docker.yml`  | called by both                             | native amd64 + arm64 image builds, smoke test against Postgres 17, optional push by digest                  |
| `.github/workflows/desktop.yml` | called by `release.yml`                    | Tauri installers: Linux x64/arm64 (`.deb`, `.AppImage`), macOS arm64/x64 (`.dmg`), Windows x64 (NSIS)       |
| `scripts/release.ts`            | used by the workflows                      | `plan` (channel, commit, version, tags; tests in `scripts/release.test.ts`), `set-version <v>`              |

Nothing is published unless **every** job passed: checks, all desktop targets and both image
smoke tests. The image is first pushed untagged (by digest); the channel tags are only set
afterwards, right before the GitHub release is created.

## Channels

| Channel | How it starts                                                                                                                           | Version                     | GitHub release                       | Image tags                                                 |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ------------------------------------ | ---------------------------------------------------------- |
| nightly | schedule (hourly check) when `main` moved since the last nightly **and** that one is ≥ 6 h old; or dispatch `channel=nightly` on `main` | `0.2.1-nightly.20261119.42` | prerelease, never "latest"           | `0.2.1-nightly.20261119.42`, `nightly`                     |
| preview | dispatch `channel=preview` on **any branch**                                                                                            | `0.2.1-preview.20261119.43` | **draft** (no git tag), warning text | `0.2.1-preview.20261119.43` only                           |
| stable  | dispatch `channel=stable` on `main`, or push a tag `vX.Y.Z`                                                                             | `0.2.1`                     | release, marked "latest"             | `0.2.1`, `0.2`, `0` (from 1.0 on: `1`), `stable`, `latest` |

- **Versions.** `package.json` (and `src-tauri/tauri.conf.json`, `Cargo.toml`, `Cargo.lock`,
  kept equal by `scripts/release.ts set-version`) holds the **last stable** version. Nightlies
  and previews preview the next patch: `<patch + 1>-<channel>.<UTC date>.<run number>`.
  `0.0.0` means "nothing released yet".
- **Stable by dispatch** builds the commit of the **latest published nightly**, not `main` HEAD,
  and defaults to the version that nightly previewed (`0.2.1-nightly.*` → `0.2.1`). Pass
  `version` (e.g. `0.3.0`) for a minor/major bump. Afterwards the `finalize` job commits the
  version files to `main` (`chore(release): v0.2.1`, as `github-actions[bot]`), so the next
  nightlies become `0.2.2-nightly.*`.
- **Stable by tag** builds exactly the tagged commit (`git tag v0.2.1 <sha> && git push origin v0.2.1`).
  A suffix (`v0.3.0-rc.1`) makes it a GitHub prerelease whose image only gets its exact tag.
- A stable version must be newer than the newest stable release and must not exist yet.
- Release notes are GitHub's generated notes since the previous tag **of the same channel**
  (stable since the previous stable, nightly since the previous nightly), below a short block
  with the `docker pull` line and the installers.
- Concurrency: nightlies and previews queue in one group, stable in another; running releases
  are never cancelled.

## Everyday use

```sh
# Test the whole pipeline on a branch without shipping anything (draft release, exact image tag)
gh workflow run release.yml --ref my-branch -f channel=preview

# Nightly now, without waiting for the schedule (main only)
gh workflow run release.yml -f channel=nightly

# Promote the latest nightly to stable (main only); optionally choose the version
gh workflow run release.yml -f channel=stable
gh workflow run release.yml -f channel=stable -f version=0.3.0

gh run watch                                   # follow the run
```

Pause the nightly schedule with the repository variable `PAUSE_NIGHTLY=true`
(Settings → Secrets and variables → Actions → Variables). Manual runs still work.

Delete preview drafts on the releases page when you no longer need them; their images stay in
GHCR under their exact version (Packages → libe → versions) and can be deleted there.

## Docker image

`ghcr.io/antonsxh/libe` (linux/amd64 + linux/arm64, both built natively and smoke-tested: the
container must become healthy, apply every migration in `drizzle/`, render `/setup`, and answer
`401` to an unpaired API call). `compose.yaml` uses `${LIBE_IMAGE:-ghcr.io/antonsxh/libe:stable}`.

The first push creates the package. If it shows as private, make it public once under
Packages → libe → Package settings → Change visibility (then `docker pull` needs no login).

## Desktop installers

Unsigned. macOS: the `.dmg` carries an ad-hoc signature (Apple Silicon refuses fully unsigned
apps); open it once via right-click → Open, or `xattr -dr com.apple.quarantine /Applications/libe.app`.
Windows SmartScreen: "More info" → "Run anyway". Signing would need an Apple Developer ID and a
Windows code-signing certificate as repository secrets (not set up). There is no auto-updater:
the app is a thin shell, the server (image) carries every feature.

## Secrets and permissions

None to configure. Everything uses the workflow's `GITHUB_TOKEN` (`contents: write` for the
release and the version bump, `packages: write` for GHCR). If `main` gets branch protection
that blocks direct pushes, the `finalize` job needs an exception for `github-actions[bot]`.
