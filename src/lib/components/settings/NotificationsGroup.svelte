<script lang="ts">
	import { onMount, type Snippet } from 'svelte';
	import { page } from '$app/state';
	import { Bell, Check, Send } from '@lucide/svelte';
	import GroupedList from '#lib/components/GroupedList.svelte';
	import Switch from '#lib/components/Switch.svelte';
	import SettingsTile from './SettingsTile.svelte';
	import { desktopApp } from '#lib/desktop.ts';
	import { isStandalone } from '#lib/pwa.ts';
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

	/**
	 * Settings → Notifications (this device): one switch row in a `GroupedList` (+ "Send test"
	 * while on); the footer explains the state (install first, blocked, unsupported). Extra
	 * rows (`children`, e.g. Language on phones) follow in the same group. In the desktop app
	 * (and wherever push can't exist) only those rows show, with `fallbackFooter`.
	 */
	type Props = { header?: string; fallbackFooter?: string; children?: Snippet };
	let { header, fallbackFooter, children }: Props = $props();
	const t = useI18n();
	const n = $derived(t.settings.notifications);
	const switchId = $props.id();
	/** A device paired as the desktop app: hidden from the first (server) render on. */
	const tauri = $derived(page.data.device?.kind === 'tauri');

	/** null until the browser was asked (SSR, first frame): no buttons yet. */
	let status = $state<NotificationsState | null>(null);
	/** The switch: follows the state after every refresh (a failed or refused turn-on flips back). */
	let on = $state(false);
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
		on = status === 'on';
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

	const visible = $derived(!tauri && status !== 'hidden');
	const footer = $derived.by(() => {
		if (!visible) return fallbackFooter;
		if (status === 'install') return n.install;
		if (status === 'denied') return apple ? n.deniedApple : n.deniedBrowser;
		if (status === 'unsupported') return n.unsupported;
		return n.desc;
	});

	function toggle(next: boolean) {
		if (busy) return;
		void (next ? turnOn() : turnOff());
	}

	onMount(() => {
		void refresh();
		return () => clearTimeout(sentTimer);
	});
</script>

<div class="notifications" data-state={visible ? status : 'hidden'}>
	<GroupedList {header} label={header ? undefined : n.title}>
		{#if visible}
			<div class="row">
				<SettingsTile color="var(--tile-notifications)">
					<Bell size={16} strokeWidth={2} />
				</SettingsTile>
				<label class="text" for={switchId}>{n.title}</label>
				<Switch
					id={switchId}
					bind:checked={on}
					disabled={busy || (status !== 'on' && status !== 'off')}
					describedby="{switchId}-foot"
					testid="notifications-switch"
					onchange={toggle}
				/>
			</div>
			{#if status === 'on'}
				<button type="button" class="row test" onclick={sendTest} disabled={busy || sent}>
					{#if sent}
						<span class="sent" role="status"><Check size={16} aria-hidden="true" /> {n.sent}</span>
					{:else}
						<Send size={16} aria-hidden="true" />
						{n.sendTest}
					{/if}
				</button>
			{/if}
		{/if}
		{@render children?.()}
	</GroupedList>
	{#if footer}<p class="foot" id="{switchId}-foot">{footer}</p>{/if}
	{#if error}<p class="error" role="alert">{error}</p>{/if}
</div>

<style>
	.notifications {
		display: grid;
		gap: var(--space-2);
	}
	.row {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		min-height: var(--grouped-row-h);
		padding: var(--space-2) var(--grouped-inset);
	}
	.text {
		flex: 1;
		min-width: 0;
		cursor: pointer;
	}
	.test {
		width: 100%;
		border: 0;
		background: transparent;
		color: var(--accent-text);
		font-size: var(--fs-md);
		text-align: left;
		transition: background var(--dur) var(--ease);
	}
	@media (hover: hover) {
		.test:hover:not(:disabled) {
			background: var(--surface-hover);
		}
	}
	.test:disabled {
		cursor: default;
	}
	.sent {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		color: var(--success);
	}
	.foot,
	.error {
		padding: 0 var(--grouped-inset);
		font-size: var(--fs-xs);
	}
	.foot {
		color: var(--text-muted);
	}
	.error {
		color: var(--danger);
	}
</style>
