/**
 * Fixed-window failure counter per key (client IP), kept in memory. libe runs as a single
 * process, so this is enough to slow down guessing pairing codes / the setup secret.
 * Time is injected so the logic is testable.
 */
export interface RateLimitResult {
	ok: boolean;
	/** Milliseconds until the key may try again (0 when `ok`). */
	retryAfterMs: number;
}

export class RateLimiter {
	#hits = new Map<string, { count: number; resetAt: number }>();
	#lastSweep = 0;

	constructor(
		readonly limit: number,
		readonly windowMs: number
	) {}

	/** May `key` try now? Doesn't count anything. */
	check(key: string, now = Date.now()): RateLimitResult {
		this.#sweep(now);
		const entry = this.#hits.get(key);
		if (!entry || entry.resetAt <= now || entry.count < this.limit)
			return { ok: true, retryAfterMs: 0 };
		return { ok: false, retryAfterMs: entry.resetAt - now };
	}

	/** Record one failed attempt for `key`. */
	fail(key: string, now = Date.now()): void {
		const entry = this.#hits.get(key);
		if (!entry || entry.resetAt <= now)
			this.#hits.set(key, { count: 1, resetAt: now + this.windowMs });
		else entry.count++;
	}

	reset(key: string): void {
		this.#hits.delete(key);
	}

	get size(): number {
		return this.#hits.size;
	}

	/** Drop expired windows now and then so the map can't grow without bound. */
	#sweep(now: number) {
		if (now - this.#lastSweep < this.windowMs) return;
		this.#lastSweep = now;
		for (const [key, entry] of this.#hits) if (entry.resetAt <= now) this.#hits.delete(key);
	}
}
