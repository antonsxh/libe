<script lang="ts">
	import { enhance } from '$app/forms';
	import { formAction } from '#lib/form-action.ts';
	import { untrack } from 'svelte';
	import { ChevronDown, ChevronRight } from '@lucide/svelte';
	import Button from '#lib/components/Button.svelte';
	import ColorSwatches from '#lib/components/ColorSwatches.svelte';
	import EmojiPicker from '#lib/components/EmojiPicker.svelte';
	import GroupedList from '#lib/components/GroupedList.svelte';
	import GroupedRow from '#lib/components/GroupedRow.svelte';
	import { DEFAULT_QUEST_ICON, SUGGESTED_EMOJIS } from '#lib/emoji.ts';
	import {
		QUEST_BUDGET_MAX_H,
		QUEST_DESC_MAX,
		QUEST_NAME_MAX,
		hasQuestExtras,
		type QuestFormResult
	} from '#lib/quest-form.ts';
	import type { Quest } from '#lib/server/db/schema.ts';
	import { useI18n } from '#lib/i18n/context.svelte.ts';

	/**
	 * The quest dialog's form (create / edit): name and colour up front; icon, description and
	 * weekly budget behind "More options" — a native `<details>`, so it works without JS and
	 * the folded fields still submit their values (or the defaults the server fills in). It
	 * starts open when the quest has any of them set, or one of them failed validation.
	 */
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
	const f = $derived(t.quests.form);
	const id = $props.id();

	/** Echoed input while a validation error is shown; otherwise the quest's values. */
	const echo = $derived(form?.intent === mode && form.errors ? form : undefined);
	const errors = $derived(echo?.errors ?? {});
	const errorList = $derived(Object.values(errors).filter(Boolean));

	// Initial values only: the fields are bound afterwards, so later prop changes must not reset them.
	let icon = $state(untrack(() => echo?.icon ?? quest?.icon ?? ''));
	let color = $state(untrack(() => echo?.color ?? quest?.color ?? 'amber'));
	let more = $state(
		untrack(
			() =>
				hasQuestExtras(echo ?? quest) ||
				Boolean(echo?.errors?.icon || echo?.errors?.description || echo?.errors?.weeklyBudgetH)
		)
	);
	let budget = $state<number | string | null>(
		untrack(() => echo?.weeklyBudgetH ?? quest?.weeklyBudgetH ?? '')
	);
	/** The emoji choice opens on tap (or with an invalid icon to fix). */
	let iconOpen = $state(untrack(() => Boolean(echo?.errors?.icon)));
</script>

