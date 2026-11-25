<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Check } from '@lucide/svelte';

	/**
	 * Inset grouped list (iOS Settings / macOS System Settings): rounded rows on
	 * `--grouped-bg`, hairline separators inset from the left, an optional header above and
	 * footer below.
	 *
	 * - **Rows**: pass `children` — `GroupedRow`s (or any elements; each child is one row).
	 * - **Choice**: pass `options` + `name` (+ bindable `value`) — a `<fieldset>` of native
	 *   radios, one row each, the selected row marked with a checkmark. It submits without JS,
	 *   arrow keys move the selection and screen readers announce a radio group named by the
	 *   header (or `label`).
	 */
	type Option = { value: string; label: string };
	type Props = {
		header?: string;
		footer?: string;
		/** Accessible name when there is no visible header. */
		label?: string;
		options?: Option[];
		/** Form field name of the choice. */
		name?: string;
		value?: string;
		children?: Snippet;
	};
	let { header, footer, label, options, name, value = $bindable(), children }: Props = $props();
	const id = $props.id();
	const footId = $derived(footer ? `${id}-foot` : undefined);
</script>

{#if options}
	<fieldset class="grouped" aria-describedby={footId}>
		<legend class={header ? 'head' : 'sr-only'}>{header ?? label}</legend>
		<div class="rows">
			{#each options as option (option.value)}
				<label class="choice">
					<input type="radio" {name} value={option.value} bind:group={value} />
					<span class="text">{option.label}</span>
					<span class="check" aria-hidden="true"><Check size={20} strokeWidth={2.5} /></span>
				</label>
			{/each}
		</div>
		{#if footer}<p class="foot" id={footId}>{footer}</p>{/if}
	</fieldset>
{:else}
	<div
		class="grouped"
		role="group"
		aria-labelledby={header ? `${id}-head` : undefined}
		aria-label={header ? undefined : label}
		aria-describedby={footId}
	>
		{#if header}<div class="head" id="{id}-head">{header}</div>{/if}
		<div class="rows">{@render children?.()}</div>
		{#if footer}<p class="foot" id={footId}>{footer}</p>{/if}
	</div>
{/if}

<style>
	.grouped {
		display: grid;
		min-width: 0;
		margin: 0;
		padding: 0;
		border: 0;
	}
	.head {
		padding: 0 var(--grouped-inset) var(--space-2);
		font-size: var(--fs-xs);
		font-weight: var(--fw-medium);
		letter-spacing: 0.02em;
		text-transform: uppercase;
		color: var(--text-muted);
	}
	legend.head {
		float: left; /* legends otherwise sit on the fieldset's edge */
		width: 100%;
	}
	.rows {
		clear: both;
		overflow: hidden;
		border-radius: var(--grouped-radius);
		background: var(--grouped-bg);
	}
	.rows > :global(*) {
		position: relative;
	}
	/* Hairline between rows, inset from the left like iOS. */
	.rows > :global(* + *)::before {
		content: '';
		position: absolute;
		top: 0;
		left: var(--grouped-inset);
		right: 0;
		height: 1px;
		background: var(--grouped-separator);
		pointer-events: none;
	}
	.foot {
		padding: var(--space-2) var(--grouped-inset) 0;
		font-size: var(--fs-xs);
		color: var(--text-muted);
	}

	/* ── Choice rows ── */
	.choice {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		min-height: var(--grouped-row-h);
		padding: var(--space-2) var(--grouped-inset);
		cursor: pointer;
		transition: background var(--dur) var(--ease);
	}
	@media (hover: hover) {
		.choice:hover {
			background: var(--surface-hover);
		}
	}
	.choice:active {
		background: var(--surface-2);
	}
	.choice input {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: 0;
		opacity: 0;
		pointer-events: none;
	}
	.choice:has(input:focus-visible) {
		box-shadow: inset 0 0 0 2px var(--focus-ring);
	}
	.text {
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.check {
		display: inline-flex;
		flex: none;
		color: var(--control-on);
		opacity: 0;
		scale: 0.6;
		transition:
			opacity var(--dur) var(--ease),
			scale var(--dur-pop) var(--ease-spring);
	}
	.choice input:checked ~ .check {
		opacity: 1;
		scale: 1;
	}
</style>
