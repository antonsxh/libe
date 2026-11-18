/**
 * An extra app server process for specs that must take "the server" down (PWA offline page,
 * Tauri "can't reach your server"). The main suite's server is Playwright's `webServer`.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { ROOT, serverEnv } from './env.ts';
import { bunBin } from './db-reset.ts';

export class AppServer {
	#proc: ChildProcess | null = null;
	#log: string[] = [];
	readonly base: string;

	constructor(
		readonly port: number,
		readonly db: string
	) {
		this.base = `http://127.0.0.1:${port}`;
	}

	/** Start (resetting + seeding the database first when `reset`) and wait for `/api/health`. */
	async start(opts: { reset?: boolean } = {}): Promise<void> {
		if (this.#proc) throw new Error('server already running');
		const env = { ...process.env, ...serverEnv(this.port, this.db) };
		if (opts.reset) env.E2E_RESET_DB = this.db;
		else delete env.E2E_RESET_DB;
		const proc = spawn(bunBin(), ['e2e/support/serve.ts'], { cwd: ROOT, env });
		this.#proc = proc;
		proc.stdout?.on('data', (d) => this.#log.push(String(d)));
		proc.stderr?.on('data', (d) => this.#log.push(String(d)));
		const deadline = Date.now() + 60_000;
		while (Date.now() < deadline) {
			if (proc.exitCode !== null) break;
			const ok = await fetch(`${this.base}/api/health`).then(
				(r) => r.ok,
				() => false
			);
			if (ok) return;
			await new Promise((r) => setTimeout(r, 200));
		}
		await this.stop();
		throw new Error(`app server on :${this.port} did not come up:\n${this.#log.join('')}`);
	}

	/** Kill the process (like a crash: open SSE streams would delay a graceful stop). */
	async stop(): Promise<void> {
		const proc = this.#proc;
		if (!proc) return;
		this.#proc = null;
		if (proc.exitCode !== null || proc.signalCode !== null) return;
		const exited = new Promise((r) => proc.once('exit', r));
		proc.kill('SIGKILL');
		await exited;
	}
}
