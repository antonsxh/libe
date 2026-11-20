<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import { X } from '@lucide/svelte';
	import AppNav from '#lib/components/AppNav.svelte';
	import { useI18n } from '#lib/i18n/context.svelte.ts';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();
	const t = useI18n();

	// One-time welcome on the first page after pairing (`welcome` cookie, root layout load):
	// shown until dismissed or the next navigation.
	// svelte-ignore state_referenced_locally
	let welcome = $state(data.welcome);
	afterNavigate(({ type }) => {
		if (type !== 'enter') welcome = false;
	});
</script>

<AppNav />

<main>
	{#if welcome}
		<div class="welcome" role="status">
			<p>{t.welcome.paired(data.profile?.displayName ?? null)}</p>
			<button
				type="button"
				class="dismiss"
				aria-label={t.welcome.dismiss}
				onclick={() => (welcome = false)}
			>
				<X size={16} />
			</button>
		</div>
	{/if}
	{@render children()}
</main>

<style>
	main {
		max-width: var(--page-max);
		margin: 0 auto;
		padding: var(--space-16) calc(var(--page-gutter) + var(--safe-right))
			calc(var(--space-12) + var(--safe-bottom)) calc(var(--page-gutter) + var(--safe-left));
	}

	.welcome {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		margin: calc(-1 * var(--space-10)) 0 var(--space-6);
		padding: var(--space-3) var(--space-3) var(--space-3) var(--space-4);
		background: var(--accent-soft);
		border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
		border-radius: var(--radius-md);
		color: var(--text);
		font-size: var(--fs-sm);
	}
	.welcome p {
		flex: 1;
		min-width: 0;
	}
	.dismiss {
		flex: none;
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		padding: 0;
		background: transparent;
		border: none;
		border-radius: var(--radius-sm);
		color: var(--text-muted);
	}
	.dismiss:hover {
		color: var(--text);
		background: var(--surface-hover);
	}

	@media (max-width: 900px) {
		main {
			padding: var(--space-8) calc(var(--space-4) + var(--safe-right))
				calc(var(--space-8) + var(--safe-bottom)) calc(var(--space-4) + var(--safe-left));
		}
		.welcome {
			margin-top: 0;
		}
	}

	/* Phones: clear the fixed bottom tab bar (see AppNav). */
	@media (max-width: 720px) {
		main {
			padding-bottom: calc(var(--space-8) + var(--tabbar-h) + var(--safe-bottom));
		}
	}
</style>
