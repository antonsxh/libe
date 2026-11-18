<script lang="ts">
	import '@fontsource-variable/inter';
	import '#lib/styles/global.css';
	import favicon from '#lib/assets/favicon.svg';
	import { TimerStore, setTimerStore } from '#lib/timer-store.svelte.ts';
	import SwitchTimerDialog from '#lib/components/focus/SwitchTimerDialog.svelte';
	import LogTimeDialog from '#lib/components/focus/LogTimeDialog.svelte';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	// One store per app instance (context, not a module singleton → SSR-safe).
	// svelte-ignore state_referenced_locally — seeded once; later snapshots arrive via `apply`.
	const timer = setTimerStore(new TimerStore(data.timer));

	// Fresh layout data (refreshAll after mutations) → newer snapshot.
	$effect(() => timer.apply(data.timer));
	// SSE subscription + local tick, once for the whole app.
	$effect(() => timer.connect());
	// `html[data-timer=live|offline]` — stream status hook (styling, e2e waits).
	$effect(() => {
		document.documentElement.dataset.timer = timer.connected ? 'live' : 'offline';
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
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
