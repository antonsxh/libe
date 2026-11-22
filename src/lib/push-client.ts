/**
 * Web Push and the app icon badge in the browser (feature-detected; nothing here ever throws
 * or logs — the e2e console guard fails on errors). The service worker is registered by the
 * root layout in production builds only, so in `vite dev` push is "unsupported".
 */
type BadgeNavigator = Navigator & {
	setAppBadge?: (n?: number) => Promise<void>;
	clearAppBadge?: () => Promise<void>;
};

/** Push API, Notifications and service workers exist here (Safari tabs on iOS: no PushManager). */
export function pushSupported(): boolean {
	return (
		typeof window !== 'undefined' &&
		'serviceWorker' in navigator &&
		'PushManager' in window &&
		'Notification' in window
	);
}

export function notificationPermission(): NotificationPermission {
	return 'Notification' in globalThis ? Notification.permission : 'default';
}

/** The active service worker registration, or null (none registered / not ready in time). */
export async function swRegistration(timeoutMs = 4000): Promise<ServiceWorkerRegistration | null> {
	if (!('serviceWorker' in navigator)) return null;
	try {
		const reg = await navigator.serviceWorker.getRegistration();
		if (reg?.active) return reg;
		// Not registered yet (the root layout registers it after the first render) or still
		// installing: wait a moment. In `vite dev` nothing registers → null after the timeout.
		return await Promise.race([
			navigator.serviceWorker.ready,
			new Promise<null>((r) => setTimeout(() => r(null), timeoutMs))
		]);
	} catch {
		return null;
	}
}

/** This browser's current push subscription (null when none / unsupported). */
export async function currentSubscription(): Promise<PushSubscription | null> {
	if (!pushSupported()) return null;
	const reg = await swRegistration();
	try {
		return (await reg?.pushManager.getSubscription()) ?? null;
	} catch {
		return null;
	}
}

export function base64urlToBytes(value: string): Uint8Array<ArrayBuffer> {
	const b64 = value.replace(/-/g, '+').replace(/_/g, '/');
	const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
	return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** The JSON body of `POST /api/push` for a browser subscription. */
export function subscriptionBody(sub: PushSubscription) {
	const json = sub.toJSON();
	return {
		endpoint: sub.endpoint,
		keys: { p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' }
	};
}

/**
 * Keep the app icon badge at `count` (today's open tasks; 0 clears it) — only while this
 * device has notifications on: iOS shows badges only with notification permission, and the
 * badge belongs to the same opt-in.
 */
export async function syncAppBadge(count: number | null): Promise<void> {
	const nav = navigator as BadgeNavigator;
	if (count === null || !nav.setAppBadge || !nav.clearAppBadge) return;
	if (notificationPermission() !== 'granted') return;
	if (!(await currentSubscription())) return;
	try {
		await (count > 0 ? nav.setAppBadge(count) : nav.clearAppBadge());
	} catch {
		// Not an installed app / not allowed: no badge, no noise.
	}
}

export async function clearAppBadge(): Promise<void> {
	const nav = navigator as BadgeNavigator;
	try {
		await nav.clearAppBadge?.();
	} catch {
		// ignore
	}
}
