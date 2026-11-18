<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { ChevronLeft, ChevronRight, Eye, EyeOff } from '@lucide/svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import QuestFilter from '#lib/components/tasks/QuestFilter.svelte';
	import BacklogColumn from '#lib/components/plan/BacklogColumn.svelte';
	import PlanColumn from '#lib/components/plan/PlanColumn.svelte';
	import { addDays } from '#lib/dates.ts';
	import type { TaskFormResult } from '#lib/task-form.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const taskForm = $derived(form as TaskFormResult | null);

	let board = $state<HTMLDivElement | undefined>();

	/**
	 * Bring today's column (if shown; else the board start) into view whenever the *week* changes — scrolling as
	 * little as possible. Keyed on a derived string so re-loads after mutations (same
	 * week) don't yank the board around.
	 */
	const scrollKey = $derived(`${data.weekMonday}|${data.today}`);
	$effect(() => {
		const today = scrollKey.split('|')[1];
		const el = board;
		const col = el?.querySelector<HTMLElement>(`[data-day="${today}"]`);
		if (!el) return;
		if (!col) {
			el.scrollLeft = 0; // another week: start at the backlog / Monday
			return;
		}
		const left = col.offsetLeft;
		const right = left + col.offsetWidth;
		if (right > el.scrollLeft + el.clientWidth) el.scrollLeft = right - el.clientWidth;
		if (left < el.scrollLeft) el.scrollLeft = left;
	});

	/** Build `?…` from the current URL params; unrelated params survive. */
	function href(set: (p: URLSearchParams) => void): string {
		const p = new URLSearchParams(page.url.searchParams.toString());
		set(p);
		const qs = p.toString();
		return qs ? `?${qs}` : '?';
	}
	/** Week links drop `other` (expanded Other zones are per day of the shown week). */
	function weekHref(monday: string | null): string {
		return href((p) => {
			p.delete('other');
			if (monday) p.set('week', monday);
			else p.delete('week');
		});
	}
	const navOpts = { reset: false } as const;
	function setQuestFilter(ids: string[] | null) {
		void goto(
			href((p) => (ids ? p.set('q', ids.join(',')) : p.delete('q'))),
			navOpts
		);
	}
	/** Other-zone expanded days live in `?other=` (survives reload, works without JS). */
	function toggleOther(day: string, open: boolean) {
		const url = href((p) => {
			const days = new Set((p.get('other') ?? '').split(',').filter((d) => d.length > 0));
			if (open) days.add(day);
			else days.delete(day);
			if (days.size > 0) p.set('other', [...days].sort().join(','));
			else p.delete('other');
		});
		void goto(url, { ...navOpts, replace: true });
	}
	const hideDoneHref = $derived(
		href((p) => (data.hideDone ? p.delete('hideDone') : p.set('hideDone', '1')))
	);
	const isCurrentWeek = $derived(data.columns.some((c) => c.isToday));
</script>

<svelte:head>
	<title>Plan the week · libe</title>
</svelte:head>

<PageHeader title="Plan the week">
	{#snippet titleActions()}
		<QuestFilter quests={data.quests} selected={data.questFilter} onchange={setQuestFilter} />
	{/snippet}
	{#snippet actions()}
		<div class="week-nav">
			<span class="month" aria-live="polite">{data.monthLabel}</span>
			<a
				class="nav-btn"
				href={weekHref(addDays(data.weekMonday, -7))}
				aria-label="Previous week"
				data-sveltekit-reset="false"
			>
				<ChevronLeft size={16} />
			</a>
			<a
				class="nav-btn"
				href={weekHref(addDays(data.weekMonday, 7))}
				aria-label="Next week"
				data-sveltekit-reset="false"
			>
				<ChevronRight size={16} />
			</a>
			<a
				class="today-btn"
				href={weekHref(null)}
				aria-current={isCurrentWeek ? 'date' : undefined}
				data-sveltekit-reset="false"
			>
				Today
			</a>
			<a
				class="nav-btn"
				href={hideDoneHref}
				aria-label={data.hideDone ? 'Show done tasks' : 'Hide done tasks'}
				title={data.hideDone ? 'Show done tasks' : 'Hide done tasks'}
				data-sveltekit-reset="false"
			>
				{#if data.hideDone}<EyeOff size={17} />{:else}<Eye size={17} />{/if}
			</a>
		</div>
	{/snippet}
</PageHeader>

<div class="board" bind:this={board}>
	<BacklogColumn
		groups={data.backlogGroups}
		quests={data.visibleQuests}
		count={data.backlogCount}
		today={data.today}
		form={taskForm}
	/>
	{#each data.columns as col (col.day)}
		<PlanColumn {col} quests={data.visibleQuests} form={taskForm} ontoggleother={toggleOther} />
	{/each}
</div>

<style>
	/* The board scrolls horizontally itself — the page never does. */
	.board {
		position: relative;
		display: flex;
		align-items: stretch;
		gap: var(--space-3);
		height: max(440px, calc(100dvh - var(--nav-h) - 170px));
		overflow-x: auto;
		overflow-y: hidden;
		padding-bottom: var(--space-2);
		scrollbar-color: var(--border-strong) transparent;
	}

	.week-nav {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: flex-end;
		gap: var(--space-2);
	}
	.month {
		margin-right: var(--space-2);
		font-size: var(--fs-lg);
		color: var(--text-2);
		white-space: nowrap;
	}
	.nav-btn,
	.today-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		height: 36px;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--surface);
		color: var(--text-2);
		transition:
			background var(--dur) var(--ease),
			color var(--dur) var(--ease);
	}
	.nav-btn {
		width: 36px;
	}
	.today-btn {
		padding: 0 var(--space-4);
		font-size: var(--fs-md);
		font-weight: var(--fw-medium);
		color: var(--text);
	}
	.nav-btn:hover,
	.today-btn:hover {
		background: var(--surface-hover);
		color: var(--text);
	}
</style>
