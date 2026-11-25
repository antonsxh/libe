<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';

	type Props = HTMLButtonAttributes & {
		/** primary = accent CTA, secondary = surface + border, ghost = text only */
		variant?: 'primary' | 'secondary' | 'ghost';
		size?: 'sm' | 'md';
		/** Square button for a single icon. Pass an `aria-label`. */
		icon?: boolean;
		children: Snippet;
	};

	let {
		variant = 'secondary',
		size = 'md',
		icon = false,
		type = 'button',
		children,
		...rest
	}: Props = $props();
</script>

<button {type} class="btn {variant} {size}" class:icon {...rest}>
	{@render children()}
</button>

<style>
	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		border: 1px solid transparent;
		border-radius: var(--radius-md);
		font-weight: var(--fw-medium);
		white-space: nowrap;
		transition:
			background var(--dur) var(--ease),
			border-color var(--dur) var(--ease),
			color var(--dur) var(--ease),
			scale var(--dur-press) var(--ease-out),
			filter var(--dur-press) var(--ease-out);
	}

	.md {
		height: 44px;
		padding: 0 var(--space-5);
		font-size: var(--fs-md);
	}
	.sm {
		height: 32px;
		padding: 0 var(--space-3);
		font-size: var(--fs-sm);
	}
	.icon.md {
		width: 44px;
		padding: 0;
	}
	.icon.sm {
		width: 32px;
		padding: 0;
	}

	.primary {
		background: var(--accent);
		color: var(--accent-ink);
	}
	.primary:hover:not(:disabled) {
		background: var(--accent-hover);
	}

	.secondary {
		background: var(--surface);
		border-color: var(--border);
		color: var(--text);
	}
	.secondary:hover:not(:disabled) {
		background: var(--surface-hover);
		border-color: var(--border-strong);
	}

	.ghost {
		background: transparent;
		color: var(--text-muted);
	}
	.ghost:hover:not(:disabled) {
		color: var(--text);
		background: var(--surface-hover);
	}

	.btn:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
</style>
