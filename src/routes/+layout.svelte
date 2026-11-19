<script lang="ts">
	import '@fontsource-variable/inter';
	import '#lib/styles/global.css';
	import { dev } from '$app/env';
	import { TimerStore, setTimerStore } from '#lib/timer-store.svelte.ts';
	import { setI18n, useI18n } from '#lib/i18n/context.svelte.ts';
	import SwitchTimerDialog from '#lib/components/focus/SwitchTimerDialog.svelte';
	import LogTimeDialog from '#lib/components/focus/LogTimeDialog.svelte';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

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
