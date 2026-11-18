<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import { ArrowDownToLine, ArrowUpToLine, Plus } from '@lucide/svelte';
	import Button from '#lib/components/Button.svelte';
	import QuestPicker from '#lib/components/home/QuestPicker.svelte';
	import type { Quest } from '#lib/server/db/schema.ts';
	import type { TaskFormResult } from '#lib/task-form.ts';

	let {
		action,
		placeholder,
		/** Render "⤒ Top" / "⤓ Bottom" submit buttons instead of a plain "Add". */
		topBottom = false,
		showDuration = false,
		/** When set, renders the compact quest picker (submits as `questId`). */
		quests,
		form
	}: {
		/** Form action name on `/` (e.g. `addQuest`). */
		action: string;
		placeholder: string;
		topBottom?: boolean;
		showDuration?: boolean;
		quests?: Quest[];
		/** Page form data — used to re-show values after a no-JS validation failure. */
		form?: TaskFormResult | undefined;
	} = $props();

	let questId = $state('');
	let el: HTMLFormElement | undefined = $state();

	const echo = $derived(form?.intent === action && form.errors ? form : undefined);

	// Default behavior already resets the form after a *successful* submission;
	// this keeps focus in the input so several tasks can be typed in a row.
	const onSubmit: SubmitFunction<Record<string, unknown>, Record<string, unknown>> = () => {
		return async ({ result, update }) => {
			await update();
			if (result.type === 'success')
				el?.querySelector<HTMLInputElement>('input[name=title]')?.focus();
		};
	};
</script>

<form class="add" method="POST" action={`?/${action}`} use:enhance={onSubmit} bind:this={el}>
	{#if quests}
		<QuestPicker {quests} bind:value={questId} />
		<input type="hidden" name="questId" value={questId || quests[0]?.id || ''} />
	{/if}
	<input
		class="title"
		name="title"
		type="text"
		maxlength="200"
		{placeholder}
		autocomplete="off"
		value={echo?.title ?? ''}
	/>
	{#if showDuration}
		<input
			class="duration"
			name="duration"
			type="number"
			min="1"
			max="1440"
			step="1"
			placeholder="min"
			aria-label="Duration in minutes (optional)"
			value={echo?.duration ?? ''}
		/>
	{/if}
	{#if topBottom}
		<!-- Bottom first in DOM so implicit Enter-submit adds to the bottom; CSS keeps the
		     reference's visual order (Top, then Bottom). -->
		<button type="submit" class="pos bottom" name="pos" value="bottom">
			<ArrowDownToLine size={14} /> Bottom
		</button>
		<button type="submit" class="pos top" name="pos" value="top">
			<ArrowUpToLine size={14} /> Top
		</button>
	{:else}
		<Button size="sm" type="submit"><Plus size={16} /> Add</Button>
	{/if}
</form>

{#if echo?.errors?.title}<p class="error">{echo.errors.title}</p>{/if}
{#if echo?.errors?.duration}<p class="error">{echo.errors.duration}</p>{/if}

<style>
	.add {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-2) var(--space-2) var(--space-4);
		border: 1px dashed var(--border-dashed);
		border-radius: var(--radius-md);
		margin-bottom: var(--space-3);
	}
	.add:focus-within {
		border-color: var(--border-strong);
	}
	.add .title {
		flex: 1 1 140px;
		min-width: 0;
		background: transparent;
		border: none;
		padding: var(--space-2) 0;
		color: var(--text);
		font-size: var(--fs-md);
	}
	.add .duration {
		flex: none;
		width: 64px;
		padding: var(--space-2);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		color: var(--text-2);
		font-size: var(--fs-sm);
		text-align: right;
	}

	/* "Top"/"Bottom" submit buttons, matching the reference's inset look. */
	.pos {
		flex: none;
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		height: 32px;
		padding: 0 var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--surface-2);
		color: var(--text-2);
		font-size: var(--fs-sm);
		font-weight: var(--fw-medium);
		white-space: nowrap;
		transition:
			background var(--dur) var(--ease),
			color var(--dur) var(--ease);
	}
	.pos:hover {
		background: var(--surface-hover);
		color: var(--text);
	}
	.pos.top {
		order: 1;
	}
	.pos.bottom {
		order: 2;
	}

	.error {
		color: var(--danger);
		font-size: var(--fs-xs);
		margin-bottom: var(--space-3);
	}
</style>
