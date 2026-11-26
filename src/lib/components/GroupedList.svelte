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
	 * - **Checklist**: `options` + `name` + `multiple` (+ bindable `values`) — native checkboxes,
	 *   every checked row ticked (iOS's multiple choice, e.g. rest days).
	 *
	 * An option may carry a muted `detail` before the tick and a `lang` for its label.
	 * `optionRow` renders a row's content in place of its plain label (e.g. a title over a
	 * detail line, the Focus setup's tasks); the checkmark stays.
	 */
	type Option = { value: string; label: string; detail?: string; lang?: string };
	type Props = {
		header?: string;
		footer?: string;
		/** Accessible name when there is no visible header. */
		label?: string;
		options?: Option[];
		/** Form field name of the choice. */
		name?: string;
		value?: string;
		/** Checklist instead of a single choice. */
		multiple?: boolean;
		values?: string[];
		/** Extra description (e.g. an error) besides the footer. */
		describedby?: string;
		/** Footer as a snippet (rich text, a live status) instead of `footer`. */
		foot?: Snippet;
		/** Custom row content for choice/checklist options (the checkmark stays). */
		optionRow?: Snippet<[Option]>;
		children?: Snippet;
	};
	let {
		header,
		footer,
		label,
		options,
		name,
		value = $bindable(),
		multiple = false,
		values = $bindable([]),
		describedby,
		foot,
		optionRow,
		children
	}: Props = $props();
	const id = $props.id();
	const footId = $derived(footer || foot ? `${id}-foot` : undefined);
	const described = $derived([footId, describedby].filter(Boolean).join(' ') || undefined);
</script>

{#if options}
	<fieldset class="grouped" aria-describedby={described}>
		<legend class={header ? 'head' : 'sr-only'}>{header ?? label}</legend>
		<div class="rows">
			{#each options as option (option.value)}
				<label class="choice">
					{#if multiple}
						<input type="checkbox" {name} value={option.value} bind:group={values} />
					{:else}
						<input type="radio" {name} value={option.value} bind:group={value} />
					{/if}
					{#if optionRow}
						<span class="text">{@render optionRow(option)}</span>
					{:else}
						<span class="text" lang={option.lang}>{option.label}</span>
						{#if option.detail}<span class="detail">{option.detail}</span>{/if}
					{/if}
					<span class="check" aria-hidden="true"><Check size={20} strokeWidth={2.5} /></span>
				</label>
			{/each}
			{@render children?.()}
		</div>
		{@render footer_()}
	</fieldset>
{:else}
	<div
		class="grouped"
		role="group"
		aria-labelledby={header ? `${id}-head` : undefined}
		aria-label={header ? undefined : label}
		aria-describedby={described}
	>
		{#if header}<div class="head" id="{id}-head">{header}</div>{/if}
		<div class="rows">{@render children?.()}</div>
		{@render footer_()}
	</div>
{/if}

{#snippet footer_()}
	{#if foot}
		<div class="foot" id={footId}>{@render foot()}</div>
	{:else if footer}
		<p class="foot" id={footId}>{footer}</p>
	{/if}
{/snippet}

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
		font-size: var(--fs-label);
		font-weight: var(--fw-semibold);
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
		flex: 1;
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.detail {
		flex: none;
		color: var(--text-muted);
		font-size: var(--fs-sm);
	}
	.check {
		display: inline-flex;
		flex: none;
		color: var(--accent-text); /* an icon in the accent colour */
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
