<script lang="ts">
	import { enhance } from '$app/forms';
	import { untrack } from 'svelte';
	import Button from '#lib/components/Button.svelte';
	import { SUGGESTED_EMOJIS } from '#lib/emoji.ts';
	import { QUEST_COLORS, questColorVar } from '#lib/quest-colors.ts';
	import { QUEST_DESC_MAX, QUEST_NAME_MAX, type QuestFormResult } from '#lib/quest-form.ts';
	import type { Quest } from '#lib/server/db/schema.ts';

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
		<span class="label">Name</span>
		<input
			name="name"
			type="text"
			required
			maxlength={QUEST_NAME_MAX}
			placeholder="Launch my idea"
			autocomplete="off"
			value={echo?.name ?? quest?.name ?? ''}
		/>
		{#if echo?.errors?.name}<span class="error">{echo.errors.name}</span>{/if}
	</label>

	<label class="field">
		<span class="label">Description</span>
		<textarea
			name="description"
			rows="3"
			maxlength={QUEST_DESC_MAX}
			placeholder="The few things that actually matter…"
			value={echo?.description ?? quest?.description ?? ''}></textarea>
		{#if echo?.errors?.description}<span class="error">{echo.errors.description}</span>{/if}
	</label>

	<div class="row">
		<div class="field">
			<span class="label" id="icon-label">Icon</span>
			<div class="icon-row">
				<input
					class="icon-input"
					name="icon"
					type="text"
					bind:value={icon}
					placeholder="🚀"
					aria-labelledby="icon-label"
					autocomplete="off"
				/>
				<div class="emoji-grid" role="group" aria-label="Suggested emoji">
					{#each SUGGESTED_EMOJIS as emoji (emoji)}
						<button
							type="button"
							class="emoji-pick"
							aria-label={`Use ${emoji} as icon`}
							onclick={() => (icon = emoji)}
						>
							{emoji}
						</button>
					{/each}
				</div>
			</div>
			{#if echo?.errors?.icon}<span class="error">{echo.errors.icon}</span>{/if}
		</div>

		<label class="field">
			<span class="label">Weekly budget · h</span>
			<input
				class="budget"
				name="weeklyBudgetH"
				type="number"
				min="0.5"
				max="168"
				step="0.5"
				placeholder="none"
				value={echo?.weeklyBudgetH ?? quest?.weeklyBudgetH ?? ''}
			/>
			{#if echo?.errors?.weeklyBudgetH}
				<span class="error">{echo.errors.weeklyBudgetH}</span>
			{/if}
		</label>
	</div>

	<div class="field">
		<span class="label">Colour</span>
		<div class="swatches" role="radiogroup" aria-label="Quest colour">
			{#each QUEST_COLORS as c (c)}
				<label class="swatch" style:--q={questColorVar(c)} title={c}>
					<input type="radio" name="color" value={c} bind:group={color} aria-label={c} />
					<span class="dot" aria-hidden="true"></span>
				</label>
			{/each}
		</div>
		{#if echo?.errors?.color}<span class="error">{echo.errors.color}</span>{/if}
	</div>

	<div class="foot">
		<span class="muted hint">
			{mode === 'create' ? 'You can change everything later.' : ''}
		</span>
		<Button variant="ghost" onclick={() => ondone()}>Cancel</Button>
		<Button variant="primary" type="submit">
			{mode === 'create' ? 'Create quest' : 'Save changes'}
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

	.icon-row {
		display: grid;
		grid-template-columns: 64px 1fr;
		gap: var(--space-2);
		align-items: start;
	}
	.icon-input {
		font-size: var(--fs-lg);
		text-align: center;
	}
	.emoji-grid {
		display: grid;
		grid-template-columns: repeat(8, 1fr);
		gap: var(--space-1);
	}
	.emoji-pick {
		display: grid;
		place-items: center;
		aspect-ratio: 1;
		padding: 0;
		background: var(--surface-2);
		border: 1px solid transparent;
		border-radius: var(--radius-sm);
		font-size: var(--fs-md);
		line-height: 1;
		transition: border-color var(--dur) var(--ease);
	}
	.emoji-pick:hover {
		border-color: var(--border-strong);
	}

	.budget {
		width: 110px;
	}

	.swatches {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	.swatch {
		position: relative;
		display: inline-flex;
	}
	.swatch input {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		margin: 0;
		opacity: 0;
		cursor: pointer;
	}
	.swatch .dot {
		width: 26px;
		height: 26px;
		border-radius: 50%;
		background: var(--q);
		transition: box-shadow var(--dur) var(--ease);
	}
	.swatch:hover .dot {
		box-shadow:
			0 0 0 2px var(--surface),
			0 0 0 3px var(--q);
	}
	.swatch input:checked + .dot {
		box-shadow:
			0 0 0 2px var(--surface),
			0 0 0 4px var(--q);
	}
	.swatch input:focus-visible + .dot {
		box-shadow:
			0 0 0 2px var(--surface),
			0 0 0 4px var(--q),
			0 0 0 7px color-mix(in srgb, var(--accent) 55%, transparent);
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
</style>
