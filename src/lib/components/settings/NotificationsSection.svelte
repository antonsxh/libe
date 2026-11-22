<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { Bell, BellOff, Check, Send, Share } from '@lucide/svelte';
	import Button from '#lib/components/Button.svelte';
	import { desktopApp } from '#lib/desktop.ts';
	import { isStandalone } from '#lib/pwa.ts';
	import { fadeScale } from '#lib/motion.ts';
	import { isAppleMobile, notificationsState, type NotificationsState } from '#lib/push.ts';
	import {
		base64urlToBytes,
		clearAppBadge,
		notificationPermission,
		pushSupported,
		subscriptionBody,
		swRegistration,
		syncAppBadge
	} from '#lib/push-client.ts';
	import { useI18n } from '#lib/i18n/context.svelte.ts';

	const t = useI18n();
	const n = $derived(t.settings.notifications);
	/** A device paired as the desktop app: hidden from the first (server) render on. */
	const tauri = $derived(page.data.device?.kind === 'tauri');

	/** null until the browser was asked (SSR, first frame): no buttons yet. */
	let status = $state<NotificationsState | null>(null);
	let apple = $state(false);
	let busy = $state(false);
	let error = $state<string | null>(null);
	let sent = $state(false);
	let sentTimer: ReturnType<typeof setTimeout> | undefined;
	/** VAPID public key from `GET /api/push` (fetched up front: the tap must not wait for it). */
	let publicKey: string | null = null;

	const json = (method: string, body: unknown = {}) => ({
		method,
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
	});

	function sameKey(sub: PushSubscription, key: string): boolean {
		const current = sub.options.applicationServerKey;
		if (!current) return false;
		const a = new Uint8Array(current);
		const b = base64urlToBytes(key);
		return a.length === b.length && a.every((v, i) => v === b[i]);
	}

	async function refresh() {
		const desktop = desktopApp() !== null;
		apple = isAppleMobile(navigator.userAgent, navigator.maxTouchPoints);
		const reg = !desktop && pushSupported() ? await swRegistration() : null;
		let subscribed = false;
		if (reg) {
			const [sub, server] = await Promise.all([
				reg.pushManager.getSubscription().catch(() => null),
				fetch('/api/push')
					.then((r) => (r.ok ? r.json() : null))
					.catch(() => null) as Promise<{
					publicKey: string;
					subscription: { endpoint: string } | null;
				} | null>
			]);
			publicKey = server?.publicKey ?? null;
			subscribed = !!sub && sub.endpoint === server?.subscription?.endpoint;
		}
		status = notificationsState({
			desktopApp: desktop,
			userAgent: navigator.userAgent,
			touchPoints: navigator.maxTouchPoints,
			standalone: isStandalone(),
			pushSupported: reg !== null && publicKey !== null,
			permission: notificationPermission(),
			subscribed
		});
	}

	async function turnOn() {
		error = null;
		// iOS only shows the permission prompt when it is requested inside the tap itself —
		// so this call comes before any `await`.
		const permission = Notification.requestPermission();
		busy = true;
		try {
			if ((await permission) !== 'granted') return;
			const reg = await swRegistration();
			if (!reg || !publicKey) throw new Error('no service worker');
			let sub = await reg.pushManager.getSubscription();
			if (sub && !sameKey(sub, publicKey)) {
				await sub.unsubscribe();
				sub = null;
			}
			sub ??= await reg.pushManager.subscribe({
				userVisibleOnly: true,
				applicationServerKey: base64urlToBytes(publicKey)
			});
			const res = await fetch('/api/push', json('POST', subscriptionBody(sub)));
			if (!res.ok) {
				await sub.unsubscribe().catch(() => false);
				throw new Error(`subscribe: ${res.status}`);
			}
			void syncAppBadge(page.data.badge ?? null);
		} catch {
			error = n.failed;
		} finally {
			await refresh();
			busy = false;
		}
	}

	async function turnOff() {
		error = null;
		busy = true;
		try {
			const reg = await swRegistration();
			await (await reg?.pushManager.getSubscription())?.unsubscribe();
			await fetch('/api/push', json('DELETE'));
			await clearAppBadge();
		} catch {
			// the refresh below shows what is left
		} finally {
			await refresh();
			busy = false;
		}
	}

	async function sendTest() {
		error = null;
		busy = true;
		try {
			const res = await fetch('/api/push/test', json('POST'));
			if (res.ok) {
				sent = true;
				clearTimeout(sentTimer);
				sentTimer = setTimeout(() => (sent = false), 2400);
			} else {
				error = n.testFailed;
				const body = (await res.json().catch(() => null)) as { gone?: boolean } | null;
				if (body?.gone || res.status === 404) await refresh();
			}
		} catch {
			error = n.testFailed;
		} finally {
			busy = false;
		}
	}

	onMount(() => {
		void refresh();
		return () => clearTimeout(sentTimer);
	});
