<script lang="ts">
	import type { Component } from 'svelte';

	/**
	 * "One symbol, one sentence, one action": what a page shows while it has nothing to show,
	 * instead of its structure full of zeros. The action is a link (`href`) or a button
	 * (`onaction`); leave both out when there is nothing sensible to do (e.g. a future week).
	 */
	type Props = {
		/** A lucide icon component, drawn large in the accent text colour. */
		icon: Component<{ size?: number; strokeWidth?: number; 'aria-hidden'?: boolean | 'true' }>;
		title: string;
		text: string;
		/** Label of the one action. */
		action?: string;
		/** Optional icon before the action label. */
		actionIcon?: Component<{ size?: number; 'aria-hidden'?: boolean | 'true' }>;
		href?: string;
		onaction?: () => void;
		/** Test hook / page-specific styling. */
		testid?: string;
	};
	let {
		icon: Icon,
		title,
		text,
		action,
		actionIcon: ActionIcon,
		href,
		onaction,
		testid
	}: Props = $props();
	const id = $props.id();
</script>

<section class="empty" aria-labelledby="{id}-title" data-testid={testid}>
	<span class="symbol"><Icon size={40} strokeWidth={1.5} aria-hidden="true" /></span>
	<h2 class="title" id="{id}-title">{title}</h2>
	<p class="text">{text}</p>
	{#if action && href}
		<a class="action" {href}>
			{#if ActionIcon}<ActionIcon size={16} aria-hidden="true" />{/if}
			{action}
		</a>
	{:else if action && onaction}
		<button class="action" type="button" onclick={onaction}>
			{#if ActionIcon}<ActionIcon size={16} aria-hidden="true" />{/if}
			{action}
		</button>
	{/if}
</section>

<style>
	.empty {
		display: grid;
		justify-items: center;
		align-content: center;
		gap: var(--space-3);
		padding: var(--space-16) var(--space-4);
		text-align: center;
	}
	.symbol {
		display: grid;
		place-items: center;
		width: var(--symbol-lg);
		height: var(--symbol-lg);
		color: var(--accent-text);
	}
	.title {
		font-size: var(--fs-xl);
		font-weight: var(--fw-bold);
		letter-spacing: -0.02em;
		line-height: 1.2;
	}
	.text {
		max-width: var(--empty-text-max);
		text-wrap: balance;
		color: var(--text-muted);
		font-size: var(--fs-md);
	}
	/* The page's one primary action (like a primary `Button`, but it can be a link). */
	.action {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		min-width: var(--empty-action-min-w);
		height: 44px;
		margin-top: var(--space-2);
		padding: 0 var(--space-5);
		border: 1px solid transparent;
		border-radius: var(--radius-md);
		background: var(--accent);
		color: var(--accent-ink);
		font-size: var(--fs-md);
		font-weight: var(--fw-medium);
		white-space: nowrap;
		transition:
			background var(--dur) var(--ease),
			scale var(--dur-press) var(--ease-out),
			filter var(--dur-press) var(--ease-out);
	}
	@media (hover: hover) {
		.action:hover {
			background: var(--accent-hover);
		}
	}
	@media (max-width: 720px) {
		.empty {
			padding-block: var(--space-12);
		}
	}
</style>
