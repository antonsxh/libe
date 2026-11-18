<script lang="ts">
	import { page } from '$app/state';
	import { Search } from '@lucide/svelte';
	import { NAV_ITEMS, isActive } from '#lib/nav.ts';
	import Logo from './Logo.svelte';

	const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
</script>

<header class="nav">
	<a class="brand" href="/" aria-label="libe home">
		<Logo />
		<span>libe</span>
	</a>

	<nav aria-label="Main">
		{#each NAV_ITEMS as item (item.href)}
			<a
				href={item.href}
				class:active={isActive(page.url.pathname, item.href)}
				aria-current={isActive(page.url.pathname, item.href) ? 'page' : undefined}
			>
				{item.label}
			</a>
		{/each}
	</nav>

	<div class="right">
		<!-- Command palette lands in a later milestone; the trigger is already part of the shell. -->
		<button class="search" type="button" title="Search (coming soon)" disabled>
			<Search size={16} strokeWidth={1.75} />
			<span>Search or jump…</span>
			<kbd>{isMac ? '⌘' : 'Ctrl'} K</kbd>
		</button>
		<div class="avatar" aria-hidden="true">L</div>
	</div>
</header>

<style>
	.nav {
		position: sticky;
		top: 0;
		z-index: 20;
		height: var(--nav-h);
		display: flex;
		align-items: center;
		gap: var(--space-8);
		padding: 0 var(--space-8);
		background: var(--bg-nav);
		border-bottom: 1px solid var(--border);
	}

	.brand {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		font-size: var(--fs-lg);
		font-weight: var(--fw-medium);
		letter-spacing: -0.01em;
	}

	nav {
		display: flex;
		gap: var(--space-1);
		overflow-x: auto;
	}

	nav a {
		padding: var(--space-2) var(--space-4);
		border-radius: var(--radius-md);
		color: var(--text-muted);
		font-size: var(--fs-md);
		white-space: nowrap;
		transition:
			color var(--dur) var(--ease),
			background var(--dur) var(--ease);
	}

	nav a:hover {
		color: var(--text);
	}

	nav a.active {
		color: var(--text);
		background: var(--surface-2);
		font-weight: var(--fw-medium);
	}

	.right {
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: var(--space-4);
	}

	.search {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		width: 260px;
		height: 44px;
		padding: 0 var(--space-2) 0 var(--space-4);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		color: var(--text-muted);
		cursor: default;
	}

	.search span {
		flex: 1;
		text-align: left;
		font-size: var(--fs-md);
	}

	kbd {
		font-family: var(--font-sans);
		font-size: var(--fs-xs);
		color: var(--text-faint);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-sm);
		padding: 1px 6px;
	}

	.avatar {
		display: grid;
		place-items: center;
		width: 40px;
		height: 40px;
		border-radius: 50%;
		background: var(--surface-2);
		border: 1px solid var(--border-strong);
		font-weight: var(--fw-semibold);
		font-size: var(--fs-sm);
	}

	@media (max-width: 900px) {
		.nav {
			gap: var(--space-4);
			padding: 0 var(--space-4);
		}
		.brand span,
		.search span,
		.search kbd {
			display: none;
		}
		.search {
			width: 44px;
			justify-content: center;
			padding: 0;
		}
	}
</style>
