<script lang="ts">
	/**
	 * Segmented control (iOS / macOS): a few mutually exclusive choices side by side, the
	 * selected one on a raised thumb. Native radios (form field `name`), so it submits without
	 * JS, arrow keys move the selection and screen readers announce a radio group named by
	 * `label` (or the element `labelledby` points at). `value` is bindable.
	 */
	type Option = { value: string; label: string };
	type Props = {
		name: string;
		options: Option[];
		value?: string;
		/** Accessible name of the group … */
		label?: string;
		/** … or the id of the element that names it. */
		labelledby?: string;
	};
	let { name, options, value = $bindable(), label, labelledby }: Props = $props();
</script>

<div
	class="segmented"
	role="radiogroup"
	aria-label={labelledby ? undefined : label}
	aria-labelledby={labelledby}
	style:--n={options.length}
>
	{#each options as option (option.value)}
		<label class="segment hit-target">
			<input type="radio" {name} value={option.value} bind:group={value} />
			<span class="thumb">{option.label}</span>
		</label>
	{/each}
</div>

<style>
	.segmented {
		display: inline-grid;
		grid-template-columns: repeat(var(--n), minmax(0, 1fr));
		gap: 2px;
		padding: 2px;
		border-radius: calc(var(--radius-md) + 1px);
		background: var(--segmented-bg);
	}
	.segment {
		position: relative;
		display: flex;
		cursor: pointer;
	}
	.segment input {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		margin: 0;
		opacity: 0;
		cursor: pointer;
		z-index: 1; /* above the touch hit area (`.hit-target::after`) that extends it */
	}
	.thumb {
		display: grid;
		place-items: center;
		width: 100%;
		min-height: calc(var(--segmented-h) - 4px);
		padding: 0 var(--space-3);
		border-radius: calc(var(--radius-md) - 1px);
		font-size: var(--fs-sm);
		color: var(--text-2);
		white-space: nowrap;
		transition:
			background var(--dur) var(--ease),
			color var(--dur) var(--ease),
			box-shadow var(--dur) var(--ease);
	}
	@media (hover: hover) {
		.segment:hover .thumb {
			color: var(--text);
		}
	}
	.segment input:checked + .thumb {
		background: var(--segmented-thumb);
		box-shadow: var(--segmented-shadow);
		color: var(--text);
		font-weight: var(--fw-semibold);
	}
	.segment input:focus-visible + .thumb {
		box-shadow: var(--ring);
	}
</style>
