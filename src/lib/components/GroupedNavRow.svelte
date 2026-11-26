<script lang="ts">
	import type { Snippet } from 'svelte';
	import { ChevronRight } from '@lucide/svelte';

	/**
	 * A navigation row of a `GroupedList` (iOS Settings style): an icon tile, the label, a value
	 * or a count badge, and a chevron. A button — it opens a sheet or moves on (`onclick`).
	 */
	type Props = {
		label: string;
		/** Accessible name when the visible text is not enough ("Backlog, 7 tasks"). */
		ariaLabel?: string;
		/** Muted text at the end (e.g. a summary). */
		value?: string;
		/** Count badge at the end (shown when > 0). */
		count?: number;
		/** The icon tile's content (a lucide icon). */
		icon: Snippet;
		/** Opens a dialog (`aria-haspopup`). */
		dialog?: boolean;
		testid?: string;
		onclick: () => void;
	};
	let { label, ariaLabel, value, count, icon, dialog = false, testid, onclick }: Props = $props();
</script>

<button
	type="button"
	class="nav-row press"
	aria-label={ariaLabel}
	aria-haspopup={dialog ? 'dialog' : undefined}
	data-testid={testid}
	{onclick}
>
	<span class="tile" aria-hidden="true">{@render icon()}</span>
	<span class="text">{label}</span>
	{#if value}<span class="value">{value}</span>{/if}
	{#if count}<span class="badge tabular">{count}</span>{/if}
	<ChevronRight size={16} class="chev" aria-hidden="true" />
</button>

<style>
	.nav-row {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		width: 100%;
		min-height: var(--grouped-row-h);
		padding: var(--space-2) var(--space-3) var(--space-2) var(--grouped-inset);
		border: none;
		background: transparent;
		color: var(--text);
		font-size: var(--fs-md);
		text-align: left;
		-webkit-tap-highlight-color: transparent;
		transition: background var(--dur) var(--ease);
	}
	@media (hover: hover) {
		.nav-row:hover {
			background: var(--surface-hover);
		}
	}
	.nav-row:active {
		background: var(--surface-2);
	}
	.tile {
		flex: none;
		display: grid;
		place-items: center;
		width: var(--row-icon);
		height: var(--row-icon);
		border-radius: var(--radius-md);
		background: var(--surface-2);
		color: var(--text-2);
	}
	.text {
		flex: none;
	}
	.value {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
		text-align: right;
		color: var(--text-muted);
		font-size: var(--fs-sm);
	}
	.badge {
		display: inline-grid;
		place-items: center;
		min-width: var(--row-badge-h);
		height: var(--row-badge-h);
		margin-left: auto;
		padding: 0 var(--space-2);
		border-radius: var(--radius-pill);
		background: var(--surface-2);
		color: var(--text-2);
		font-size: var(--fs-xs);
		font-weight: var(--fw-semibold);
	}
	.value + .badge {
		margin-left: 0;
	}
	.nav-row :global(.chev) {
		flex: none;
		margin-left: auto;
		color: var(--text-faint);
	}
	.value ~ :global(.chev),
	.badge ~ :global(.chev) {
		margin-left: 0;
	}
</style>
