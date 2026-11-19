# Releasing

CI and releases run on GitHub Actions, modelled on
[pingdotgg/t3code](https://github.com/pingdotgg/t3code)'s release train: nightlies are the release
candidates, stable promotes a nightly that people already ran, previews test the pipeline itself.

## Workflows

| File                            | Trigger                                    | What                                                                                                                     |
| ------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `.github/workflows/ci.yml`      | pull requests, pushes to `main`            | `checks.yml` + `docker.yml` (build and smoke test, no push)                                                              |
| `.github/workflows/release.yml` | hourly schedule, manual dispatch, `v*` tag | plan → checks + desktop + docker in parallel → tag image → GitHub release → (stable) version bump on `main`              |
| `.github/workflows/checks.yml`  | called by both                             | typecheck, lint, unit tests, build · e2e desktop + iPhone/iPad (one job) · Tauri clippy + e2e (Xvfb)                     |
| `.github/workflows/docker.yml`  | called by both                             | native amd64 + arm64 image builds, smoke test against Postgres 17, optional push by digest                               |
| `.github/workflows/desktop.yml` | called by `release.yml`                    | Tauri installers: Linux x64/arm64 (`.deb`, `.AppImage`), macOS arm64/x64 (`.dmg`), Windows x64 (NSIS)                    |
| `scripts/release.ts`            | used by the workflows                      | `plan` (channel, commit, version, tags), `set-version <v>`, `updater-manifest <dir>`; tests in `scripts/release.test.ts` |

Nothing is published unless **every** job passed: checks, all desktop targets and both image
smoke tests. The image is first pushed untagged (by digest); the channel tags are only set
afterwards, right before the GitHub release is created.

**Checks are not repeated for a commit that already passed them** (`plan` outputs `verified`,
logic in `checksDecision`, `scripts/release.ts`):

| Release            | Checks                                                                                                                                                                |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| nightly (schedule) | reuses the passed `ci.yml` push run of the commit. CI still running → no release, the next hourly check retries. CI failed → no nightly. No CI run → runs the checks. |
| nightly (dispatch) | reuses a passed CI run; CI failed → the run fails (fix `main`, or re-run CI after a flake); running/none → runs the checks itself.                                    |
| stable (dispatch)  | skipped: the promoted nightly only shipped after every check passed for that commit.                                                                                  |
| stable (tag)       | reuses a passed CI run of the tagged commit, otherwise runs the checks.                                                                                               |
| preview            | always runs the checks.                                                                                                                                               |

Desktop builds and the image builds + smoke tests always run.

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
Windows code-signing certificate as repository secrets (not set up).

### Auto-update feed

Installed apps update themselves on their **update track** (Settings → Desktop app: Stable or
Nightly; see docs/TAURI.md). The desktop builds also produce the updater payloads with minisign
signatures (`*.AppImage.sig`, `*.deb.sig`, `*.app.tar.gz` + `.sig`, `*-setup.exe.sig`); the
release job turns them into a Tauri manifest (`bun scripts/release.ts updater-manifest dist` →
`latest.json`, attached to the release) and, for nightlies and `latest` stable releases, copies
it to the release **`update-feed`** as `nightly.json` / `stable.json` (created on first use, a
prerelease that is never "latest" — don't delete it). Previews and `-rc` releases never reach a
feed. To stop offering a broken build, put the previous release's manifest back
(`gh release download v0.2.0 --pattern latest.json && mv latest.json stable.json && gh release upload update-feed stable.json --clobber`);
apps that already installed it only move on with the next, newer release.

## Secrets and permissions

One secret: **`TAURI_SIGNING_PRIVATE_KEY`** (the updater signing key, see docs/TAURI.md;
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` only if the key has one). Without it the desktop builds
fail. Everything else uses the workflow's `GITHUB_TOKEN` (`contents: write` for the
release, the update feed and the version bump, `packages: write` for GHCR). If `main` gets branch protection
that blocks direct pushes, the `finalize` job needs an exception for `github-actions[bot]`.
