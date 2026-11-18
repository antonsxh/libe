<img src="assets/icon.svg" width="64" height="64" alt="">

# libe

A calm, dark planner that ties every hour to a few quests.
SvelteKit 3 · Svelte 5 · Bun · Drizzle + Postgres · Docker Compose · Tauri 2 desktop shell ·
installable on iPhone/iPad as a home-screen web app.

## Run with Docker

```sh
cp .env.example .env          # set LIBE_SETUP_SECRET (openssl rand -base64 24)
docker compose up --build
# → http://localhost:3000   (migrations run automatically on start)
```

Open the app, you land on **/setup**: enter `LIBE_SETUP_SECRET` and a name for this device.
Every other device (browser, phone, desktop app) is then paired with a short code: on a paired
device open the avatar menu → **Pair new device**, and type the 6-digit code (or scan the QR
code) on the new one. There are no user accounts or passwords — devices are the sign-in.
Paired devices are listed (and can be renamed or revoked) under **Settings**.

`/setup` stays available as a recovery path if you lose every paired device — whoever knows
the server's secret owns the server anyway. Unset `LIBE_SETUP_SECRET` to switch it off
(`compose.yaml` requires it, so comment it out there too).

Env overrides: `POSTGRES_PASSWORD`, `LIBE_PORT`, `LIBE_ORIGIN`, `TZ`, `LIBE_SETUP_SECRET`.

### HTTPS (needed for iPhone/iPad, service worker and secure cookies)

The easiest way is the bundled Caddy overlay, which gets a Let's Encrypt certificate:

```sh
# .env: LIBE_DOMAIN=libe.example.com  (DNS → this host, ports 80/443 open)
docker compose -f compose.yaml -f compose.caddy.yaml up -d --build
```

Behind your own reverse proxy instead: set `LIBE_ORIGIN=https://libe.example.com` (→ the
app's `ORIGIN`). SvelteKit derives the request protocol from `ORIGIN`, so the device cookie
gets `Secure` and form posts pass the CSRF check. Alternatively set `PROTOCOL_HEADER=x-forwarded-proto`
and `HOST_HEADER=x-forwarded-host` and make sure the proxy sends them. For correct client IPs
in the pairing rate limit set `ADDRESS_HEADER=X-Forwarded-For` and `XFF_DEPTH=1` (one proxy).
The timer is a server-sent event stream: disable response buffering for `/api/timer/stream`
(Caddy does this automatically; nginx: `proxy_buffering off;`).

## iPhone / iPad (home-screen app)

1. Open your libe **https** URL in Safari.
2. Share → **Add to Home Screen** → Add.
3. Open libe from the home screen and pair it there (enter a code from a paired device, or
   scan the QR code with the Camera app and then continue inside the home-screen app).
   The home-screen app has its own cookie store, separate from Safari, so it is paired as its
   own device (shown as "Home-screen app" in Settings).

The app runs full-screen (dark status bar, safe-area aware), keeps the timer in sync when you
come back to it, and shows an offline page when the server can't be reached.

## Desktop app (Tauri 2)

A thin native window around your server (macOS, Windows, Linux) that keeps its device token in
the OS keychain. Build instructions, pairing and limitations: [docs/TAURI.md](docs/TAURI.md).

## Develop

```sh
bun install
cp .env.example .env              # LIBE_SETUP_SECRET=dev-setup-secret is fine locally
bun run db:dev                    # or: docker compose up -d db
bun run db:migrate
bun run dev                       # → open /setup, enter the secret
```

See [AGENTS.md](AGENTS.md) for conventions and [docs/ROADMAP.md](docs/ROADMAP.md) for the plan.