</script>

{#if !tauri && status !== 'hidden'}
	<section class="card section" aria-labelledby="notifications-title" data-state={status}>
		<header class="section-head">
			<div>
				<h2 id="notifications-title" class="label">{n.title}</h2>
				<p class="muted desc">{n.desc}</p>
			</div>
			{#if status === 'off'}
				<div in:fadeScale>
					<Button variant="primary" onclick={turnOn} disabled={busy}>
						<Bell size={16} />
						{n.turnOn}
					</Button>
				</div>
			{/if}
		</header>

		{#key status}
			{#if status === 'on'}
				<div class="row" in:fadeScale>
					<p class="status" role="status">
						<span class="dot" aria-hidden="true"></span>
						{n.on}
					</p>
					<div class="actions">
						<Button variant="secondary" size="sm" onclick={sendTest} disabled={busy || sent}>
							{#if sent}
								<span class="sent" in:fadeScale><Check size={14} /> {n.sent}</span>
							{:else}
								<Send size={14} />
								{n.sendTest}
							{/if}
						</Button>
						<Button variant="ghost" size="sm" onclick={turnOff} disabled={busy}>
							{n.turnOff}
						</Button>
					</div>
				</div>
			{:else if status === 'install'}
				<p class="row note" in:fadeScale>
					<Share size={16} aria-hidden="true" />
					<span>{n.install}</span>
				</p>
			{:else if status === 'denied'}
				<p class="row note" in:fadeScale>
					<BellOff size={16} aria-hidden="true" />
					<span>{apple ? n.deniedApple : n.deniedBrowser}</span>
				</p>
			{:else if status === 'unsupported'}
				<p class="row note" in:fadeScale>
					<BellOff size={16} aria-hidden="true" />
					<span>{n.unsupported}</span>
				</p>
			{/if}
		{/key}
		{#if error}<p class="error" role="alert">{error}</p>{/if}
	</section>
{/if}

<style>
	.section {
		padding: var(--space-6);
		border-radius: var(--radius-xl);
		min-width: 0;
	}
	.section-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: var(--space-4);
	}
	.section-head > div:first-child {
		flex: 1 1 280px;
		min-width: 0;
	}
	.desc {
		margin-top: var(--space-2);
		font-size: var(--fs-sm);
		max-width: 56ch;
	}
	.row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: var(--space-3) var(--space-4);
		margin-top: var(--space-5);
		padding-top: var(--space-5);
		border-top: 1px solid var(--border);
	}
	.status {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--fs-sm);
		color: var(--text-2);
	}
	.dot {
		width: 8px;
		height: 8px;
		border-radius: var(--radius-pill);
		background: var(--success);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--success) 18%, transparent);
		animation: pop var(--dur-pop) var(--ease-spring) both;
	}
	@keyframes pop {
		from {
			transform: scale(0.4);
			opacity: 0;
		}
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	.sent {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		color: var(--success);
	}
	.note {
		justify-content: flex-start;
		flex-wrap: nowrap;
		align-items: flex-start;
		gap: var(--space-3);
		font-size: var(--fs-sm);
		color: var(--text-2);
		max-width: 64ch;
	}
	.note :global(svg) {
		flex: none;
		margin-top: 2px;
		color: var(--text-muted);
	}
	.error {
		margin-top: var(--space-3);
		color: var(--danger);
		font-size: var(--fs-sm);
	}
	@media (max-width: 600px) {
		.section {
			padding: var(--space-5) var(--space-4);
		}
		.section-head > div:not(:first-child),
		.section-head :global(.btn) {
			width: 100%;
		}
	}
</style>
