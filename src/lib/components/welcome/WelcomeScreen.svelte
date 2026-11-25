<script lang="ts" module>
	/** Whether a screen was shown already: only later step changes slide in, not the first paint. */
	let shown = false;
</script>

<script lang="ts">
	import { onMount, type Snippet } from 'svelte';
	import { ChevronLeft } from '@lucide/svelte';
	import { DOT_STEPS, type WelcomeStep } from '#lib/onboarding.ts';
	import { tickIn } from '#lib/motion.ts';
	import { useI18n } from '#lib/i18n/context.svelte.ts';

	/**
	 * One screen of the first-run flow, laid out like an Apple setup assistant: "‹ Back" top
	 * left, a symbol over a large bold title and one muted line, the content, then the page
	 * dots and the buttons. Phones: the primary button full-width in the thumb zone (sticky at
	 * the bottom, above the home indicator) with the secondary as plain text under it. Wider
	 * screens: one narrow centred column, buttons bottom right like a macOS sheet (secondary
	 * left of the primary).
	 *
	 * `actions` renders the buttons, primary first: `class="cta"` (primary) and `class="plain"`
	 * (secondary) — links or submit buttons of the surrounding form.
	 */
	type Props = {
		step: WelcomeStep;
		backHref?: string | null;
		title: string;
		lead?: string;
		symbol: Snippet;
		children?: Snippet;
		actions: Snippet;
	};
	let { step, backHref = null, title, lead, symbol, children, actions }: Props = $props();
	const t = useI18n();

	onMount(() => {
		shown = true;
	});
	const enter = (node: Element) => (shown ? tickIn(node) : { duration: 0 });
</script>

