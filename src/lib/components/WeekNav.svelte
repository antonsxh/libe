<script lang="ts">
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import { Calendar, ChevronLeft, ChevronRight } from '@lucide/svelte';
	import { addDays } from '#lib/dates.ts';
	import { useI18n } from '#lib/i18n/context.svelte.ts';

	type Props = {
		/** Monday of the shown week. */
		monday: string;
		/** `Nov 9 – 15` (`weekRangeLabel`). */
		rangeLabel: string;
		/** The shown week contains today → "This week" is disabled. */
		isCurrentWeek: boolean;
		/** Extra controls after "This week", rendered in the caller's style scope. */
		children?: Snippet;
	};
	let { monday, rangeLabel, isCurrentWeek, children }: Props = $props();
	const t = useI18n();

	/**
	 * Same page with `?week=` set (or removed for the current week), other params kept —
	 * except a phone day view's `?day=` (the new week starts on today / its Monday).
	 */
	function weekHref(week: string | null): string {
		const p = new URLSearchParams(page.url.searchParams.toString());
		p.delete('day');
		if (week) p.set('week', week);
		else p.delete('week');
		const qs = p.toString();
		return qs ? `?${qs}` : '?';
	}
</script>

<nav class="week-nav" aria-label={t.week.nav}>
	<a
		class="icon-btn"
		href={weekHref(addDays(monday, -7))}
		aria-label={t.week.previous}
		data-sveltekit-reset="false"
	>
		<ChevronLeft size={16} />
	</a>
	<span class="range tabular" aria-live="polite">{rangeLabel}</span>
	<a
		class="icon-btn"
		href={weekHref(addDays(monday, 7))}
		aria-label={t.week.next}
		data-sveltekit-reset="false"
	>
		<ChevronRight size={16} />
	</a>
	{#if isCurrentWeek}
		<span class="pill-btn disabled" aria-disabled="true" aria-current="date">
			<Calendar size={15} />
			{t.week.thisWeek}
		</span>
	{:else}
		<a class="pill-btn" href={weekHref(null)} data-sveltekit-reset="false">
			<Calendar size={15} />
			{t.week.thisWeek}
		</a>
	{/if}
	{@render children?.()}
</nav>

<style>
	.week-nav {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
	}
	.range {
		min-width: 8.5rem;
		text-align: center;
		color: var(--text-2);
		font-size: var(--fs-md);
		white-space: nowrap;
	}
	.icon-btn,
	.pill-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		height: 34px;
		border: 1px solid transparent;
		border-radius: var(--radius-md);
		color: var(--text-muted);
		font-size: var(--fs-sm);
		white-space: nowrap;
		transition:
			background var(--dur) var(--ease),
			color var(--dur) var(--ease);
	}
	.icon-btn {
		width: 30px;
	}
	.pill-btn {
		padding: 0 var(--space-3);
		border-color: var(--border);
		background: var(--surface);
		color: var(--text-2);
	}
	.icon-btn:hover,
	a.pill-btn:hover {
		background: var(--surface-hover);
		color: var(--text);
	}
	.pill-btn.disabled {
		color: var(--text-faint);
		background: transparent;
		cursor: default;
	}
</style>
