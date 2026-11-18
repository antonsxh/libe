<script lang="ts">
	import type { Snippet } from 'svelte';
	import { X } from '@lucide/svelte';
	import Button from '#lib/components/Button.svelte';

	let {
		open = $bindable(false),
		title,
		children
	}: {
		open?: boolean;
		title: string;
		children?: Snippet;
	} = $props();

	let el: HTMLDialogElement | undefined = $state();

	// Keep the native dialog's open state in sync with the `open` prop.
	$effect(() => {
		if (!el) return;
		if (open && !el.open) el.showModal();
		else if (!open && el.open) el.close();
	});
</script>

<dialog
	bind:this={el}
	class="dialog"
	aria-label={title}
	onclose={() => (open = false)}
	onclick={(e) => {
		// Backdrop clicks land on the dialog element itself.
		if (e.target === el) el?.close();
	}}
>
	<header class="bar">
		<h2>{title}</h2>
		<Button variant="ghost" size="sm" icon aria-label="Close dialog" onclick={() => el?.close()}>
			<X size={16} />
		</Button>
	</header>
	<div class="body">
		{@render children?.()}
	</div>
</dialog>

<style>
	dialog.dialog {
		width: min(540px, calc(100vw - var(--space-8)));
		max-height: calc(100vh - var(--space-16));
		overflow-y: auto;
		padding: var(--space-6);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		color: var(--text);
		box-shadow: var(--shadow-pop);
	}
	dialog.dialog::backdrop {
		background: rgb(0 0 0 / 0.6);
		backdrop-filter: blur(2px);
	}

	.bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-4);
		margin-bottom: var(--space-5);
	}
	.bar h2 {
		font-size: var(--fs-lg);
		font-weight: var(--fw-semibold);
	}
</style>
