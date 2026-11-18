<script lang="ts">
	import AppNav from '#lib/components/AppNav.svelte';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<AppNav />

<main>
	{@render children()}
</main>

<style>
	main {
		max-width: var(--page-max);
		margin: 0 auto;
		padding: var(--space-16) calc(var(--page-gutter) + var(--safe-right))
			calc(var(--space-12) + var(--safe-bottom)) calc(var(--page-gutter) + var(--safe-left));
	}

	@media (max-width: 900px) {
		main {
			padding: var(--space-8) calc(var(--space-4) + var(--safe-right))
				calc(var(--space-8) + var(--safe-bottom)) calc(var(--space-4) + var(--safe-left));
		}
	}

	/* Phones: clear the fixed bottom tab bar (see AppNav). */
	@media (max-width: 720px) {
		main {
			padding-bottom: calc(var(--space-8) + var(--tabbar-h) + var(--safe-bottom));
		}
	}
</style>