<div class="screen" class:intro={step === 0}>
	<div class="topbar">
		{#if backHref}
			<a class="back hit-target" href={backHref}>
				<ChevronLeft size={22} strokeWidth={2.25} aria-hidden="true" />
				{t.onboarding.back}
			</a>
		{/if}
	</div>
	<div class="column">
		<div class="body" in:enter|global>
			<div class="hero">
				<span class="symbol">{@render symbol()}</span>
				<h1 class="title">{title}</h1>
				{#if lead}<p class="lead">{lead}</p>{/if}
			</div>
			{@render children?.()}
		</div>
		<div class="footer">
			{#if step > 0}
				<div
					class="dots"
					role="img"
					aria-label={t.onboarding.progress(step, DOT_STEPS.length)}
					data-testid="welcome-progress"
				>
					{#each DOT_STEPS as dot (dot)}
						<span class="dot" class:on={dot === step}></span>
					{/each}
				</div>
			{/if}
			<div class="actions">{@render actions()}</div>
		</div>
	</div>
</div>

<style>
	.screen {
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
		padding: var(--safe-top) var(--safe-right) 0 var(--safe-left);
	}
	.topbar {
		display: flex;
		align-items: center;
		min-height: var(--hit-min);
		padding: var(--space-2) var(--space-4) 0;
	}
	.back {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		margin-left: calc(-1 * var(--space-2));
		padding: var(--space-1) var(--space-2) var(--space-1) 0;
		border-radius: var(--radius-md);
		font-size: var(--fs-md);
		color: var(--accent-text);
		text-decoration: none;
	}
	@media (hover: hover) {
		.back:hover {
			color: var(--accent-hover);
		}
	}

	.column {
		flex: 1;
		display: flex;
		flex-direction: column;
		width: min(var(--welcome-col), 100%);
		margin: 0 auto;
	}
	.body {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
		padding: var(--space-2) var(--space-4) var(--space-6);
	}
	.intro .body {
		justify-content: center;
		gap: var(--space-8);
	}

	.hero {
		display: grid;
		justify-items: center;
		gap: var(--space-3);
		text-align: center;
	}
	.symbol {
		display: inline-flex;
		color: var(--accent-text);
	}
	.symbol :global(svg) {
		width: var(--symbol-lg);
		height: var(--symbol-lg);
	}
	.title {
		font-size: var(--fs-title);
		font-weight: var(--fw-bold);
		line-height: 1.12;
		letter-spacing: -0.02em;
		text-wrap: balance;
	}
	.lead {
		max-width: 36ch;
		color: var(--text-muted);
		font-size: var(--fs-md);
		text-wrap: pretty;
	}

	/* ── Footer: phones — dots, full-width primary, plain secondary under it ── */
	.footer {
		position: sticky;
		bottom: 0;
		display: grid;
		justify-items: center;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4) calc(var(--space-4) + var(--safe-bottom));
		background: var(--bg);
	}
	.dots {
		display: flex;
		gap: var(--space-2);
	}
	.dot {
		width: var(--page-dot);
		height: var(--page-dot);
		border-radius: 50%;
		background: var(--page-dot-off);
		transition: background var(--dur) var(--ease);
	}
	.dot.on {
		background: var(--page-dot-on);
	}
	.actions {
		display: grid;
		justify-items: center;
		gap: var(--space-1);
		width: 100%;
	}
	.actions :global(:is(.cta, .plain)) {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		border: 0;
		font: inherit;
		text-decoration: none;
		cursor: pointer;
		white-space: nowrap;
		transition:
			background var(--dur) var(--ease),
			color var(--dur) var(--ease),
			scale var(--dur-press) var(--ease-out),
			filter var(--dur-press) var(--ease-out);
	}
	.actions :global(.cta) {
		width: 100%;
		height: var(--cta-h);
		border-radius: var(--radius-cta);
		background: var(--accent);
		color: var(--accent-ink);
		font-size: var(--fs-md);
		font-weight: var(--fw-semibold);
	}
	@media (hover: hover) {
		.actions :global(.cta:hover:not(:disabled)) {
			background: var(--accent-hover);
		}
	}
	.actions :global(.plain) {
		min-height: var(--hit-min);
		padding: 0 var(--space-4);
		border-radius: var(--radius-md);
		background: transparent;
		color: var(--accent-text);
		font-size: var(--fs-md);
	}
	@media (hover: hover) {
		.actions :global(.plain:hover:not(:disabled)) {
			color: var(--accent-hover);
		}
	}
	.actions :global(:is(.cta, .plain):disabled) {
		opacity: 0.45;
		cursor: not-allowed;
	}

	/* ── Wider screens: a narrow centred column, buttons bottom right (macOS sheet) ── */
	@media (min-width: 721px) {
		.topbar {
			padding: var(--space-4) var(--space-6) 0;
		}
		.column {
			justify-content: center;
			padding-bottom: var(--space-12);
		}
		.body {
			flex: none;
			gap: var(--space-5);
			padding: 0 0 var(--space-6);
		}
		.intro .body {
			gap: var(--space-6);
		}
		.title {
			font-size: var(--fs-xl);
		}
		.footer {
			position: static;
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: var(--space-4);
			padding: var(--space-4) 0 0;
			border-top: 1px solid var(--border);
			background: none;
		}
		.actions {
			display: flex;
			flex-direction: row-reverse;
			justify-content: flex-start;
			gap: var(--space-2);
			width: auto;
			margin-left: auto;
		}
		.actions :global(.cta),
		.actions :global(.plain) {
			width: auto;
			height: 32px;
			min-height: 0;
			padding: 0 var(--space-4);
			border-radius: var(--radius-md);
			font-size: var(--fs-sm);
			font-weight: var(--fw-medium);
		}
		.actions :global(.plain) {
			border: 1px solid var(--border);
			background: var(--surface);
			color: var(--text);
		}
		@media (hover: hover) {
			.actions :global(.plain:hover:not(:disabled)) {
				border-color: var(--border-strong);
				background: var(--surface-hover);
				color: var(--text);
			}
		}
	}
</style>
