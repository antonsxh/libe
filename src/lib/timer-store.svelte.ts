/**
 * Client view of the server timer — one instance per app (created in the root layout and
 * shared via context, so SSR requests never share state).
 *
 * - Seeded with the snapshot from the root layout `load`, then kept fresh by one SSE
 *   connection (`/api/timer/stream`, reconnect with exponential backoff).
 * - Renders from server timestamps: `serverNow = Date.now() + offset`, where the offset comes
 *   from each snapshot's `now`. A local 250 ms tick only advances the clock — the client never
 *   decides state; every mutation goes through `POST /api/timer`.
 * - When the active session changes (completed, stopped, a pomodoro round rolled over) the
 *   page data is refreshed so logged times / done states update.
 */
import { getContext, setContext, untrack } from 'svelte';
import { refreshAll } from '$app/navigation';
import {
	timerView,
	type TimerMode,
	type TimerSnapshot,
	type TimerView,
	type SimpleAction
} from '#lib/timer.ts';

export interface TaskRef {
	id: string;
	title: string;
}

export interface StartRequest {
	task: TaskRef;
	mode: TimerMode;
	/** undefined = task default, null = stopwatch. */
	plannedMin?: number | null;
}

export type ActResult = { ok: true } | { ok: false; code: string; error: string };

const STREAM_URL = '/api/timer/stream';
const API_URL = '/api/timer';
const TICK_MS = 250;
const MAX_BACKOFF_MS = 30_000;

export class TimerStore {
	snapshot = $state() as TimerSnapshot;
	/** serverNow − clientNow, from the latest snapshot. */
	offset = $state(0);
	clientNow = $state(Date.now());
	connected = $state(false);
	busy = $state(false);
	/** Last failed mutation (shown inline by the focus screen). */
	error = $state<string | null>(null);
	/** A start that was rejected because another timer is active → "Stop current and start this?". */
	switchRequest = $state<(StartRequest & { navigate: boolean }) | null>(null);
	/** Task whose "Log time…" dialog is open. */
	logTarget = $state<TaskRef | null>(null);

	serverNow = $derived(this.clientNow + this.offset);
	timer = $derived(this.snapshot.timer);
	settings = $derived(this.snapshot.settings);
	view: TimerView | null = $derived(
		this.snapshot.timer
			? timerView(this.snapshot.timer, this.snapshot.settings, this.serverNow)
			: null
	);

	/** Snapshot (`now`) we already asked the server to roll forward. */
	#nudgedFor: number | null = null;
	#lastNudge = 0;
	/** Set on `beforeunload`: a refresh started now would only be aborted by the unload. */
	#unloading = false;
	#refreshQueued = false;

	constructor(initial: TimerSnapshot) {
		this.snapshot = initial;
		this.offset = initial.now - Date.now();
	}

	/** Take a snapshot unless it is older than the one shown. */
	apply(snap: TimerSnapshot, receivedAt = Date.now()): void {
		untrack(() => {
			const prev = this.snapshot;
			if (snap.now < prev.now) return;
			const key = (s: TimerSnapshot) => `${s.timer?.task.id ?? ''}|${s.timer?.session?.id ?? ''}`;
			const changedSession = key(prev) !== key(snap);
			this.snapshot = snap;
			this.offset = snap.now - receivedAt;
			this.clientNow = receivedAt;
			if (changedSession) this.#queueRefresh();
		});
	}

	#queueRefresh() {
		if (this.#refreshQueued || this.#unloading || typeof window === 'undefined') return;
		this.#refreshQueued = true;
		queueMicrotask(() => {
			this.#refreshQueued = false;
			// Navigating away / reloading aborts the refresh — nothing to recover.
			refreshAll().catch(() => {});
		});
	}

