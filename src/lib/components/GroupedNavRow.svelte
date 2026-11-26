<script lang="ts">
	import type { Snippet } from 'svelte';
	import { ChevronRight } from '@lucide/svelte';

	/**
	 * A navigation row of a `GroupedList` (iOS Settings style): an icon tile, the label, a value
	 * or a count badge, and a chevron. A button — it opens a sheet or moves on (`onclick`). With
	 * `href` it is a link (works without JS); `onclick` then handles the tap instead.
	 * `tile` colours the icon tile like iOS Settings (a `--tile-*` role token).
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
		/** Link target (no-JS fallback); a tap calls `onclick` instead when given. */
		href?: string;
		/** Colour of the icon tile, e.g. `var(--tile-goal)`; default: the neutral raised tile. */
		tile?: string;
		onclick?: () => void;
	};
	let {
		label,
		ariaLabel,
		value,
		count,
		icon,
		dialog = false,
		testid,
		href,
		tile,
		onclick
	}: Props = $props();
</script>

{#snippet content()}
	<span class="tile" class:coloured={tile} style:--tile-bg={tile} aria-hidden="true">
		{@render icon()}
	</span>
	<span class="text">{label}</span>
	{#if value}<span class="value">{value}</span>{/if}
	{#if count}<span class="badge tabular">{count}</span>{/if}
	<ChevronRight size={16} class="chev" aria-hidden="true" />
{/snippet}

{#if href}
	<a
		{href}
		class="nav-row press"
		aria-label={ariaLabel}
		aria-haspopup={dialog ? 'dialog' : undefined}
		data-testid={testid}
		onclick={(e) => {
			if (!onclick) return;
			e.preventDefault();
			onclick();
		}}
	>
		{@render content()}
	</a>
{:else}
	<button
		type="button"
		class="nav-row press"
		aria-label={ariaLabel}
		aria-haspopup={dialog ? 'dialog' : undefined}
		data-testid={testid}
		{onclick}
	>
		{@render content()}
	</button>
{/if}

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
		text-decoration: none;
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
	.tile.coloured {
		border-radius: var(--tile-radius);
		background: var(--tile-bg);
		color: var(--tile-ink);
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
