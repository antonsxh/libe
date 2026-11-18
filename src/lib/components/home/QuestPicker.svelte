<script lang="ts">
	import { ChevronDown } from '@lucide/svelte';
	import Menu from '#lib/components/Menu.svelte';
	import QuestPill from '#lib/components/QuestPill.svelte';
	import { questColorVar } from '#lib/quest-colors.ts';
	import type { Quest } from '#lib/server/db/schema.ts';

	let {
		quests,
		value = $bindable('')
	}: {
		/** Open quests to choose from (grid order). */
		quests: Quest[];
		/** Selected quest id; falls back to the first quest. */
		value?: string;
	} = $props();

	const selected = $derived(quests.find((q) => q.id === value) ?? quests[0] ?? null);
</script>

{#if selected}
	<Menu label="Choose quest">
		{#snippet trigger()}
			<span class="picker">
				<QuestPill color={selected.color} label={selected.name} outlined />
				<ChevronDown size={14} />
			</span>
		{/snippet}
		{#snippet children(close)}
			{#each quests as quest (quest.id)}
				<button
					type="button"
					class="item"
					role="menuitemradio"
					aria-checked={quest.id === selected.id}
					onclick={() => {
						value = quest.id;
						close();
					}}
				>
					<span class="dot" style:--q={questColorVar(quest.color)}></span>
					<span class="qname">{quest.name}</span>
					{#if quest.id === selected.id}<span class="tick" aria-hidden="true">✓</span>{/if}
				</button>
			{/each}
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
	.picker :global(svg) {
		flex: none;
		color: var(--text-faint);
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
		color: var(--accent);
	}
</style>
