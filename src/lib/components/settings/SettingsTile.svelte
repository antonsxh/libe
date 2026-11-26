<script lang="ts">
	import type { Snippet } from 'svelte';

	/** iOS Settings symbol tile: a white symbol on a coloured rounded square (`--tile-*`). */
	type Props = { color: string; size?: 'md' | 'sm'; children: Snippet };
	let { color, size = 'md', children }: Props = $props();
</script>

<span class="tile {size}" style:--tile-bg={color} aria-hidden="true">{@render children()}</span>

<style>
	.tile {
		flex: none;
		display: grid;
		place-items: center;
		width: var(--row-icon);
		height: var(--row-icon);
		border-radius: var(--tile-radius);
		background: var(--tile-bg);
		color: var(--tile-ink);
		transition: background var(--dur) var(--ease);
	}
	.tile.sm {
		width: var(--tile-sm);
		height: var(--tile-sm);
		border-radius: var(--tile-radius-sm);
	}
</style>
