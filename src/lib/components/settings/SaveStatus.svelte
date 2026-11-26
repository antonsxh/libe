<script lang="ts">
	import { Check } from '@lucide/svelte';
	import { useSaveIndicator } from '#lib/autosave.svelte.ts';
	import { useI18n } from '#lib/i18n/context.svelte.ts';

	/** Quiet autosave feedback ("Saving…" / "Saved"), a live region for screen readers. */
	const t = useI18n();
	const indicator = useSaveIndicator();
	const state = $derived(indicator?.state ?? 'idle');
</script>

<span class="save-status" role="status" data-state={state} data-testid="save-status">
	{#if state === 'saving'}
		{t.settings.saving}
	{:else if state === 'saved'}
		<Check size={14} strokeWidth={2.5} aria-hidden="true" />
		{t.settings.saved}
	{/if}
</span>

<style>
	.save-status {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		min-height: 1lh;
		color: var(--text-muted);
		font-size: var(--fs-sm);
		font-weight: var(--fw-regular);
		letter-spacing: normal;
		transition: opacity var(--dur-slow) var(--ease);
	}
	.save-status[data-state='idle'] {
		opacity: 0;
	}
</style>
