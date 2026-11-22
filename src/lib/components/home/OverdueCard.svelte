<script lang="ts">
	import { formAction } from '#lib/form-action.ts';
	import { enhance } from '$app/forms';
	import { ChevronDown, ChevronRight, CalendarArrowDown } from '@lucide/svelte';
	import Button from '#lib/components/Button.svelte';
	import Dialog from '#lib/components/Dialog.svelte';
	import OverdueList from '#lib/components/tasks/OverdueList.svelte';
	import { previewOverdue } from '#lib/overdue.ts';
	import type { TaskWithQuest } from '#lib/server/tasks.ts';
	import { useI18n } from '#lib/i18n/context.svelte.ts';

	/**
	 * Home's overdue tasks (rendered only while there are any). Desktop/iPad: a card with the
	 * first rows, "Show all N" and "All to today". Phones: one quiet row that opens the list as
	 * a bottom sheet — Next up stays the screen's primary action.
	 */
	type Props = {
		/** `listOverdue` — most recent day first. */
		tasks: TaskWithQuest[];
		today: string;
	};
	let { tasks, today }: Props = $props();
	const t = useI18n();

	let expanded = $state(false);
	const preview = $derived(previewOverdue(tasks, expanded));

	/** Phones: the sheet; its content mounts on open and unmounts after the exit animation. */
	let sheetOpen = $state(false);
	let sheetMounted = $state(false);
	function openSheet() {
		sheetMounted = true;
		sheetOpen = true;
	}
	// Everything resolved from inside the sheet: nothing left to show.
	$effect(() => {
		if (sheetOpen && tasks.length === 0) sheetOpen = false;
	});
</script>

{#snippet allToToday(primary: boolean)}
	<form
		class={primary ? 'sheet-actions dialog-actions' : undefined}
		method="POST"
		action={formAction('overdueTo')}
		use:enhance
	>
		<input type="hidden" name="all" value="1" />
		<input type="hidden" name="to" value="today" />
		<Button type="submit" variant={primary ? 'primary' : 'secondary'} size={primary ? 'md' : 'sm'}>
			<CalendarArrowDown size={primary ? 18 : 15} />
			{t.overdue.allToToday}
		</Button>
	</form>
{/snippet}

{#if tasks.length > 0}
	<section class="overdue card" aria-labelledby="overdue-label" data-testid="overdue">
		<header class="head">
			<h2 class="label" id="overdue-label">
				<span class="dot" aria-hidden="true"></span>{t.overdue.heading(tasks.length)}
			</h2>
			{@render allToToday(false)}
		</header>
		<OverdueList tasks={preview.shown} {today} />
		{#if tasks.length > preview.shown.length || expanded}
			<button
				type="button"
				class="more"
				class:open={expanded}
				aria-expanded={expanded}
				onclick={() => (expanded = !expanded)}
			>
				{expanded ? t.overdue.showLess : t.overdue.showAll(tasks.length)}
				<ChevronDown size={14} />
			</button>
		{/if}
	</section>

	<button
		type="button"
		class="phone-row press"
		aria-haspopup="dialog"
		data-testid="overdue-row"
		onclick={openSheet}
	>
		<span class="dot" aria-hidden="true"></span>
		<span class="row-text">{t.overdue.row(tasks.length)}</span>
		<span class="view">{t.overdue.view}<ChevronRight size={16} /></span>
	</button>
{/if}

<Dialog bind:open={sheetOpen} title={t.overdue.sheetTitle} onclosed={() => (sheetMounted = false)}>
	{#if sheetMounted}
		<div class="sheet">
			<OverdueList {tasks} {today} />
			{#if tasks.length > 0}{@render allToToday(true)}{/if}
		</div>
	{/if}
</Dialog>

<style>
	.overdue {
		display: grid;
		gap: var(--space-3);
		margin-bottom: var(--space-8);
		padding: var(--space-4);
	}
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
	}
	.head .label {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		margin: 0;
	}
	.dot {
		flex: none;
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--overdue);
	}
	.more {
		justify-self: start;
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		padding: var(--space-1) var(--space-2);
		border: none;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text-muted);
		font-size: var(--fs-xs);
	}
	.more:hover {
		color: var(--text);
		background: var(--surface-hover);
	}
	.more :global(svg) {
		transition: transform var(--dur) var(--ease);
	}
	.more.open :global(svg) {
		transform: rotate(180deg);
	}

	.phone-row {
		display: none;
	}
	.sheet {
		display: grid;
		gap: var(--space-4);
	}
	.sheet-actions {
		display: flex;
		justify-content: flex-end;
	}

	/* Phones: a single quiet row instead of the card (details in the sheet). */
	@media (max-width: 720px) {
		.overdue {
			display: none;
		}
		.phone-row {
			display: flex;
			align-items: center;
			gap: var(--space-3);
			width: 100%;
			min-height: 44px;
			margin-bottom: var(--space-4);
			padding: var(--space-2) var(--space-4);
			border: 1px solid var(--border);
			border-radius: var(--radius-lg);
			background: var(--surface);
			color: var(--text-2);
			font-size: var(--fs-md);
			text-align: left;
			-webkit-tap-highlight-color: transparent;
		}
		.row-text {
			flex: 1;
			min-width: 0;
		}
		.view {
			display: inline-flex;
			align-items: center;
			gap: 2px;
			color: var(--text-muted);
			font-size: var(--fs-sm);
		}
	}
</style>
