<script lang="ts">
	import { onMount } from 'svelte';
	import { useI18n } from '#lib/i18n/context.svelte.ts';

	/**
	 * Settings save on their own (AB1). Without JS there is nothing to submit a change, so the
	 * server-rendered page has a small Save button per form — gone as soon as the page runs.
	 */
	const t = useI18n();
	let hydrated = $state(false);
	onMount(() => (hydrated = true));
</script>

{#if !hydrated}
	<button type="submit" class="nojs-save">{t.common.save}</button>
{/if}

<style>
	.nojs-save {
		justify-self: start;
		margin-top: var(--space-2);
		padding: var(--space-1) var(--space-3);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-md);
		background: transparent;
		color: var(--text-2);
		font-size: var(--fs-sm);
	}
</style>
