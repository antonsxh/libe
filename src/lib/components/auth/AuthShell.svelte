<script lang="ts">
	import type { Snippet } from 'svelte';
	import Logo from '#lib/components/Logo.svelte';

	type Props = {
		title: string;
		subtitle?: string;
		/** One sentence under the logo: what libe is (first contact: /setup, /pair). */
		intro?: string;
		children: Snippet;
		/** Small print under the card. */
		footer?: Snippet;
	};
	let { title, subtitle, intro, children, footer }: Props = $props();
</script>

<div class="shell">
	<div class="head">
		<div class="brand" aria-hidden="true">
			<Logo size={34} />
			<span>libe</span>
		</div>
		{#if intro}<p class="intro muted">{intro}</p>{/if}
	</div>
	<section class="card panel" aria-labelledby="auth-title">
		<h1 id="auth-title">{title}</h1>
		{#if subtitle}<p class="sub muted">{subtitle}</p>{/if}
		{@render children()}
	</section>
	{#if footer}<div class="footer muted">{@render footer()}</div>{/if}
</div>

<style>
	.shell {
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--space-6);
		padding: calc(var(--space-10) + var(--safe-top)) calc(var(--space-4) + var(--safe-right))
			calc(var(--space-10) + var(--safe-bottom)) calc(var(--space-4) + var(--safe-left));
	}
	.head {
		display: grid;
		justify-items: center;
		gap: var(--space-3);
		width: min(440px, 100%);
		text-align: center;
	}
	.intro {
		font-size: var(--fs-md);
		text-wrap: balance;
	}
	.brand {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		font-size: var(--fs-xl);
		font-weight: var(--fw-medium);
		letter-spacing: -0.01em;
	}
	.panel {
		width: min(440px, 100%);
		min-width: 0;
		padding: var(--space-8);
		border-radius: var(--radius-xl);
	}
	h1 {
		font-size: var(--fs-xl);
		font-weight: var(--fw-semibold);
		letter-spacing: -0.01em;
	}
	.sub {
		margin-top: var(--space-2);
		font-size: var(--fs-md);
	}
	.footer {
		width: min(440px, 100%);
		font-size: var(--fs-sm);
		text-align: center;
		line-height: 1.6;
	}
	.footer :global(a) {
		color: var(--accent-text);
	}
	.footer :global(a:hover) {
		text-decoration: underline;
	}

	/* Form bits shared by /pair and /setup. */
	.panel :global(form) {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-5);
		margin-top: var(--space-6);
	}
	.panel :global(.field) {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-2);
	}
	.panel :global(.field input) {
		width: 100%;
		min-width: 0;
		height: 48px;
		padding: 0 var(--space-4);
		background: var(--bg);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-md);
		font-size: var(--fs-md);
		transition: border-color var(--dur) var(--ease);
	}
	.panel :global(.field input:focus) {
		outline: none;
		border-color: var(--accent);
		box-shadow: var(--ring);
	}
	.panel :global(.field input[aria-invalid='true']) {
		border-color: var(--danger);
	}
	.panel :global(.hint) {
		font-size: var(--fs-sm);
		color: var(--text-muted);
	}
	.panel :global(.error) {
		color: var(--danger);
		font-size: var(--fs-sm);
	}
	.panel :global(.notice) {
		margin-top: var(--space-5);
		padding: var(--space-3) var(--space-4);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-md);
		background: var(--surface-2);
		color: var(--text-2);
		font-size: var(--fs-sm);
	}
	.panel :global(.notice a) {
		color: var(--accent-text);
	}
	.panel :global(.submit .btn) {
		width: 100%;
		height: 48px;
	}

	@media (max-width: 480px) {
		.panel {
			padding: var(--space-6) var(--space-5);
		}
	}
</style>