	/** Open the SSE stream and the local tick; returns the cleanup. Call once (root layout). */
	connect(): () => void {
		let source: EventSource | null = null;
		let retry: ReturnType<typeof setTimeout> | undefined;
		let attempt = 0;
		let stopped = false;

		const open = () => {
			if (stopped) return;
			source = new EventSource(STREAM_URL);
			source.addEventListener('timer', (e) => {
				attempt = 0;
				this.connected = true;
				try {
					this.apply(JSON.parse((e as MessageEvent<string>).data) as TimerSnapshot);
				} catch {
					// ignore a malformed frame; the next push replaces it
				}
			});
			source.onerror = () => {
				this.connected = false;
				source?.close();
				source = null;
				if (stopped) return;
				const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** attempt++);
				retry = setTimeout(open, delay);
			};
		};
		open();

		// A reload can make the server roll a pomodoro forward and push to *this* (old)
		// document; don't start a data refresh the unload would abort. Reset in case the
		// unload doesn't happen (e.g. a download link).
		const onUnload = () => {
			this.#unloading = true;
			setTimeout(() => (this.#unloading = false), 3000);
		};
		window.addEventListener('beforeunload', onUnload);

		const tick = setInterval(() => {
			this.clientNow = Date.now();
			this.#maybeNudge();
		}, TICK_MS);

		return () => {
			stopped = true;
			clearTimeout(retry);
			clearInterval(tick);
			window.removeEventListener('beforeunload', onUnload);
			source?.close();
			this.connected = false;
		};
	}

	/**
	 * A pomodoro phase just ended locally: ask the server to roll the run forward (it persists
	 * the round and broadcasts to every client). Display already shows the projected phase.
	 */
	#maybeNudge() {
		const { stale, snapNow } = untrack(() => ({
			stale: this.view?.stale ?? false,
			snapNow: this.snapshot.now
		}));
		const t = Date.now();
		// Once per snapshot, at most every second (clock-offset jitter near the boundary).
		if (!stale || this.#nudgedFor === snapNow || t - this.#lastNudge < 1000) return;
		this.#nudgedFor = snapNow;
		this.#lastNudge = t;
		void this.refresh();
	}

	async refresh(): Promise<void> {
		try {
			const res = await fetch(API_URL, { headers: { accept: 'application/json' } });
			if (res.ok) this.apply((await res.json()) as TimerSnapshot);
		} catch {
			// offline — the SSE reconnect will catch up
		}
	}

	async act(body: Record<string, unknown>): Promise<ActResult> {
		this.busy = true;
		try {
			const res = await fetch(API_URL, {
				method: 'POST',
				headers: { 'content-type': 'application/json', accept: 'application/json' },
				body: JSON.stringify(body)
			});
			const data = (await res.json().catch(() => null)) as
				{ ok: true; snapshot: TimerSnapshot } | { ok: false; code: string; error: string } | null;
			if (!data) {
				this.error = `Request failed (${res.status}).`;
				return { ok: false, code: 'http', error: this.error };
			}
			if (data.ok) {
				this.error = null;
				this.apply(data.snapshot);
				return { ok: true };
			}
			if (data.code !== 'conflict') this.error = data.error;
			return data;
		} catch {
			this.error = 'Network error — try again.';
			return { ok: false, code: 'network', error: this.error };
		} finally {
			this.busy = false;
		}
	}

	command(action: SimpleAction): Promise<ActResult> {
		return this.act({ action });
	}

	/**
	 * Start a timer for a task. If another one is active, the request is parked in
	 * `switchRequest` (the root layout asks "Stop current and start this?") and false returned.
	 */
	async start(req: StartRequest, opts: { replace?: boolean; navigate?: boolean } = {}) {
		const res = await this.act({
			action: 'start',
			taskId: req.task.id,
			mode: req.mode,
			plannedMin: req.plannedMin,
			replace: opts.replace ?? false
		});
		if (!res.ok && res.code === 'conflict') {
			this.switchRequest = { ...req, navigate: opts.navigate ?? false };
		}
		return res.ok;
	}
}

const KEY = Symbol('timer-store');

export function setTimerStore(store: TimerStore): TimerStore {
	return setContext(KEY, store);
}

export function useTimer(): TimerStore {
	const store = getContext<TimerStore | undefined>(KEY);
	if (!store) throw new Error('useTimer() outside the root layout');
	return store;
}
