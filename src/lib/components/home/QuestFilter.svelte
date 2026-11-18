<script lang="ts">
	import { tick } from 'svelte';
	import { Funnel } from '@lucide/svelte';
	import { questColorVar } from '#lib/quest-colors.ts';
	import type { Quest } from '#lib/server/db/schema.ts';

	let {
		quests,
		/** Quest ids to show; null = no filter (all). */
		selected,
		onchange
	}: {
		quests: Quest[];
		selected: string[] | null;
		onchange: (ids: string[] | null) => void;
	} = $props();

	let open = $state(false);
	let trigger: HTMLButtonElement | undefined = $state();
	let pop: HTMLDivElement | undefined = $state();

	const checked = (id: string) => (selected ? selected.includes(id) : true);

	function close() {
		if (!open) return;
		open = false;
		trigger?.focus();
	}

	async function toggleOpen() {
		open = !open;
		if (open) await tick().then(() => pop?.querySelector<HTMLElement>('input')?.focus());
	}

	function setQuest(id: string, on: boolean) {
		const ids = quests.filter((q) => (q.id === id ? on : checked(q.id))).map((q) => q.id);
		// "all" or "none" checked means "no filter" (show everything).
		onchange(ids.length === 0 || ids.length === quests.length ? null : ids);
	}

	$effect(() => {
		if (!open) return;
		function onKey(e: KeyboardEvent) {
			if (e.key === 'Escape') {
				e.preventDefault();
				close();
			}
		}
		function onClick(e: MouseEvent) {
			const target = e.target as Node;
			if (!pop?.contains(target) && !trigger?.contains(target)) close();
		}
		document.addEventListener('keydown', onKey);
		document.addEventListener('click', onClick, true);
		return () => {
			document.removeEventListener('keydown', onKey);
			document.removeEventListener('click', onClick, true);
		};
	});
</script>

<span class="wrap">
	<button
		type="button"
		class="funnel"
		class:active={selected !== null}
		bind:this={trigger}
		aria-label="Filter quest work by quest"
		aria-haspopup="dialog"
		aria-expanded={open}
		onclick={toggleOpen}
	>
		<Funnel size={16} />
	</button>

	{#if open}
		<div class="pop" role="dialog" aria-label="Quest filter" bind:this={pop}>
			<p class="hint muted">Show tasks of</p>
			{#each quests as quest (quest.id)}
				<label class="row">
					<input
						type="checkbox"
						checked={checked(quest.id)}
						onchange={(e) => setQuest(quest.id, e.currentTarget.checked)}
					/>
					<span class="dot" style:--q={questColorVar(quest.color)}></span>
					<span class="name">{quest.name}</span>
				</label>
			{:else}
				<p class="hint muted">No open quests.</p>
			{/each}
		</div>
	{/if}
</span>

<style>
	.wrap {
		position: relative;
		display: inline-flex;
	}
	.funnel {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 30px;
		height: 30px;
		border: none;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text-faint);
		transition:
			color var(--dur) var(--ease),
			background var(--dur) var(--ease);
	}
	.funnel:hover {
		color: var(--text);
		background: var(--surface-hover);
	}
	.funnel.active {
		color: var(--accent);
	}

	.pop {
		position: absolute;
		top: calc(100% + var(--space-1));
		right: 0;
		z-index: 40;
		min-width: 200px;
		padding: var(--space-2);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-pop);
	}
	.hint {
		font-size: var(--fs-xs);
		padding: var(--space-1) var(--space-2) var(--space-2);
	}
	.row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2);
		border-radius: var(--radius-sm);
		font-size: var(--fs-sm);
		color: var(--text-2);
		cursor: pointer;
	}
	.row:hover {
		background: var(--surface-hover);
	}
	.dot {
		flex: none;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--q, var(--quest-slate));
	}
	.name {
		min-width: 0;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
</style>
