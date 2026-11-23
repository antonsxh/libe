<script lang="ts">
	import { Plus } from '@lucide/svelte';
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
		/** Hidden `day` field value — plan columns pass their day, echo matching uses it. */
		day?: string;
		/** Narrow board columns: one row with a dot-only quest picker and an icon-only Add. */
		compact?: boolean;
		showDuration?: boolean;
		/** Omitted for backlog / "other" forms — then no picker is rendered. */
		quests?: QuestOption[];
		/** Page form data — used to re-show values after a no-JS validation failure. */
		form?: TaskFormResult | null;
	} = $props();

	const t = useI18n();
	let el: HTMLFormElement | undefined = $state();
	let topButton: HTMLButtonElement | undefined = $state();

	/**
	 * Enter (implicit submit, the visible Add) appends at the bottom; Shift+Enter adds at the
	 * top — a keyboard shortcut only, no extra control (↑/↓ reorder afterwards).
	 */
	function onTitleKeydown(e: KeyboardEvent) {
		if (e.key !== 'Enter' || !e.shiftKey || e.isComposing || !el || !topButton) return;
		e.preventDefault();
		el.requestSubmit(topButton);
	}

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
	// this keeps focus in the input so several tasks can be typed in a row — without
	// scrolling (a scrolled plan board must not jump back to the backlog rail).
	const onSubmit: SubmitFunction<Record<string, unknown>, Record<string, unknown>> = () => {
		return async ({ result, update }) => {
			await update();
			if (result.type === 'success')
				el?.querySelector<HTMLInputElement>('input[name=title]')?.focus({ preventScroll: true });
		};
	};
</script>

<form
	class="add"
	class:compact
	data-intent={action}
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
		onkeydown={onTitleKeydown}
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
	<Button size="sm" type="submit" icon={compact} aria-label={compact ? t.common.add : undefined}>
		<Plus size={16} />
		{#if !compact}{t.common.add}{/if}
	</Button>
	<!-- After the Add button: the form's default (Enter) button must stay "bottom". -->
	<button
		bind:this={topButton}
		type="submit"
		name="pos"
		value="top"
		hidden
		tabindex="-1"
		aria-hidden="true"
	></button>
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

	/*
	 * Phones: progressive disclosure — the idle form is just the picker and the input; the
	 * duration and Add appear once the form is in use (focused or holding a title).
	 */
	@media (max-width: 720px) {
		.add:not(.compact, :focus-within, :has(.title:not(:placeholder-shown))) > .duration,
		.add:not(.compact, :focus-within, :has(.title:not(:placeholder-shown))) > :global(.btn) {
			display: none;
		}
		.add:not(.compact) > .duration,
		.add:not(.compact) > :global(.btn) {
			animation: fade-in var(--dur) var(--ease-out);
		}
	}

	.error {
		color: var(--danger);
		font-size: var(--fs-xs);
		margin-bottom: var(--space-3);
	}
</style>
