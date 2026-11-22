<script lang="ts">
	import type { Snippet } from 'svelte';
	import { tick } from 'svelte';
	import { MoreHorizontal } from '@lucide/svelte';
	import { useI18n } from '#lib/i18n/context.svelte.ts';

	let {
		label,
		trigger,
		children,
		onclose,
		anchor,
		gap = 4
	}: {
		label?: string;
		/** Custom trigger content (rendered inside the trigger button). Defaults to the ⋯ icon. */
		trigger?: Snippet;
		/** Menu content; receives a `close` callback to dismiss after acting. */
		children: Snippet<[close: () => void]>;
		/** Called whenever the menu closes (also on Escape / outside click). */
		onclose?: () => void;
		/** Place the popover against this element instead of the trigger (e.g. the phone tab bar). */
		anchor?: HTMLElement;
		/** Distance between the anchor and the popover, in px. */
		gap?: number;
	} = $props();

	const t = useI18n();
	let open = $state(false);
	let triggerEl: HTMLButtonElement | undefined = $state();
	let pop: HTMLDivElement | undefined = $state();

	/**
	 * Viewport position of the popover. It is `position: fixed` so it escapes scrolling /
	 * clipping ancestors (plan board columns, the horizontally scrolling board): right-aligned
	 * under the trigger (or `anchor`), shifted inside the viewport, flipped above when it doesn't
	 * fit below and there's more room above (a trigger in the phone's bottom tab bar opens
	 * upwards). It never runs past the viewport: a long menu (many quests in the picker) is capped
	 * at the room on its side and scrolls inside — otherwise its lower items could only be
	 * reached by scrolling the page, which moves the trigger and with it the menu.
	 */
	let pos = $state<{ top: number; left: number; maxHeight: number } | null>(null);
	const EDGE = 8;
	function place() {
		if (!triggerEl || !pop) return;
		const t = (anchor ?? triggerEl).getBoundingClientRect();
		const w = pop.offsetWidth;
		// Full content height (+ borders), even while a previous `max-height` clips it.
		const h = pop.scrollHeight + (pop.offsetHeight - pop.clientHeight);
		let left = t.right - w;
		if (left < EDGE) left = t.left;
		left = Math.max(EDGE, Math.min(left, window.innerWidth - w - EDGE));
		const below = window.innerHeight - EDGE - (t.bottom + gap);
		const above = t.top - gap - EDGE;
		if (h <= below || below >= above) {
			pos = { top: t.bottom + gap, left, maxHeight: Math.max(0, below) };
		} else {
			pos = { top: t.top - gap - Math.min(h, above), left, maxHeight: above };
		}
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

	/**
	 * The popover lives in `<body>` while open: `position: fixed` alone doesn't escape an
	 * ancestor's stacking context (e.g. the dimmed past-day plan columns use `opacity`), so
	 * the next column painted over it. Inside an open modal dialog (everything outside it is
	 * inert, and the dialog sits in the top layer) it moves into the dialog instead and is
	 * shown as a popover — its own top-layer entry, so neither the sheet's transform nor its
	 * `overflow` clips or shifts it.
	 */
	function toBody(node: HTMLElement) {
		const dialog = triggerEl?.closest<HTMLDialogElement>('dialog[open]');
		if (dialog && typeof node.showPopover === 'function') {
			node.popover = 'manual';
			dialog.appendChild(node);
			node.showPopover();
		} else {
			document.body.appendChild(node);
		}
		return () => node.remove();
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
		aria-label={label ?? t.menu.open}
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
			{@attach toBody}
			style:top={pos ? `${pos.top}px` : undefined}
			style:left={pos ? `${pos.left}px` : undefined}
			style:max-height={pos ? `${pos.maxHeight}px` : undefined}
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
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: var(--space-1);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-pop);
	}
	/* Shown as a popover (inside a dialog): undo the UA popover box, keep our placement. */
	.pop:global([popover]) {
		right: auto;
		bottom: auto;
		margin: 0;
		color: inherit;
	}
</style>
