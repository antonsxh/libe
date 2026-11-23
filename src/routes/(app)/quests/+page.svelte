<script lang="ts">
	import { Plus } from '@lucide/svelte';
	import Button from '#lib/components/Button.svelte';
	import Dialog from '#lib/components/Dialog.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import QuestCard from '#lib/components/quests/QuestCard.svelte';
	import QuestForm from '#lib/components/quests/QuestForm.svelte';
	import { formatHours } from '#lib/dates.ts';
	import type { Quest } from '#lib/server/db/schema.ts';
	import { useI18n } from '#lib/i18n/context.svelte.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const t = useI18n();

	let creating = $state(false);
	/** Bumped on every open: a fresh create form (not reset while the sheet slides out). */
	let createNonce = $state(0);
	function startCreate() {
		creating = true;
		createNonce += 1;
	}
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

<svelte:head><title>{t.quests.title} · libe</title></svelte:head>

<PageHeader title={t.quests.title} subtitle={t.quests.subtitle}>
	{#snippet actions()}
		<Button variant="primary" onclick={startCreate}>
			<Plus size={18} />
			{t.quests.newQuest}
		</Button>
	{/snippet}
</PageHeader>

<p class="summary">
	<strong class="big tabular">{formatHours(data.hours.quarterTotalH, t.intl)}</strong>
	<span class="muted">{t.quests.summary(openQuests.length)}</span>
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
	<button type="button" class="new-tile" onclick={startCreate}>
		<Plus size={20} />
		<span>{t.quests.newQuest}</span>
	</button>
</div>

{#if closedQuests.length > 0}
	<details class="closed-section">
		<summary class="label">{t.quests.closedCount(closedQuests.length)}</summary>
		<div class="grid">
			{#each closedQuests as quest (quest.id)}
				<QuestCard {quest} stats={data.hours.byQuest[quest.id]} closed onedit={startEdit} />
			{/each}
		</div>
	</details>
{/if}

<Dialog bind:open={creating} title={t.quests.newQuest}>
	{#key createNonce}
		<QuestForm mode="create" {form} ondone={() => (creating = false)} />
	{/key}
</Dialog>

{#if editingQuest}
	<Dialog bind:open={editing} title={t.quests.editQuest}>
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
		font-family: var(--font-display);
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