<form
	method="POST"
	action={formAction(mode)}
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

	<GroupedList>
		<GroupedRow>
			<input
				name="name"
				type="text"
				required
				maxlength={QUEST_NAME_MAX}
				aria-label={f.name}
				aria-invalid={errors.name ? true : undefined}
				placeholder={f.namePlaceholder}
				autocomplete="off"
				value={echo?.name ?? quest?.name ?? ''}
			/>
		</GroupedRow>
		<GroupedRow label={f.colour} stacked>
			<ColorSwatches name="color" bind:value={color} label={f.colourGroup} />
		</GroupedRow>
	</GroupedList>

	<GroupedList>
		<details class="more" bind:open={more}>
			<summary class="disclosure">
				<span class="grow">{f.more}</span>
				{#if !more}<span class="trail">{f.moreHint}</span>{/if}
				<ChevronDown class="chev" size={18} aria-hidden="true" />
			</summary>
			<div class="more-rows">
				<details class="icon-row" bind:open={iconOpen}>
					<summary class="disclosure">
						<span class="grow" id="{id}-icon">{f.icon}</span>
						<span class="emoji" aria-hidden="true">{icon.trim() || DEFAULT_QUEST_ICON}</span>
						<ChevronRight class="chev" size={18} aria-hidden="true" />
					</summary>
					<div class="picker">
						<EmojiPicker
							name="icon"
							bind:value={icon}
							labelledby="{id}-icon"
							suggestions={SUGGESTED_EMOJIS}
							groupLabel={f.suggested}
							pickLabel={f.useIcon}
							placeholder={DEFAULT_QUEST_ICON}
							invalid={Boolean(errors.icon)}
						/>
					</div>
				</details>
				<div class="field-row">
					<textarea
						name="description"
						rows="2"
						maxlength={QUEST_DESC_MAX}
						aria-label={f.description}
						aria-invalid={errors.description ? true : undefined}
						placeholder={f.descriptionPlaceholder}
						value={echo?.description ?? quest?.description ?? ''}></textarea>
				</div>
				<div class="field-row budget-row">
					<label class="grow" for="{id}-budget">
						{f.budget}<span class="sr-only"> ({f.budgetHours})</span>
					</label>
					<input
						id="{id}-budget"
						class="budget"
						name="weeklyBudgetH"
						type="number"
						inputmode="decimal"
						min="0.5"
						max={QUEST_BUDGET_MAX_H}
						step="0.5"
						aria-invalid={errors.weeklyBudgetH ? true : undefined}
						placeholder={f.budgetPlaceholder}
						bind:value={budget}
					/>
					{#if String(budget ?? '') !== ''}
						<span class="unit" aria-hidden="true">{f.budgetUnit}</span>
					{/if}
				</div>
			</div>
		</details>
	</GroupedList>

	{#if errorList.length > 0}
		<div class="errors" role="alert">
			{#each errorList as message (message)}<p>{message}</p>{/each}
		</div>
	{/if}

	<div class="foot dialog-actions">
		<Button variant="primary" type="submit">
			{mode === 'create' ? f.create : t.common.save}
		</Button>
	</div>
</form>

<style>
	.quest-form {
		display: grid;
		gap: var(--space-5);
		/* Grouped rows sit on the dialog's surface: one step lighter. */
		--grouped-bg: var(--grouped-bg-raised);
		--grouped-separator: var(--grouped-separator-raised);
	}

	/* ── "More options" and the icon row: native disclosures styled as grouped rows ── */
	.disclosure {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		min-height: var(--grouped-row-h);
		padding: var(--space-2) var(--grouped-inset);
		cursor: pointer;
		list-style: none;
		color: var(--text);
		-webkit-tap-highlight-color: transparent;
		transition: background var(--dur) var(--ease);
	}
	.disclosure::-webkit-details-marker {
		display: none;
	}
	.disclosure:focus-visible {
		outline: 2px solid var(--focus-ring);
		outline-offset: -4px;
		border-radius: var(--radius-md);
		box-shadow: none;
	}
	@media (hover: hover) {
		.disclosure:hover {
			background: var(--surface-hover);
		}
	}
	.grow {
		flex: 1;
		min-width: 0;
		color: var(--text);
	}
	.trail {
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
		color: var(--text-muted);
		font-size: var(--fs-sm);
	}
	.disclosure :global(.chev) {
		flex: none;
		color: var(--text-faint);
		transition: rotate var(--dur) var(--ease);
	}
	.more[open] > .disclosure :global(.chev) {
		rotate: 180deg;
	}
	.icon-row[open] > .disclosure :global(.chev) {
		rotate: 90deg;
	}
	.emoji {
		font-size: var(--fs-lg);
		line-height: 1;
	}

	/* Rows inside "More options", with the grouped list's inset hairline between them. */
	.more-rows > *,
	.picker {
		position: relative;
	}
	.more-rows > *::before,
	.picker::before {
		content: '';
		position: absolute;
		top: 0;
		left: var(--grouped-inset);
		right: 0;
		height: 1px;
		background: var(--grouped-separator);
		pointer-events: none;
	}
	.picker {
		padding: var(--space-3) var(--grouped-inset);
	}
	.field-row {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		min-height: var(--grouped-row-h);
		padding: var(--space-2) var(--grouped-inset);
	}
	.field-row:has(:focus-visible) {
		outline: 2px solid var(--focus-ring);
		outline-offset: -4px;
		border-radius: var(--radius-md);
	}
	/* Borderless fields: the row is the field (like GroupedRow's text inputs). */
	textarea,
	.budget {
		min-width: 0;
		padding: 0;
		border: 0;
		border-radius: 0;
		background: transparent;
		color: var(--text);
		font-size: var(--fs-md);
	}
	textarea:focus-visible,
	.budget:focus-visible {
		box-shadow: none;
	}
	textarea {
		flex: 1;
		resize: none;
		field-sizing: content; /* grows with its text where supported */
		min-height: 2lh;
		font-family: inherit;
		line-height: 1.4;
	}
	.budget {
		width: 7ch;
		text-align: right;
	}
	.unit {
		color: var(--text-muted);
	}
	[aria-invalid='true'] {
		color: var(--danger);
	}

	.errors {
		display: grid;
		gap: var(--space-1);
		color: var(--danger);
		font-size: var(--fs-sm);
	}

	.foot {
		display: flex;
		justify-content: flex-end;
	}
</style>
