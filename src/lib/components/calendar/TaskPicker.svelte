<script lang="ts">
	import { Check, Search } from '@lucide/svelte';
	import { questColorVar } from '#lib/quest-colors.ts';
	import { formatDayLabel } from '#lib/dates.ts';
	import type { PickTask } from '#lib/calendar.ts';
	import { useI18n } from '#lib/i18n/context.svelte.ts';

	type Props = {
		tasks: PickTask[];
		/** Selected task id (bindable). */
		value: string | null;
		/** Day the entry is on — its tasks are listed first. */
		day: string;
		/** Days of the shown week. */
		weekDays: string[];
		/** A task not in `tasks` (e.g. of a closed quest) that the edited session belongs to. */
		extra?: PickTask | null;
		invalid?: boolean;
	};
	let {
		tasks,
		value = $bindable(),
		day,
		weekDays,
		extra = null,
		invalid = false
	}: Props = $props();

	const t = useI18n();
	let query = $state('');

	const groups = $derived.by(() => {
		const q = query.trim().toLowerCase();
		const match = (x: PickTask) =>
			!q || x.title.toLowerCase().includes(q) || (x.questName ?? '').toLowerCase().includes(q);
		const list = tasks.filter(match);
		const week = new Set(weekDays);
		return [
			{
				key: 'extra',
				label: t.calendar.picker.loggedTask,
				items: extra && !tasks.some((x) => x.id === extra.id) && match(extra) ? [extra] : []
			},
			{
				key: 'day',
				label: formatDayLabel(day, { weekday: 'long', month: 'short', day: 'numeric' }, t.intl),
				items: list.filter((x) => x.day === day)
			},
			{
				key: 'week',
				label: t.common.thisWeek,
				items: list.filter((x) => x.day !== null && x.day !== day && week.has(x.day))
			},
			{ key: 'backlog', label: t.common.backlog, items: list.filter((x) => x.day === null) },
			{
				key: 'other',
				label: t.calendar.picker.otherDays,
				items: list.filter((x) => x.day !== null && x.day !== day && !week.has(x.day))
			}
		].filter((g) => g.items.length > 0);
	});

	const uid = $props.id();
	const name = `task-${uid}`;
	let listEl = $state<HTMLDivElement | undefined>();
	// Bring the preselected task into view once — a frame later, when the parent's native
	// <dialog> is open (scrolling inside a closed dialog is a no-op).
	$effect(() => {
		const el = listEl;
		if (!el) return;
		const id = requestAnimationFrame(() => {
			const row = el.querySelector<HTMLElement>('input:checked')?.closest('label');
			if (row) el.scrollTop = row.offsetTop - el.clientHeight / 2 + row.offsetHeight / 2;
		});
		return () => cancelAnimationFrame(id);
	});
</script>

<div class="picker" class:invalid>
	<label class="search">
		<Search size={14} aria-hidden="true" />
		<span class="sr-only">{t.calendar.picker.search}</span>
		<input
			type="search"
			placeholder={t.calendar.picker.searchPlaceholder}
			bind:value={query}
			autocomplete="off"
		/>
	</label>
	<div class="list" role="radiogroup" aria-label={t.common.task} bind:this={listEl}>
		{#each groups as g (g.key)}
			<p class="group label">{g.label}</p>
			{#each g.items as task (task.id)}
				<label class="row" class:on={task.id === value} class:done={task.done}>
					<input type="radio" {name} value={task.id} bind:group={value} class="sr-only" />
					<span class="dot" style:--q={questColorVar(task.questColor ?? 'slate')} aria-hidden="true"
					></span>
					<span class="t-title">{task.title}</span>
					<span class="t-quest muted">{task.questName ?? t.common.other}</span>
					{#if task.id === value}<Check size={14} aria-hidden="true" />{/if}
				</label>
			{/each}
		{:else}
			<p class="empty muted">{t.calendar.picker.noMatches}</p>
		{/each}
	</div>
</div>

<style>
	.picker {
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--bg);
		overflow: hidden;
	}
	.picker.invalid {
		border-color: var(--danger);
	}
	.search {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: 0 var(--space-3);
		border-bottom: 1px solid var(--border);
		color: var(--text-faint);
	}
	.search input {
		flex: 1;
		min-width: 0;
		height: 36px;
		border: none;
		background: transparent;
		color: var(--text);
		font-size: var(--fs-sm);
		outline: none;
	}
	.search:focus-within {
		box-shadow: inset var(--ring);
	}
	.list {
		position: relative;
		max-height: 200px;
		overflow-y: auto;
		padding: var(--space-1);
		scrollbar-color: var(--border-strong) transparent;
	}
	.group {
		padding: var(--space-2) var(--space-2) var(--space-1);
		font-size: var(--fs-xs);
	}
	.row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-1) var(--space-2);
		border-radius: var(--radius-sm);
		font-size: var(--fs-sm);
		cursor: pointer;
	}
	.row:hover {
		background: var(--surface-hover);
	}
	.row.on {
		background: var(--surface-2);
		color: var(--text);
	}
	.row:has(input:focus-visible) {
		box-shadow: var(--ring);
	}
	.row.done .t-title {
		color: var(--text-muted);
		text-decoration: line-through;
	}
	.dot {
		flex: none;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--q);
	}
	.t-title {
		flex: 1;
		min-width: 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.t-quest {
		flex: none;
		max-width: 40%;
		font-size: var(--fs-xs);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.empty {
		padding: var(--space-3);
		font-size: var(--fs-sm);
	}
</style>
