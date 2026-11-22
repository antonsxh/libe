/**
 * A fake Web Push service for `push.spec.ts`: a local HTTP server on `FAKE_PUSH_ORIGIN` that
 * records every request and answers 201 (or a status set per endpoint). The app under test
 * accepts subscriptions to this origin through `LIBE_PUSH_TEST_ENDPOINT_ORIGIN` (`serverEnv`).
 */
import { createServer, type Server } from 'node:http';
import { FAKE_PUSH_ORIGIN, FAKE_PUSH_PORT } from './env.ts';
import { uid } from './db.ts';

export interface PushRequest {
	path: string;
	method: string;
	headers: Record<string, string>;
	body: Uint8Array;
}

export class FakePushService {
	readonly requests: PushRequest[] = [];
	#status = new Map<string, number>();
	#server: Server | null = null;

	async start(): Promise<void> {
		this.#server = createServer((req, res) => {
			const chunks: Buffer[] = [];
			req.on('data', (c: Buffer) => chunks.push(c));
			req.on('end', () => {
				const path = req.url ?? '/';
				const headers: Record<string, string> = {};
				for (const [k, v] of Object.entries(req.headers)) headers[k] = String(v);
				this.requests.push({
					path,
					method: req.method ?? '',
					headers,
					body: new Uint8Array(Buffer.concat(chunks))
				});
				res.writeHead(this.#status.get(path) ?? 201).end();
			});
		});
		await new Promise<void>((resolve, reject) => {
			this.#server!.once('error', reject);
			this.#server!.listen(FAKE_PUSH_PORT, '127.0.0.1', resolve);
		});
	}

	async stop(): Promise<void> {
		await new Promise<void>((resolve) =>
			this.#server ? this.#server.close(() => resolve()) : resolve()
		);
	}

	/** A fresh endpoint URL; `status` = what the service answers for it (default 201 Created). */
	endpoint(status?: number): string {
		const path = `/push/${uid()}`;
		if (status) this.#status.set(path, status);
		return `${FAKE_PUSH_ORIGIN}${path}`;
	}

	/** Requests received for one endpoint URL. */
	to(endpoint: string): PushRequest[] {
		const path = new URL(endpoint).pathname;
		return this.requests.filter((r) => r.path === path);
	}
}
