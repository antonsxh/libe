<script lang="ts">
	import '@fontsource-variable/figtree';
	import '@fontsource-variable/bricolage-grotesque';
	import '#lib/styles/global.css';
	import { untrack } from 'svelte';
	import { dev } from '$app/env';
	import { refreshAll } from '$app/navigation';
	import { TimerStore, setTimerStore } from '#lib/timer-store.svelte.ts';
	import { setI18n, useI18n } from '#lib/i18n/context.svelte.ts';
	import SwitchTimerDialog from '#lib/components/focus/SwitchTimerDialog.svelte';
	import LogTimeDialog from '#lib/components/focus/LogTimeDialog.svelte';
	import { syncAppBadge } from '#lib/push-client.ts';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	/** After midnight, wait this long (server clock skew) before reloading the day's data. */
	const DAY_SLACK_MS = 2_000;
	/** `setTimeout` caps at 2³¹−1 ms; a day is far below, this only guards odd clocks. */
	const MAX_TIMEOUT_MS = 2 ** 31 - 1;

	// UI language: seeded from the layout data, follows it after `refreshAll` (language
	// switch in Settings) — every `t.…` read re-renders, `<html lang>` follows.
	// svelte-ignore state_referenced_locally
	const language = setI18n(data.locale);
	$effect(() => {
		language.locale = data.locale;
		document.documentElement.lang = data.locale;
	});
	const t = useI18n();

	// One store per app instance (context, not a module singleton → SSR-safe).
	// svelte-ignore state_referenced_locally — seeded once; later snapshots arrive via `apply`.
	const timer = setTimerStore(new TimerStore(data.timer, t));

	// Fresh layout data (refreshAll after mutations) → newer snapshot.
	$effect(() => timer.apply(data.timer));
	// SSE subscription + local tick, once for the whole app — only for a paired device
	// (the pairing pages have no timer to follow). A boolean, so `refreshAll` (new `device`
	// object) doesn't tear the stream down and reconnect.
	const paired = $derived(data.device !== null);
	$effect(() => (paired ? timer.connect() : undefined));
	// `html[data-timer=live|offline]` — stream status hook (styling, e2e waits).
	$effect(() => {
		document.documentElement.dataset.timer = timer.connected ? 'live' : 'offline';
	});

	// iOS Safari only applies `:active` (the press feedback in global.css) once the document
	// has a touch listener.
	$effect(() => {
		const noop = () => {};
		document.addEventListener('touchstart', noop, { passive: true });
		return () => document.removeEventListener('touchstart', noop);
	});

	// App icon badge = today's open + overdue tasks, while this device has notifications on (the
	// service worker updates it from each push while the app is closed). Feature-detected, never
	// throws.
	$effect(() => {
		const badge = data.badge;
		if (badge !== null) void syncAppBadge(badge);
	});

	// A new day (the app left open over midnight, or woken up the next morning): reload all data
	// so Home shows the new day and yesterday's open tasks turn overdue. A timeout for the open
	// app, plus a check whenever the page becomes visible again (timeouts freeze in the
	// background on iOS). The fresh layout data carries the next `dayEndsAt` and re-arms this.
	$effect(() => {
		if (!paired) return;
		const endsAt = data.dayEndsAt;
		// The server clock right now (`serverNow` follows a tick that may not have run yet after a
		// frozen background tab).
		const now = () => Date.now() + untrack(() => timer.offset);
		let done = false;
		let id: ReturnType<typeof setTimeout> | undefined;
		const arm = () => {
			clearTimeout(id);
			const left = Math.max(0, endsAt - now()) + DAY_SLACK_MS;
			id = setTimeout(check, Math.min(left, MAX_TIMEOUT_MS));
		};
		function check() {
			if (done) return;
			if (now() < endsAt) return arm();
			done = true;
			refreshAll().catch(() => (done = false));
		}
		arm();
		const onVisible = () => document.visibilityState === 'visible' && check();
		document.addEventListener('visibilitychange', onVisible);
		return () => {
			clearTimeout(id);
			document.removeEventListener('visibilitychange', onVisible);
		};
	});

	// PWA: offline fallback + cached app shell (production builds only; needs HTTPS or
	// localhost). Kit bundles the worker as an ES module (it imports `/_app/env.js`).
	$effect(() => {
		if (dev || !('serviceWorker' in navigator)) return;
		navigator.serviceWorker.register('/service-worker.js', { type: 'module' }).catch((err) => {
			console.warn('[libe] service worker registration failed', err);
		});
	});
</script>

<svelte:head>
	<title>libe</title>
</svelte:head>

{@render children()}

{#if timer.switchRequest}
	<SwitchTimerDialog request={timer.switchRequest} />
{/if}
{#if timer.logTarget}
	{#key timer.logTarget.id}
		<LogTimeDialog task={timer.logTarget} />
	{/key}
{/if}
