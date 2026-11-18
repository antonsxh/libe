<script lang="ts">
	import type { Snippet } from 'svelte';
	import { tick } from 'svelte';
	import { MoreHorizontal } from '@lucide/svelte';

	let {
		label = 'Open menu',
		children,
		onclose
	}: {
		label?: string;
		/** Menu content; receives a `close` callback to dismiss after acting. */
		children: Snippet<[close: () => void]>;
		/** Called whenever the menu closes (also on Escape / outside click). */
		onclose?: () => void;
	} = $props();

	let open = $state(false);
	let trigger: HTMLButtonElement | undefined = $state();
	let pop: HTMLDivElement | undefined = $state();

	function close() {
		if (!open) return;
		open = false;
		onclose?.();
		trigger?.focus();
	}

	function toggle() {
		if (open) {
			close();
		} else {
			open = true;
			tick().then(() => {
				pop?.querySelector<HTMLElement>('button:not([disabled]), a, input')?.focus();
			});
		}
	}

	$effect(() => {
		if (!open) return;
		function onKey(e: KeyboardEvent) {
			if (e.key === 'Escape') {
				e.preventDefault();
				close();
			}
		}
		function onClick(e: MouseEvent) {
			const target = e.target as Node;
			if (!pop?.contains(target) && !trigger?.contains(target)) close();
		}
		// Capture phase so an outside click closes before the clicked element's own handler runs.
		document.addEventListener('keydown', onKey);
		document.addEventListener('click', onClick, true);
		return () => {
			document.removeEventListener('keydown', onKey);
			document.removeEventListener('click', onClick, true);
		};
	});
</script>

<span class="menu">
	<button
		type="button"
		class="trigger"
		bind:this={trigger}
		aria-label={label}
		aria-haspopup="menu"
		aria-expanded={open}
		onclick={toggle}
	>
		<MoreHorizontal size={16} />
	</button>
	{#if open}
		<div class="pop" role="menu" bind:this={pop}>
			{@render children(close)}
		</div>
	{/if}
</span>

<style>
	.menu {
		position: relative;
		display: inline-flex;
	}

	.trigger {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border: none;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text-faint);
		transition:
			color var(--dur) var(--ease),
			background var(--dur) var(--ease);
	}
	.trigger:hover {
		color: var(--text);
		background: var(--surface-hover);
	}
	.trigger[aria-expanded='true'] {
		color: var(--text);
		background: var(--surface-2);
	}

	.pop {
		position: absolute;
		top: calc(100% + var(--space-1));
		right: 0;
		z-index: 40;
		min-width: 190px;
		padding: var(--space-1);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-pop);
	}
</style>
