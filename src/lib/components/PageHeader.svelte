<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		title,
		subtitle,
		titleActions,
		actions
	}: {
		title: string;
		subtitle?: string;
		/** Rendered beside the title (e.g. a funnel filter button). */
		titleActions?: Snippet;
		/** Rendered at the right edge (e.g. stat blocks). */
		actions?: Snippet;
	} = $props();
</script>

<header class="page-header">
	<div class="titles">
		<div class="title-row">
			<h1>{title}</h1>
			{#if titleActions}<div class="title-actions">{@render titleActions()}</div>{/if}
		</div>
		{#if subtitle}<p class="muted">{subtitle}</p>{/if}
	</div>
	{#if actions}<div class="actions">{@render actions()}</div>{/if}
</header>

<style>
	.page-header {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: var(--space-6);
		flex-wrap: wrap;
		margin-bottom: var(--space-10);
	}
	.titles {
		display: grid;
		gap: var(--space-3);
		min-width: 0;
	}
	.title-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-3);
	}
	.title-actions {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.actions {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}

	/* Phones: the first screen belongs to the content (Home's "Next up", lists). */
	@media (max-width: 720px) {
		.page-header {
			gap: var(--space-4);
			margin-bottom: var(--space-6);
		}
	}
</style>
