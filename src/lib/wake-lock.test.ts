import { describe, expect, test } from 'bun:test';
import {
	ScreenWakeLock,
	shouldHoldWakeLock,
	type Sentinel,
	type WakeLockHost
} from './wake-lock.ts';

describe('shouldHoldWakeLock', () => {
	test('only while running and visible', () => {
		expect(shouldHoldWakeLock('running', 'visible')).toBe(true);
		expect(shouldHoldWakeLock('running', 'hidden')).toBe(false);
		expect(shouldHoldWakeLock('paused', 'visible')).toBe(false);
		expect(shouldHoldWakeLock('waiting', 'visible')).toBe(false);
		expect(shouldHoldWakeLock(null, 'visible')).toBe(false);
	});
});

class FakeSentinel implements Sentinel {
	released = false;
	#listeners: (() => void)[] = [];
	async release() {
		if (this.released) return;
		this.released = true;
		for (const l of this.#listeners) l();
	}
	addEventListener(_type: 'release', listener: () => void) {
		this.#listeners.push(listener);
	}
}

function host(opts: { deny?: boolean } = {}) {
	const sentinels: FakeSentinel[] = [];
	const h: WakeLockHost = {
		wakeLock: {
			async request() {
				if (opts.deny) throw new DOMException('denied', 'NotAllowedError');
				const s = new FakeSentinel();
				sentinels.push(s);
				return s;
			}
		}
	};
	return { h, sentinels };
}

describe('ScreenWakeLock', () => {
	test('unsupported: a no-op', async () => {
		const lock = new ScreenWakeLock({});
		expect(lock.supported).toBe(false);
		await lock.set(true);
		expect(lock.held).toBe(false);
	});

	test('acquires once, releases on set(false)', async () => {
		const { h, sentinels } = host();
		const lock = new ScreenWakeLock(h);
		await lock.set(true);
		await lock.set(true);
		expect(sentinels).toHaveLength(1);
		expect(lock.held).toBe(true);
		await lock.set(false);
		expect(sentinels[0].released).toBe(true);
		expect(lock.held).toBe(false);
	});

	test('re-acquires after the browser dropped the lock (page hidden)', async () => {
		const { h, sentinels } = host();
		const lock = new ScreenWakeLock(h);
		await lock.set(true);
		await sentinels[0].release(); // the system released it
		expect(lock.held).toBe(false);
		await lock.set(true);
		expect(sentinels).toHaveLength(2);
		expect(lock.held).toBe(true);
	});

	test('a release requested while the request is pending wins', async () => {
		const { h, sentinels } = host();
		const lock = new ScreenWakeLock(h);
		const first = lock.set(true);
		void lock.set(false);
		await first;
		expect(sentinels).toHaveLength(1);
		expect(sentinels[0].released).toBe(true);
		expect(lock.held).toBe(false);
	});

	test('a denied request never throws', async () => {
		const { h } = host({ deny: true });
		const lock = new ScreenWakeLock(h);
		await lock.set(true);
		expect(lock.held).toBe(false);
	});
});
