<script lang="ts">
	import { questColorVar } from '#lib/quest-colors.ts';

	let {
		color,
		label,
		icon,
		outlined = false
	}: {
		/** Quest colour key (`quests.color`). */
		color: string | null | undefined;
		label: string;
		/** Optional emoji instead of the colour dot. */
		icon?: string;
		/** Tinted border, as used in the focus view. */
		outlined?: boolean;
	} = $props();
</script>

<span class="pill" class:outlined style:--q={questColorVar(color)}>
	{#if icon}<span class="emoji" aria-hidden="true">{icon}</span>{:else}<span
			class="dot"
			aria-hidden="true"
		></span>{/if}
	<span class="text">{label}</span>
</span>

<style>
	.pill {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		max-width: 100%;
		height: 28px;
		padding: 0 var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-pill);
		background: var(--surface);
		color: var(--text-2);
		font-size: var(--fs-sm);
	}
	.outlined {
		border-color: color-mix(in srgb, var(--q) 45%, transparent);
	}
	.dot {
		flex: none;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--q);
	}
	.emoji {
		font-size: var(--fs-sm);
		line-height: 1;
	}
	.text {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
