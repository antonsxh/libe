<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * One row of a `GroupedList`: a label on the left and its value/control on the right
	 * (`stacked`: the control below the label, for wide controls on narrow screens). Without a
	 * label the content fills the row — e.g. a text field whose placeholder says what it is
	 * (give it an `aria-label`). Text inputs inside get the borderless row look.
	 */
	type Props = {
		label?: string;
		/** `for` of the label (a text field's id). */
		for?: string;
		/** Id of the label, to name a radio group in the row (`aria-labelledby`). */
		labelId?: string;
		stacked?: boolean;
		children?: Snippet;
	};
	let { label, for: htmlFor, labelId, stacked = false, children }: Props = $props();
</script>

<div class="row" class:stacked class:bare={!label}>
	{#if label}
		{#if htmlFor}
			<label class="row-label" for={htmlFor} id={labelId}>{label}</label>
		{:else}
			<span class="row-label" id={labelId}>{label}</span>
		{/if}
	{/if}
	{#if children}<div class="value">{@render children()}</div>{/if}
</div>

<style>
	.row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		min-height: var(--grouped-row-h);
		padding: var(--space-2) var(--grouped-inset);
	}
	.stacked {
		flex-direction: column;
		align-items: stretch;
		gap: var(--space-2);
		padding-block: var(--space-3);
	}
	.row-label {
		flex: none;
		color: var(--text);
	}
	.value {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		min-width: 0;
		color: var(--text-muted);
	}
	.bare .value,
	.stacked .value {
		flex: 1;
		justify-content: flex-start;
	}
	/* Text fields take the row's look: no box, the row is the field. */
	.value :global(input:is([type='text'], :not([type]))) {
		width: 100%;
		min-width: 0;
		min-height: calc(var(--grouped-row-h) - 2 * var(--space-2));
		padding: 0;
		border: 0;
		border-radius: 0;
		background: transparent;
		color: var(--text);
	}
	.value :global(input::placeholder) {
		color: var(--text-faint);
	}
	.value :global(input:is([type='text'], :not([type])):focus-visible) {
		box-shadow: none;
	}
	/* The focused text field marks its whole row (the field itself has no box). */
	.row:has(:global(input:is([type='text'], :not([type])):focus-visible)) {
		box-shadow: inset 0 0 0 2px var(--focus-ring);
	}
	:not(.bare, .stacked) > .value :global(input) {
		text-align: right;
	}
</style>
