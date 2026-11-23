<script lang="ts">
	/**
	 * A single-emoji text field with a grid of suggestions (quest icon, profile avatar emoji).
	 * Native input (form field `name`), so it submits without JS; `value` is bindable. The
	 * server validates "exactly one emoji" (`isSingleEmoji`).
	 */
	type Props = {
		/** Form field name. */
		name: string;
		value: string;
		/** Id of the element that labels the field. */
		labelledby: string;
		suggestions: readonly string[];
		/** Accessible name of the suggestion group. */
		groupLabel: string;
		/** Accessible name of one suggestion button ("Use 🚀 as icon"). */
		pickLabel: (emoji: string) => string;
		placeholder?: string;
		invalid?: boolean;
		/** Id of a hint/error text describing the field. */
		describedby?: string;
	};
	let {
		name,
		value = $bindable(),
		labelledby,
		suggestions,
		groupLabel,
		pickLabel,
		placeholder = '',
		invalid = false,
		describedby
	}: Props = $props();
</script>

<div class="emoji-picker">
	<input
		class="emoji-input"
		{name}
		type="text"
		bind:value
		{placeholder}
		aria-labelledby={labelledby}
		aria-describedby={describedby}
		aria-invalid={invalid ? 'true' : undefined}
		autocomplete="off"
	/>
	<div class="emoji-grid" role="group" aria-label={groupLabel}>
		{#each suggestions as emoji (emoji)}
			<button
				type="button"
				class="emoji-pick"
				class:on={value === emoji}
				aria-label={pickLabel(emoji)}
				onclick={() => (value = emoji)}
			>
				{emoji}
			</button>
		{/each}
	</div>
</div>

<style>
	.emoji-picker {
		display: grid;
		grid-template-columns: 64px minmax(0, 1fr);
		gap: var(--space-2);
		align-items: start;
	}
	.emoji-input {
		width: 100%;
		padding: var(--space-2) var(--space-3);
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		color: var(--text);
		font-size: var(--fs-lg);
		text-align: center;
	}
	.emoji-input:hover {
		border-color: var(--border-strong);
	}
	.emoji-input[aria-invalid='true'] {
		border-color: var(--danger);
	}
	.emoji-grid {
		display: grid;
		/* Shrinks on narrow screens, never grows into huge tiles in wide forms. */
		grid-template-columns: repeat(8, minmax(0, var(--emoji-pick-max)));
		gap: var(--space-1);
	}
	.emoji-pick {
		display: grid;
		place-items: center;
		aspect-ratio: 1;
		padding: 0;
		background: var(--surface-2);
		border: 1px solid transparent;
		border-radius: var(--radius-sm);
		font-size: var(--fs-md);
		line-height: 1;
		transition: border-color var(--dur) var(--ease);
	}
	.emoji-pick:hover {
		border-color: var(--border-strong);
	}
	.emoji-pick.on {
		border-color: var(--control-on);
	}
</style>
