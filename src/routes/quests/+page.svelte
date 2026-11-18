<script lang="ts">
	import { Plus } from '@lucide/svelte';
	import Button from '#lib/components/Button.svelte';
	import Dialog from '#lib/components/Dialog.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import QuestCard from '#lib/components/quests/QuestCard.svelte';
	import QuestForm from '#lib/components/quests/QuestForm.svelte';
	import { formatHours } from '#lib/dates.ts';
	import type { Quest } from '#lib/server/db/schema.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let creating = $state(false);
	let editingQuest = $state<Quest | null>(null);
	let editing = $state(false);
	/** Bumped on every open so the edit form always starts from the saved quest values. */
	let editNonce = $state(0);

	function startEdit(quest: Quest) {
		editingQuest = quest;
		editing = true;
		editNonce += 1;
	}

	const openQuests = $derived(data.open);
	const closedQuests = $derived(data.closed);
</script>

<svelte:head><title>Quests · libe</title></svelte:head>

<PageHeader
	title="Quests"
	subtitle="The few things that actually matter. Every hour you log is tagged to one of these."
>
	{#snippet actions()}
		<Button variant="primary" onclick={() => (creating = true)}>
			<Plus size={18} /> New quest
		</Button>
	{/snippet}
</PageHeader>

<p class="summary">
	<strong class="big tabular">{formatHours(data.hours.quarterTotalH)}</strong>
	<span class="muted">
		logged this quarter across {openQuests.length} quest{openQuests.length === 1 ? '' : 's'}
	</span>
</p>

<div class="grid">
	{#each openQuests as quest, i (quest.id)}
		<QuestCard
			{quest}
			stats={data.hours.byQuest[quest.id]}
			first={i === 0}
			last={i === openQuests.length - 1}
			onedit={startEdit}
		/>
	{/each}
	<button type="button" class="new-tile" onclick={() => (creating = true)}>
		<Plus size={20} />
		<span>New quest</span>
	</button>
</div>

{#if closedQuests.length > 0}
	<details class="closed-section">
		<summary class="label">Closed ({closedQuests.length})</summary>
		<div class="grid">
			{#each closedQuests as quest (quest.id)}
				<QuestCard {quest} stats={data.hours.byQuest[quest.id]} closed onedit={startEdit} />
			{/each}
		</div>
	</details>
{/if}

<Dialog bind:open={creating} title="New quest">
	{#key creating}
		<QuestForm mode="create" {form} ondone={() => (creating = false)} />
	{/key}
</Dialog>

{#if editingQuest}
	<Dialog bind:open={editing} title="Edit quest">
		{#key `${editingQuest.id}:${editNonce}`}
			<QuestForm mode="update" quest={editingQuest} {form} ondone={() => (editing = false)} />
		{/key}
	</Dialog>
{/if}

<style>
	.summary {
		display: flex;
		align-items: baseline;
		gap: var(--space-3);
		margin-bottom: var(--space-8);
	}
	.summary .big {
		font-size: var(--fs-xl);
		font-weight: var(--fw-semibold);
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: var(--space-4);
	}

	.new-tile {
		display: grid;
		place-content: center;
		justify-items: center;
		gap: var(--space-3);
		min-height: 190px;
		background: transparent;
		border: 1px dashed var(--border-dashed);
		border-radius: var(--radius-lg);
		color: var(--text-muted);
		transition:
			border-color var(--dur) var(--ease),
			color var(--dur) var(--ease);
	}
	.new-tile:hover {
		border-color: var(--border-strong);
		color: var(--text);
	}

	.closed-section {
		margin-top: var(--space-10);
	}
	.closed-section summary {
		cursor: pointer;
		margin-bottom: var(--space-4);
	}
</style>
