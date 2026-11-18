import { getTimerSnapshot } from '#lib/server/timer.ts';
import { subscribeTimer } from '#lib/server/timer-hub.ts';
import type { TimerSnapshot } from '#lib/timer.ts';
import type { RequestHandler } from './$types';

/** Comment line every 25 s keeps proxies/browsers from closing an idle stream. */
const HEARTBEAT_MS = 25_000;

/**
 * Server-sent events: `event: timer` with the full {@link TimerSnapshot} on connect and on
 * every change (in-process pub/sub, see `timer-hub.ts`). Each push carries the server `now`
 * at send time so clients can correct their clock offset.
 */
export const GET: RequestHandler = async ({ request }) => {
	const encoder = new TextEncoder();
	let cleanup = () => {};

	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			let closed = false;
			const send = (chunk: string) => {
				if (closed) return;
				try {
					controller.enqueue(encoder.encode(chunk));
				} catch {
					cleanup();
				}
			};
			const push = (snapshot: TimerSnapshot) =>
				send(`event: timer\ndata: ${JSON.stringify({ ...snapshot, now: Date.now() })}\n\n`);

			const unsubscribe = subscribeTimer(push);
			const heartbeat = setInterval(() => send(`: ping ${Date.now()}\n\n`), HEARTBEAT_MS);
			cleanup = () => {
				if (closed) return;
				closed = true;
				clearInterval(heartbeat);
				unsubscribe();
				request.signal.removeEventListener('abort', cleanup);
				try {
					controller.close();
				} catch {
					// already closed by the runtime
				}
			};
			request.signal.addEventListener('abort', cleanup);

			send('retry: 3000\n\n');
			push(await getTimerSnapshot());
		},
		cancel() {
			cleanup();
		}
	});

	return new Response(stream, {
		headers: {
			'content-type': 'text/event-stream; charset=utf-8',
			'cache-control': 'no-cache, no-transform',
			connection: 'keep-alive',
			'x-accel-buffering': 'no'
		}
	});
};
