<script lang="ts">
	import type { Snippet } from 'svelte';

	let { title, subtitle, actions }: { title: string; subtitle?: string; actions?: Snippet } =
		$props();
</script>

<header class="page-header">
	<div class="titles">
		<h1>{title}</h1>
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
	}
	.actions {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}
</style>
