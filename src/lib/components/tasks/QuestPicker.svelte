<script module lang="ts">
	/** Value of the synthetic "Other" entry (tasks of kind `other`, no quest id). */
	export const OTHER_VALUE = 'other';
	/** Minimal quest shape the picker needs (a full `Quest` row satisfies it). */
	export type QuestOption = { id: string; name: string; color: string | null };
</script>

<script lang="ts">
	import { ChevronDown } from '@lucide/svelte';
	import Menu from '#lib/components/Menu.svelte';
	import QuestPill from '#lib/components/QuestPill.svelte';
	import { questColorVar } from '#lib/quest-colors.ts';
	import { useI18n } from '#lib/i18n/context.svelte.ts';

	let {
		quests,
		otherOption = false,
		compact = false,
		value = $bindable('')
	}: {
		/** Open quests to choose from (grid order). */
		quests: QuestOption[];
		/** Append a synthetic "Other" entry (submits `value = 'other'`). */
		otherOption?: boolean;
		/** Dot-only trigger (narrow plan columns); the quest name is in the label/tooltip. */
		compact?: boolean;
		/** Selected quest id; falls back to the first quest (or Other when empty). */
		value?: string;
	} = $props();

	const t = useI18n();
	const otherSelected = $derived(
		otherOption && (value === 'other' || (value === '' && quests.length === 0))
	);
	const selected = $derived(quests.find((q) => q.id === value) ?? quests[0] ?? null);
	const selectedName = $derived(otherSelected ? t.common.other : (selected?.name ?? ''));
</script>

{#if selected || otherSelected}
	<Menu label={compact ? t.tasks.pickerCompact(selectedName) : t.tasks.chooseQuest}>
		{#snippet trigger()}
			<span class="picker" class:compact title={compact ? selectedName : undefined}>
				{#if compact}
					<span
						class="dot big"
						style:--q={otherSelected ? undefined : questColorVar(selected?.color)}
					></span>
				{:else if otherSelected}
					<QuestPill color={null} label={t.common.other} outlined />
				{:else if selected}
					<QuestPill color={selected.color} label={selected.name} outlined />
				{/if}
				<ChevronDown size={14} />
			</span>
		{/snippet}
		{#snippet children(close)}
			{#each quests as quest (quest.id)}
				<button
					type="button"
					class="item"
					role="menuitemradio"
					aria-checked={!otherSelected && quest.id === (selected?.id ?? '')}
					onclick={() => {
						value = quest.id;
						close();
					}}
				>
					<span class="dot" style:--q={questColorVar(quest.color)}></span>
					<span class="qname">{quest.name}</span>
					{#if !otherSelected && quest.id === (selected?.id ?? '')}
						<span class="tick" aria-hidden="true">✓</span>
					{/if}
				</button>
			{/each}
			{#if otherOption}
				{#if quests.length > 0}<span class="sep" aria-hidden="true"></span>{/if}
				<button
					type="button"
					class="item"
					role="menuitemradio"
					aria-checked={otherSelected}
					onclick={() => {
						value = 'other';
						close();
					}}
				>
					<span class="dot"></span>
					<span class="qname">{t.common.other}</span>
					{#if otherSelected}<span class="tick" aria-hidden="true">✓</span>{/if}
				</button>
			{/if}
		{/snippet}
	</Menu>
{/if}

<style>
	.picker {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		min-width: 0;
	}
	.picker.compact {
		gap: 2px;
		height: 28px;
		padding: 0 var(--space-1);
		border-radius: var(--radius-sm);
	}
	.picker.compact:hover {
		background: var(--surface-hover);
	}
	.dot.big {
		width: 10px;
		height: 10px;
	}
	.picker :global(svg) {
		flex: none;
		color: var(--text-faint);
	}

	.sep {
		display: block;
		height: 1px;
		margin: var(--space-1) var(--space-2);
		background: var(--border);
	}
	.item {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		width: 100%;
		padding: var(--space-2) var(--space-3);
		border: none;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text-2);
		font-size: var(--fs-sm);
		text-align: left;
	}
	.item:hover {
		background: var(--surface-hover);
		color: var(--text);
	}
	.dot {
		flex: none;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--q, var(--quest-slate));
	}
	.qname {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	.tick {
		color: var(--accent-text);
	}
</style>
