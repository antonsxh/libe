<script lang="ts">
	import { tick, type Snippet } from 'svelte';
	import { X } from '@lucide/svelte';
	import Button from '#lib/components/Button.svelte';
	import { useI18n } from '#lib/i18n/context.svelte.ts';
	import { isPhoneViewport, longestCssTime } from '#lib/motion.ts';
	import { releaseVelocity, sheetOffset, shouldDismissSheet, type Sample } from '#lib/sheet.ts';

	type Props = {
		open?: boolean;
		title: string;
		children?: Snippet;
		/**
		 * Called once the dialog has fully closed (after its exit animation). Wrappers that
		 * unmount the dialog when it closes use this instead of watching `open`, so the
		 * animation isn't cut off.
		 */
		onclosed?: () => void;
	};

	let { open = $bindable(false), title, children, onclosed }: Props = $props();

	const t = useI18n();
	let el: HTMLDialogElement | undefined = $state();
	/** The exit animation is playing (the native dialog is still open). */
	let closing = $state(false);

	/*
	 * Every way of closing (✕, Esc, backdrop, a drag, the parent) just sets `open = false`;
	 * this effect plays the exit animation and then closes the native dialog.
	 */
	$effect(() => {
		if (!el) return;
		if (open && !el.open) el.showModal();
		else if (!open && el.open) void animateClose();
	});

	async function animateClose() {
		if (!el || closing) return;
		closing = true;
		await tick();
		const dialog = el;
		const ms = longestCssTime(getComputedStyle(dialog).animationDuration);
		if (ms > 0) {
			await new Promise<void>((resolve) => {
				const timer = setTimeout(done, ms + 50);
				function done() {
					clearTimeout(timer);
					dialog.removeEventListener('animationend', onEnd);
					resolve();
				}
				function onEnd(e: AnimationEvent) {
					if (e.target === dialog) done();
				}
				dialog.addEventListener('animationend', onEnd);
			});
		}
		closing = false;
		dragY = 0;
		// Reopened while the animation played → stay open.
		if (!open && dialog.open) dialog.close();
	}

	function onclose() {
		open = false;
		closing = false;
		dragY = 0;
		onclosed?.();
	}

	/* ── Phones: drag the handle/header down to dismiss ─────────────────────── */

	let dragY = $state(0);
	let dragging = $state(false);
	let drag: { id: number; y: number; samples: Sample[] } | null = null;

	function onpointerdown(e: PointerEvent) {
		if (!el || closing || !e.isPrimary || e.button !== 0 || !isPhoneViewport()) return;
		if ((e.target as Element).closest('button, a, input, select, textarea')) return;
		drag = { id: e.pointerId, y: e.clientY, samples: [{ t: e.timeStamp, y: e.clientY }] };
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		dragging = true;
	}
	function onpointermove(e: PointerEvent) {
		if (!drag || e.pointerId !== drag.id) return;
		dragY = sheetOffset(e.clientY - drag.y);
		drag.samples.push({ t: e.timeStamp, y: e.clientY });
		if (drag.samples.length > 16) drag.samples.shift();
	}
	function onpointerup(e: PointerEvent) {
		if (!drag || e.pointerId !== drag.id) return;
		drag.samples.push({ t: e.timeStamp, y: e.clientY });
		const release = {
			dy: e.clientY - drag.y,
			velocity: releaseVelocity(drag.samples),
			height: el?.getBoundingClientRect().height ?? 0
		};
		drag = null;
		dragging = false;
		if (shouldDismissSheet(release)) open = false;
		else dragY = 0; // springs back (CSS transition)
	}
	function onpointercancel() {
		drag = null;
		dragging = false;
		dragY = 0;
	}
	/** Pointer listeners on the header (an attachment: the header is not a control itself). */
	function dragHandle(node: HTMLElement) {
		node.addEventListener('pointerdown', onpointerdown);
		node.addEventListener('pointermove', onpointermove);
		node.addEventListener('pointerup', onpointerup);
		node.addEventListener('pointercancel', onpointercancel);
		return () => {
			node.removeEventListener('pointerdown', onpointerdown);
			node.removeEventListener('pointermove', onpointermove);
			node.removeEventListener('pointerup', onpointerup);
			node.removeEventListener('pointercancel', onpointercancel);
		};
	}

	/*
	 * iOS keeps the layout viewport when the keyboard opens: anchor the sheet to the bottom of
	 * the *visible* viewport and cap its height to it (like the command palette's `--vvh`).
	 */
	let viewportH = $state<number | null>(null);
	let keyboardH = $state(0);
	$effect(() => {
		const vv = window.visualViewport;
		if (!open || !vv) return;
		const measure = () => {
			viewportH = vv.height;
			keyboardH = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
		};
		measure();
		vv.addEventListener('resize', measure);
		vv.addEventListener('scroll', measure);
		return () => {
			vv.removeEventListener('resize', measure);
			vv.removeEventListener('scroll', measure);
		};
	});
</script>

<dialog
	bind:this={el}
	class="dialog"
	class:closing
	class:dragging
	aria-label={title}
	style:--drag={dragY ? `${dragY}px` : undefined}
	style:--vvh={viewportH ? `${viewportH}px` : undefined}
	style:--kb={keyboardH ? `${keyboardH}px` : undefined}
	{onclose}
	oncancel={(e) => {
		// Esc: animate out like every other way of closing.
		e.preventDefault();
		open = false;
	}}
	onclick={(e) => {
		// Backdrop clicks land on the dialog element itself.
		if (e.target === el) open = false;
	}}
