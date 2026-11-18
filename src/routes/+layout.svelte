<script lang="ts">
	import '@fontsource-variable/inter';
	import '#lib/styles/global.css';
	import favicon from '#lib/assets/favicon.svg';
	import AppNav from '#lib/components/AppNav.svelte';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>libe</title>
</svelte:head>

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
