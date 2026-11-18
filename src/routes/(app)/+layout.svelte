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
		padding: var(--space-16) var(--page-gutter) var(--space-12);
	}

	@media (max-width: 900px) {
		main {
			padding: var(--space-8) var(--space-4);
		}
	}
</style>
