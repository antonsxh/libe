<script lang="ts">
	import type { Snippet } from 'svelte';
	import { tick } from 'svelte';
	import { MoreHorizontal } from '@lucide/svelte';

	let {
		label = 'Open menu',
		trigger,
		children,
		onclose
	}: {
		label?: string;
		/** Custom trigger content (rendered inside the trigger button). Defaults to the ⋯ icon. */
		trigger?: Snippet;
		/** Menu content; receives a `close` callback to dismiss after acting. */
		children: Snippet<[close: () => void]>;
		/** Called whenever the menu closes (also on Escape / outside click). */
		onclose?: () => void;
	} = $props();

	let open = $state(false);
	let triggerEl: HTMLButtonElement | undefined = $state();
	let pop: HTMLDivElement | undefined = $state();

	/**
	 * Viewport position of the popover. It is `position: fixed` so it escapes scrolling /
	 * clipping ancestors (plan board columns, the horizontally scrolling board): right-aligned
	 * under the trigger, shifted inside the viewport, flipped above when there's no room below.
	 */
	let pos = $state<{ top: number; left: number } | null>(null);
	const EDGE = 8;
	const GAP = 4;
	function place() {
		if (!triggerEl || !pop) return;
		const t = triggerEl.getBoundingClientRect();
		const w = pop.offsetWidth;
		const h = pop.offsetHeight;
		let left = t.right - w;
		if (left < EDGE) left = t.left;
		left = Math.max(EDGE, Math.min(left, window.innerWidth - w - EDGE));
		let top = t.bottom + GAP;
		if (top + h > window.innerHeight - EDGE && t.top - GAP - h >= EDGE) top = t.top - GAP - h;
		pos = { top, left };
	}

	function close() {
		if (!open) return;
		open = false;
		pos = null;
		onclose?.();
		triggerEl?.focus();
	}

	function toggle() {
		if (open) {
			close();
		} else {
			open = true;
			tick().then(() => {
				place();
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
			if (!pop?.contains(target) && !triggerEl?.contains(target)) close();
		}
		// Capture phase so an outside click closes before the clicked element's own handler runs.
		document.addEventListener('keydown', onKey);
		document.addEventListener('click', onClick, true);
		// Any scrolling ancestor moves the trigger: follow it.
		document.addEventListener('scroll', place, { capture: true, passive: true });
		window.addEventListener('resize', place);
		return () => {
			document.removeEventListener('keydown', onKey);
			document.removeEventListener('click', onClick, true);
			document.removeEventListener('scroll', place, { capture: true });
			window.removeEventListener('resize', place);
		};
	});
</script>

<span class="menu">
	<button
		type="button"
		class={trigger ? 'trigger-custom' : 'trigger'}
		bind:this={triggerEl}
		aria-label={label}
		aria-haspopup="menu"
		aria-expanded={open}
		onclick={toggle}
	>
		{#if trigger}{@render trigger()}{:else}{@render TriggerIcon()}{/if}
	</button>
	{#if open}
		<div
			class="pop"
			role="menu"
			bind:this={pop}
			style:top={pos ? `${pos.top}px` : undefined}
			style:left={pos ? `${pos.left}px` : undefined}
			style:visibility={pos ? undefined : 'hidden'}
		>
			{@render children(close)}
		</div>
	{/if}
</span>

{#snippet TriggerIcon()}<MoreHorizontal size={16} />{/snippet}

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

	/* Custom (non-icon) triggers bring their own look; only reset the button chrome. */
	.trigger-custom {
		display: inline-flex;
		align-items: center;
		padding: 0;
		border: none;
		background: transparent;
		color: inherit;
	}

	.pop {
		position: fixed;
		top: 0;
		left: 0;
		z-index: 40;
		min-width: 190px;
		padding: var(--space-1);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-pop);
	}
</style>