>
	<!-- Phones: the header is the sheet's drag handle (pointer events, not scroll). -->
	<header class="bar" {@attach dragHandle}>
		<span class="handle" aria-hidden="true"></span>
		<h2>{title}</h2>
		<Button
			variant="ghost"
			size="sm"
			icon
			aria-label={t.dialog.close}
			onclick={() => (open = false)}
		>
			<X size={16} />
		</Button>
	</header>
	<div class="body">
		{@render children?.()}
	</div>
</dialog>

<style>
	dialog.dialog {
		--sheet-pad: var(--space-6);
		width: min(540px, calc(100vw - var(--space-8)));
		max-height: calc(100dvh - var(--space-16));
		padding: 0;
		overflow: hidden;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		color: var(--text);
		box-shadow: var(--shadow-pop);
	}
	dialog.dialog[open] {
		display: flex;
		flex-direction: column;
		animation: dialog-in var(--dur) var(--ease-out);
	}
	dialog.dialog::backdrop {
		background: var(--backdrop);
		backdrop-filter: blur(2px);
	}
	dialog.dialog[open]::backdrop {
		animation: fade-in var(--dur) var(--ease-out);
	}
	dialog.dialog.closing {
		animation: dialog-out var(--dur) var(--ease-in) forwards;
	}
	dialog.dialog.closing::backdrop {
		animation: fade-out var(--dur) var(--ease-in) forwards;
	}
	@keyframes dialog-in {
		from {
			opacity: 0;
			scale: 0.98;
		}
	}
	@keyframes dialog-out {
		to {
			opacity: 0;
			scale: 0.98;
		}
	}

	.bar {
		flex: none;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-4);
		padding: var(--sheet-pad) var(--sheet-pad) 0;
		margin-bottom: var(--space-5);
	}
	.bar h2 {
		font-size: var(--fs-lg);
		font-weight: var(--fw-semibold);
	}
	.handle {
		display: none;
	}
	.body {
		flex: 1 1 auto;
		min-height: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: 0 var(--sheet-pad) var(--sheet-pad);
	}

	/*
	 * Phones: a bottom sheet — full width, anchored to the bottom of the visible viewport
	 * (above the iOS keyboard), slides up/down, dragged down by its header to dismiss. The
	 * body scrolls; dialogs mark their button row `.dialog-actions`, which sticks to the
	 * bottom with a full-width primary button (thumb zone).
	 */
	@media (max-width: 720px) {
		:global(html:has(dialog.dialog[open])) {
			overflow: hidden;
		}
		dialog.dialog {
			--sheet-pad: var(--space-5);
			--sheet-pad-bottom: calc(var(--space-5) + var(--safe-bottom));
			inset: auto 0 var(--kb, 0px) 0;
			width: 100%;
			max-width: 100%;
			margin: 0;
			max-height: calc(var(--vvh, 100dvh) - var(--safe-top) - var(--sheet-gap-top));
			border-width: 1px 0 0;
			border-radius: var(--radius-xl) var(--radius-xl) 0 0;
			box-shadow: var(--shadow-pop);
			transform: translateY(var(--drag, 0px));
			transition: transform var(--dur-sheet) var(--ease-out);
		}
		dialog.dialog.dragging {
			transition: none;
		}
		dialog.dialog[open] {
			animation: sheet-in var(--dur-sheet) var(--ease-out);
		}
		dialog.dialog[open]::backdrop {
			animation: fade-in var(--dur-sheet) var(--ease-out);
		}
		dialog.dialog.closing {
			animation: sheet-out var(--dur-sheet-out) var(--ease-in) forwards;
		}
		dialog.dialog.closing::backdrop {
			animation: fade-out var(--dur-sheet-out) var(--ease-in) forwards;
		}
		.bar {
			position: relative;
			padding: var(--space-6) var(--sheet-pad) var(--space-2);
			margin-bottom: var(--space-3);
			touch-action: none;
			cursor: grab;
			-webkit-user-select: none;
			user-select: none;
		}
		.handle {
			display: block;
			position: absolute;
			top: var(--space-2);
			left: 50%;
			width: var(--sheet-handle-w);
			height: var(--sheet-handle-h);
			translate: -50% 0;
			border-radius: var(--radius-pill);
			background: var(--border-strong);
		}
		.body {
			padding: 0 var(--sheet-pad) var(--sheet-pad-bottom);
		}
		.body :global(.dialog-actions) {
			position: sticky;
			bottom: calc(-1 * var(--sheet-pad-bottom));
			z-index: 1;
			display: flex;
			flex-wrap: nowrap;
			align-items: center;
			gap: var(--space-2);
			margin: var(--space-5) calc(-1 * var(--sheet-pad)) calc(-1 * var(--sheet-pad-bottom));
			padding: var(--space-3) var(--sheet-pad) var(--sheet-pad-bottom);
			background: var(--surface);
			border-top: 1px solid var(--border);
		}
		.body :global(.dialog-actions .spacer) {
			display: none;
		}
		.body :global(.dialog-actions .btn) {
			flex: none;
		}
		.body :global(.dialog-actions .btn.primary) {
			flex: 1 1 auto;
		}
	}
	@keyframes sheet-in {
		from {
			transform: translateY(100%);
		}
	}
	@keyframes sheet-out {
		from {
			transform: translateY(var(--drag, 0px));
		}
		to {
			transform: translateY(100%);
		}
	}
</style>
