<script lang="ts">
	import { enhance } from '$app/forms';
	import { untrack } from 'svelte';
	import Button from '#lib/components/Button.svelte';
	import ColorSwatches from '#lib/components/ColorSwatches.svelte';
	import EmojiPicker from '#lib/components/EmojiPicker.svelte';
	import { SUGGESTED_EMOJIS } from '#lib/emoji.ts';
	import { QUEST_DESC_MAX, QUEST_NAME_MAX, type QuestFormResult } from '#lib/quest-form.ts';
	import type { Quest } from '#lib/server/db/schema.ts';
	import { useI18n } from '#lib/i18n/context.svelte.ts';

	type Props = {
		mode: 'create' | 'update';
		/** Existing quest (edit dialog) — provides the initial field values. */
		quest?: Quest | null;
		/** Result of the `create` / `update` form action (validation errors live here). */
		form?: QuestFormResult | null;
		/** Called after a *successful* submit (so the dialog can close). */
		ondone: () => void;
	};

	let { mode, quest = null, form = null, ondone }: Props = $props();
	const t = useI18n();

	/** Echoed input while a validation error is shown; otherwise the quest's values. */
	const echo = $derived(form?.intent === mode && form.errors ? form : undefined);

	// Initial values only: the fields are bound afterwards, so later prop changes must not reset them.
	let icon = $state(untrack(() => echo?.icon ?? quest?.icon ?? ''));
	let color = $state(untrack(() => echo?.color ?? quest?.color ?? 'amber'));
</script>

<form
	method="POST"
	action={`?/${mode}`}
	use:enhance={() =>
		async ({ result, update }) => {
			await update({ reset: false });
			if (result.type === 'success') ondone();
		}}
	class="quest-form"
>
	{#if mode === 'update' && quest}
		<input type="hidden" name="questId" value={quest.id} />
	{/if}

	<label class="field">
		<span class="label">{t.quests.form.name}</span>
		<input
			name="name"
			type="text"
			required
			maxlength={QUEST_NAME_MAX}
			placeholder={t.quests.form.namePlaceholder}
			autocomplete="off"
			value={echo?.name ?? quest?.name ?? ''}
		/>
		{#if echo?.errors?.name}<span class="error">{echo.errors.name}</span>{/if}
	</label>

	<label class="field">
		<span class="label">{t.quests.form.description}</span>
		<textarea
			name="description"
			rows="3"
			maxlength={QUEST_DESC_MAX}
			placeholder={t.quests.form.descriptionPlaceholder}
			value={echo?.description ?? quest?.description ?? ''}></textarea>
		{#if echo?.errors?.description}<span class="error">{echo.errors.description}</span>{/if}
	</label>

	<div class="row">
		<div class="field">
			<span class="label" id="icon-label">{t.quests.form.icon}</span>
			<EmojiPicker
				name="icon"
				bind:value={icon}
				labelledby="icon-label"
				suggestions={SUGGESTED_EMOJIS}
				groupLabel={t.quests.form.suggested}
				pickLabel={t.quests.form.useIcon}
				placeholder="🚀"
				invalid={Boolean(echo?.errors?.icon)}
			/>
			{#if echo?.errors?.icon}<span class="error">{echo.errors.icon}</span>{/if}
		</div>

		<label class="field">
			<span class="label">{t.quests.form.budget}</span>
			<input
				class="budget"
				name="weeklyBudgetH"
				type="number"
				min="0.5"
				max="168"
				step="0.5"
				placeholder={t.quests.form.budgetPlaceholder}
				value={echo?.weeklyBudgetH ?? quest?.weeklyBudgetH ?? ''}
			/>
			{#if echo?.errors?.weeklyBudgetH}
				<span class="error">{echo.errors.weeklyBudgetH}</span>
			{/if}
		</label>
	</div>

	<div class="field">
		<span class="label">{t.quests.form.colour}</span>
		<ColorSwatches name="color" bind:value={color} label={t.quests.form.colourGroup} />
		{#if echo?.errors?.color}<span class="error">{echo.errors.color}</span>{/if}
	</div>

	<div class="foot dialog-actions">
		<span class="muted hint">
			{mode === 'create' ? t.quests.form.changeLater : ''}
		</span>
		<Button variant="ghost" onclick={() => ondone()}>{t.common.cancel}</Button>
		<Button variant="primary" type="submit">
			{mode === 'create' ? t.quests.form.create : t.quests.form.saveChanges}
		</Button>
	</div>
</form>

<style>
	.quest-form {
		display: grid;
		gap: var(--space-4);
	}

	.field {
		display: grid;
		gap: var(--space-2);
		min-width: 0;
	}

	input,
	textarea {
		width: 100%;
		padding: var(--space-2) var(--space-3);
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		color: var(--text);
		font-size: var(--fs-md);
	}
	input:hover,
	textarea:hover {
		border-color: var(--border-strong);
	}
	textarea {
		resize: vertical;
		min-height: 72px;
		font-family: inherit;
	}

	.error {
		color: var(--danger);
		font-size: var(--fs-xs);
	}

	.row {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: var(--space-4);
	}

	.budget {
		width: 110px;
	}

	.foot {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: var(--space-3);
		margin-top: var(--space-2);
	}
	.hint {
		margin-right: auto;
		font-size: var(--fs-xs);
	}

	/* Phones (bottom sheet): icon/budget stack, the hint gives way to the buttons. */
	@media (max-width: 720px) {
		.row {
			grid-template-columns: minmax(0, 1fr);
		}
		.hint {
			display: none;
		}
	}
</style>
