#!/usr/bin/env bash
# Local Postgres 17 for development on machines without Docker (Linux x64).
# Uses the prebuilt binaries from the `@embedded-postgres/linux-x64` npm package,
# installed into ~/.cache/libe-pg (outside the repo). Data lives there too.
#
#   scripts/dev-db.sh start    # install on first run, init cluster, start on :54330, create DB "libe"
#   scripts/dev-db.sh stop
#   scripts/dev-db.sh status
#   scripts/dev-db.sh reset    # stop, wipe data, start fresh (then run db:migrate)
#
# Connection: postgres://libe:libe@127.0.0.1:54330/libe
set -euo pipefail

PG_VERSION="17.11.0-beta.19"
HOME_DIR="${LIBE_PG_HOME:-$HOME/.cache/libe-pg}"
PORT="${LIBE_PG_PORT:-54330}"
PKG="$HOME_DIR/node_modules/@embedded-postgres/linux-x64"
BIN="$PKG/native/bin"
DATA="$HOME_DIR/data"
LOG="$HOME_DIR/postgres.log"

install() {
	[[ -x "$BIN/postgres" ]] && return
	if [[ "$(uname -sm)" != "Linux x86_64" ]]; then
		echo "dev-db.sh only supports Linux x64; use 'docker compose up -d db' instead." >&2
		exit 1
	fi
	echo "[dev-db] installing Postgres binaries ($PG_VERSION) into $HOME_DIR"
	mkdir -p "$HOME_DIR"
	(cd "$HOME_DIR" && { [[ -f package.json ]] || echo '{"private":true}' > package.json; } \
		&& bun add --silent "@embedded-postgres/linux-x64@$PG_VERSION")
	# The package ships its symlinks as a JSON list; recreate them (normally a postinstall step).
	node "$PKG/scripts/hydrate-symlinks.js"
}

init() {
	[[ -f "$DATA/PG_VERSION" ]] && return
	echo "[dev-db] initialising cluster in $DATA"
	local pw
	pw="$(mktemp)"
	echo libe > "$pw"
	"$BIN/initdb" -D "$DATA" -U libe --pwfile="$pw" -A scram-sha-256 -E UTF8 --locale=C > /dev/null
	rm -f "$pw"
}

running() { "$BIN/pg_ctl" -D "$DATA" status > /dev/null 2>&1; }

start() {
	install
	init
	if running; then
		echo "[dev-db] already running on :$PORT"
	else
		"$BIN/pg_ctl" -D "$DATA" -l "$LOG" -w \
			-o "-p $PORT -k /tmp -c listen_addresses=127.0.0.1" start > /dev/null
		echo "[dev-db] started on :$PORT (log: $LOG)"
	fi
	PGPASSWORD=libe bun -e "
		import postgres from 'postgres';
		const s = postgres('postgres://libe:libe@127.0.0.1:$PORT/postgres', { max: 1, onnotice: () => {} });
		const [row] = await s\`select 1 from pg_database where datname = 'libe'\`;
		if (!row) { await s\`create database libe\`; console.log('[dev-db] created database libe'); }
		await s.end();
	"
	echo "DATABASE_URL=postgres://libe:libe@127.0.0.1:$PORT/libe"
}

stop() {
	[[ -x "$BIN/pg_ctl" ]] && running && "$BIN/pg_ctl" -D "$DATA" -m fast -w stop > /dev/null && echo "[dev-db] stopped" || echo "[dev-db] not running"
}

cd "$(dirname "$0")/.."
case "${1:-start}" in
	start) start ;;
	stop) stop ;;
	status) running && echo "[dev-db] running on :$PORT" || echo "[dev-db] not running" ;;
	reset) stop; rm -rf "$DATA"; start ;;
	*) echo "usage: $0 start|stop|status|reset" >&2; exit 2 ;;
esac
