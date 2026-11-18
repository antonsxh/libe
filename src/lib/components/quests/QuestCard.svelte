<script lang="ts">
	import { enhance } from '$app/forms';
	import { RotateCcw, Trash2 } from '@lucide/svelte';
	import Menu from '#lib/components/Menu.svelte';
	import Sparkline from '#lib/components/Sparkline.svelte';
	import { formatHours } from '#lib/dates.ts';
	import { questColorVar } from '#lib/quest-colors.ts';
	import type { QuestStats } from '#lib/stats-core.ts';
	import type { Quest } from '#lib/server/db/schema.ts';

	let {
		quest,
		stats,
		closed = false,
		first = false,
		last = false,
		onedit
	}: {
		quest: Quest;
		stats?: QuestStats | null;
		/** Closed quests render dimmed; the menu offers Reopen instead of Close. */
		closed?: boolean;
		first?: boolean;
		last?: boolean;
		onedit: (quest: Quest) => void;
	} = $props();

	let confirmingDelete = $state(false);

	const weekly = $derived(stats?.weeklyH ?? []);
</script>

<article class="quest-card card" class:closed>
	<div class="top">
		<span class="tile" aria-hidden="true">{quest.icon}</span>
		<span class="title-wrap">
			<a class="name" href={`/quests/${quest.id}`}>{quest.name}</a>
		</span>
		<span class="menu-slot">
			<Menu label={`Actions for ${quest.name}`} onclose={() => (confirmingDelete = false)}>
				{#snippet children(close)}
					{#if confirmingDelete}
						<p class="confirm">
							Delete “{quest.name}”? Its tasks and all logged time are deleted too.
						</p>
						<div class="confirm-actions">
							<button
								type="button"
								class="item"
								role="menuitem"
								onclick={() => (confirmingDelete = false)}
							>
								Cancel
							</button>
							<form method="POST" action="?/delete" use:enhance={() => close()}>
								<input type="hidden" name="questId" value={quest.id} />
								<button type="submit" class="item danger" role="menuitem">
									<Trash2 size={14} /> Delete
								</button>
							</form>
						</div>
					{:else}
						<button
							type="button"
							class="item"
							role="menuitem"
							onclick={() => {
								close();
								onedit(quest);
							}}
						>
							Edit
						</button>
						{#if !closed}
							<form method="POST" action="?/moveUp" use:enhance={() => close()}>
								<input type="hidden" name="questId" value={quest.id} />
								<button type="submit" class="item" role="menuitem" disabled={first}>
									Move up
								</button>
							</form>
							<form method="POST" action="?/moveDown" use:enhance={() => close()}>
								<input type="hidden" name="questId" value={quest.id} />
								<button type="submit" class="item" role="menuitem" disabled={last}>
									Move down
								</button>
							</form>
						{/if}
						<form
							method="POST"
							action={closed ? '?/reopen' : '?/close'}
							use:enhance={() => close()}
						>
							<input type="hidden" name="questId" value={quest.id} />
							<button type="submit" class="item" role="menuitem">
								{#if closed}<RotateCcw size={14} />{/if}
								{closed ? 'Reopen quest' : 'Close quest'}
							</button>
						</form>
						<button
							type="button"
							class="item danger"
							role="menuitem"
							onclick={() => (confirmingDelete = true)}
						>
							<Trash2 size={14} /> Delete quest
						</button>
					{/if}
				{/snippet}
			</Menu>
		</span>
	</div>

	{#if quest.description}<p class="desc muted">{quest.description}</p>{/if}

	<div class="bottom">
		<div class="week">
			<span class="week-row">
				<span class="big tabular">{formatHours(stats?.weekH ?? 0)}</span>
				{#if quest.weeklyBudgetH !== null}
					<span class="budget muted tabular">/ {formatHours(quest.weeklyBudgetH)}</span>
				{/if}
			</span>
			<span class="label">This week</span>
		</div>
		<div class="spark-wrap">
			<Sparkline values={weekly} color={questColorVar(quest.color)} width={110} height={34} />
			<span class="quarter muted tabular">{formatHours(stats?.quarterH ?? 0)} this quarter</span>
		</div>
	</div>
</article>

<style>
	.quest-card {
		position: relative;
		display: grid;
		grid-template-rows: auto 1fr auto;
		gap: var(--space-3);
		padding: var(--space-5);
		min-height: 190px;
		transition:
			border-color var(--dur) var(--ease),
			background var(--dur) var(--ease);
	}
	.quest-card:hover {
		border-color: var(--border-strong);
		background: var(--surface-hover);
	}
	.quest-card.closed {
		opacity: 0.55;
	}

	.top {
		display: grid;
		grid-template-columns: auto 1fr auto;
		align-items: center;
		gap: var(--space-3);
	}
	.tile {
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		border-radius: var(--radius-lg);
		background: var(--surface-2);
		font-size: 22px;
		line-height: 1;
	}
	.title-wrap {
		min-width: 0;
	}
	.name {
		display: block;
		font-size: var(--fs-lg);
		font-weight: var(--fw-medium);
		color: var(--text);
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
		/* Invisible overlay: the whole card is a link to the quest detail page. */
	}
	.name::after {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: var(--radius-lg);
	}
	.name:focus-visible {
		outline: none;
		box-shadow: none;
	}
	.name:focus-visible::after {
		box-shadow: var(--ring);
	}

	.menu-slot {
		position: relative;
		z-index: 2;
	}

	.desc {
		font-size: var(--fs-sm);
		margin-left: calc(44px + var(--space-3));
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		min-height: calc(var(--fs-sm) * 1.45 * 2);
	}

	.bottom {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: var(--space-4);
	}
	.week {
		display: grid;
		gap: var(--space-1);
	}
	.week-row {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
	}
	.big {
		font-size: var(--fs-2xl);
		font-weight: var(--fw-medium);
		line-height: 1;
		letter-spacing: -0.02em;
	}
	.budget {
		font-size: var(--fs-sm);
		white-space: nowrap;
	}

	.spark-wrap {
		min-width: 0;
		display: grid;
		justify-items: end;
		gap: var(--space-2);
	}
	.quarter {
		font-size: var(--fs-xs);
	}

	/* ── menu content (rendered in this component's scope) ── */
	.item {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		width: 100%;
		padding: var(--space-2) var(--space-3);
		background: transparent;
		border: none;
		border-radius: var(--radius-sm);
		color: var(--text-2);
		font-size: var(--fs-sm);
		text-align: left;
		white-space: nowrap;
	}
	.item:hover:not(:disabled) {
		background: var(--surface-hover);
		color: var(--text);
	}
	.item:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
	.item.danger {
		color: var(--danger);
	}
	.confirm {
		padding: var(--space-2) var(--space-3);
		color: var(--text-2);
		font-size: var(--fs-xs);
		max-width: 210px;
	}
	.confirm-actions {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-1);
	}
	.confirm-actions form {
		margin: 0;
	}
</style>
