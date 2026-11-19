<script lang="ts">
	import { ArrowDownToLine, ArrowUpToLine, Plus } from '@lucide/svelte';
	import { untrack } from 'svelte';
	import { formAction } from '#lib/form-action.ts';
	import { enhance, type SubmitFunction } from '$app/forms';
	import Button from '#lib/components/Button.svelte';
	import QuestPicker, {
		OTHER_VALUE,
		type QuestOption
	} from '#lib/components/tasks/QuestPicker.svelte';
	import type { TaskFormResult } from '#lib/task-form.ts';
	import { useI18n } from '#lib/i18n/context.svelte.ts';

	let {
		action,
		placeholder,
		otherOption = false,
		topBottom = false,
		day,
		compact = false,
		showDuration = false,
		quests,
		form
	}: {
		/** Form action name (e.g. `addQuest`, `add`). */
		action: string;
		placeholder: string;
		/** Adds an "Other" choice and allows submitting without a quest. */
		otherOption?: boolean;
		/** Show the Top/Bottom submit buttons (instead of a plain Add button). */
		topBottom?: boolean;
		/** Hidden `day` field value — plan columns pass their day, echo matching uses it. */
		day?: string;
		/**
		 * Narrow board columns: one row with a dot-only quest picker and icon-only
		 * Top/Bottom/Add buttons.
		 */
		compact?: boolean;
		showDuration?: boolean;
		/** Omitted for backlog / "other" forms — then no picker is rendered. */
		quests?: QuestOption[];
		/** Page form data — used to re-show values after a no-JS validation failure. */
		form?: TaskFormResult | null;
	} = $props();

	const t = useI18n();
	let el: HTMLFormElement | undefined = $state();

	/** A failed submit of *this* form (same action and, on the plan board, same day). */
	const echo = $derived(
		form?.intent === action && form.errors && (form.day ?? '') === (day ?? '') ? form : undefined
	);

	// Restore the picked quest after a no-JS validation failure (fresh page render).
	let questId = $state(untrack(() => echo?.questId ?? ''));

	// Keep the picker selection valid (e.g. when the quest filter removes the current one).
	$effect(() => {
		if (!quests) return;
		if (questId === OTHER_VALUE && !otherOption) questId = quests[0]?.id ?? '';
		else if (!quests.some((q) => q.id === questId) && questId !== (otherOption ? OTHER_VALUE : ''))
			questId = quests[0]?.id ?? '';
	});

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

<form
	class="add"
	class:compact
	method="POST"
	action={formAction(action)}
	use:enhance={onSubmit}
	bind:this={el}
>
	{#if quests}
		<QuestPicker {quests} {otherOption} {compact} bind:value={questId} />
		<input
			type="hidden"
			name="questId"
			value={questId || quests[0]?.id || (otherOption ? OTHER_VALUE : '')}
		/>
	{/if}
	{#if day !== undefined}<input type="hidden" name="day" value={day} />{/if}
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
			placeholder={t.common.durationPlaceholder}
			aria-label={t.common.durationOptional}
			value={echo?.duration ?? ''}
		/>
	{/if}
	{#if topBottom}
		<!-- Bottom first in DOM so implicit Enter-submit adds to the bottom; CSS `order` keeps
		     the reference's visual order (Top, then Bottom). -->
		<button
			type="submit"
			class="pos bottom"
			class:icon-only={compact}
			name="pos"
			value="bottom"
			title={t.tasks.addBottom}
			aria-label={compact ? t.tasks.addBottom : undefined}
		>
			<ArrowDownToLine size={14} />
			{#if !compact}{t.tasks.bottom}{/if}
		</button>
		<button
			type="submit"
			class="pos top"
			class:icon-only={compact}
			name="pos"
			value="top"
			title={t.tasks.addTop}
			aria-label={compact ? t.tasks.addTop : undefined}
		>
			<ArrowUpToLine size={14} />
			{#if !compact}{t.tasks.top}{/if}
		</button>
	{:else}
		<Button size="sm" type="submit" icon={compact} aria-label={compact ? t.common.add : undefined}>
			<Plus size={16} />
			{#if !compact}{t.common.add}{/if}
		</Button>
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
	.add.compact {
		flex-wrap: nowrap;
		gap: var(--space-1);
		padding: var(--space-1) var(--space-1) var(--space-1) var(--space-2);
	}
	.add.compact .title {
		flex-basis: 0;
		padding-left: var(--space-1);
		font-size: var(--fs-sm);
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

	/* "Top"/"Bottom" submit buttons, matching the reference's inset look; icon-only in plan columns. */
	.pos {
		flex: none;
		display: inline-flex;
		align-items: center;
		justify-content: center;
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
	.pos.icon-only {
		width: 32px;
		padding: 0;
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
