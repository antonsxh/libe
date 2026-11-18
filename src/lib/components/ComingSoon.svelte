<script lang="ts">
	let { milestone, children }: { milestone: string; children?: import('svelte').Snippet } =
		$props();
</script>

<div class="coming-soon">
	<span class="label">{milestone}</span>
	{#if children}<p class="muted">{@render children()}</p>{/if}
</div>

<style>
	.coming-soon {
		display: grid;
		place-items: center;
		align-content: center;
		gap: var(--space-3);
		min-height: 320px;
		padding: var(--space-10);
		border: 1px dashed var(--border-dashed);
		border-radius: var(--radius-lg);
		text-align: center;
	}
</style>
