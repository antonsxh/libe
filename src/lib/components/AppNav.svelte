<script lang="ts">
	import { page } from '$app/state';
	import {
		CalendarDays,
		ChartColumn,
		Flag,
		House,
		LogOut,
		QrCode,
		Search,
		Settings,
		SquareKanban,
		Timer
	} from '@lucide/svelte';
	import { NAV_ITEMS, isActive } from '#lib/nav.ts';
	import Logo from './Logo.svelte';
	import Menu from './Menu.svelte';
	import { useTimer } from '#lib/timer-store.svelte.ts';
	import { timerLabelText } from '#lib/timer.ts';
	import { useI18n } from '#lib/i18n/context.svelte.ts';

	const timer = useTimer();
	const t = useI18n();
	const timerState = $derived(timer.view ? timerLabelText(timer.view.label, t) : '');

	/** Icons for the compact bottom tab bar (phones). */
	const ICONS = {
		'/': House,
		'/plan': SquareKanban,
		'/calendar': CalendarDays,
		'/focus': Timer,
		'/quests': Flag,
		'/review': ChartColumn
	} as Record<string, typeof House>;

	const deviceName = $derived(page.data.device?.name ?? t.nav.thisDevice);

	const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
</script>

<header class="nav">
	<a class="brand" href="/" aria-label={t.nav.brandHome}>
		<Logo />
		<span>libe</span>
	</a>

	<nav aria-label={t.nav.main}>
		{#each NAV_ITEMS as item (item.href)}
			{@const Icon = ICONS[item.href]}
			<a
				href={item.href}
				class:active={isActive(page.url.pathname, item.href)}
				aria-current={isActive(page.url.pathname, item.href) ? 'page' : undefined}
			>
				<span class="tab-icon" aria-hidden="true"><Icon size={20} strokeWidth={1.75} /></span>
				<span class="tab-label">{t.nav[item.key]}</span>
			</a>
		{/each}
	</nav>

	<div class="right">
		{#if timer.view && timer.timer}
			<a
				class="chip"
				class:paused={timer.view.status !== 'running'}
				href="/focus"
				title={`${timerState} · ${timer.timer.task.title}`}
				aria-label={t.nav.timerChip(
					timer.view.display,
					timerState.toLocaleLowerCase(t.intl),
					timer.timer.task.title
				)}
			>
				<span class="rec" aria-hidden="true"></span>
				<span class="chip-time tabular">{timer.view.display}</span>
				<span class="chip-title">{timer.timer.task.title}</span>
			</a>
		{/if}
		<!-- Command palette lands in a later milestone; the trigger is already part of the shell. -->
		<button class="search" type="button" title={t.nav.searchSoon} disabled>
			<Search size={16} strokeWidth={1.75} />
			<span>{t.nav.search}</span>
			<kbd>{isMac ? '⌘' : 'Ctrl'} K</kbd>
		</button>
		<Menu label={t.nav.account}>
			{#snippet trigger()}<span class="avatar" aria-hidden="true">L</span>{/snippet}
			{#snippet children(close)}
				<p class="menu-head">
					<span class="muted">{t.nav.signedInAs}</span>
					<span class="device-name">{deviceName}</span>
				</p>
				<a class="item" role="menuitem" href="/settings" onclick={close}>
					<Settings size={14} />
					{t.nav.settings}
				</a>
				<a class="item" role="menuitem" href="/settings?pair" onclick={close}>
					<QrCode size={14} />
					{t.nav.pairNewDevice}
				</a>
				<form method="POST" action="/settings?/signout">
					<button type="submit" class="item danger" role="menuitem">
						<LogOut size={14} />
						{t.nav.signOut}
					</button>
				</form>
			{/snippet}
		</Menu>
	</div>
</header>

<style>
	.nav {
		position: sticky;
		top: 0;
		z-index: 20;
		/* iOS home-screen app: the status bar overlays the page (black-translucent). */
		height: calc(var(--nav-h) + var(--safe-top));
		display: flex;
		align-items: center;
		gap: var(--space-8);
		padding: var(--safe-top) calc(var(--space-8) + var(--safe-right)) 0
			calc(var(--space-8) + var(--safe-left));
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
		min-width: 0;
		overflow-x: auto;
	}

	nav a {
		display: flex;
		align-items: center;
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

	.tab-icon {
		display: none;
	}

	.right {
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: var(--space-4);
		min-width: 0;
	}

	.chip {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		max-width: 260px;
		min-width: 0;
		height: 36px;
		padding: 0 var(--space-3);
		border: 1px solid var(--running-border);
		border-radius: var(--radius-pill);
		background: var(--surface);
		color: var(--text);
		font-size: var(--fs-sm);
		transition: background var(--dur) var(--ease);
	}
	.chip:hover {
		background: var(--surface-hover);
	}
	.chip .rec {
		flex: none;
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--danger);
	}
	.chip.paused {
		border-color: var(--border-strong);
	}
	.chip.paused .rec {
		background: var(--text-faint);
	}
	.chip-time {
		flex: none;
		font-weight: var(--fw-medium);
	}
	.chip-title {
		min-width: 0;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
		color: var(--text-muted);
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
		min-width: 0;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
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
		transition: border-color var(--dur) var(--ease);
	}
	.right :global(.trigger-custom:hover .avatar),
	.right :global(.trigger-custom[aria-expanded='true'] .avatar) {
		border-color: var(--text-faint);
	}
	.right :global(.trigger-custom) {
		border-radius: 50%;
	}

	/* Account menu */
	.menu-head {
		display: grid;
		gap: 2px;
		padding: var(--space-2) var(--space-3) var(--space-3);
		margin-bottom: var(--space-1);
		border-bottom: 1px solid var(--border);
		font-size: var(--fs-xs);
	}
	.device-name {
		max-width: 220px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--text);
		font-size: var(--fs-sm);
		font-weight: var(--fw-medium);
	}
	.item {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		width: 100%;
		padding: var(--space-2) var(--space-3);
		background: transparent;
		border: none;
		border-radius: var(--radius-sm);
		color: var(--text-2);
		font-size: var(--fs-sm);
		text-align: left;
		white-space: nowrap;
	}
	.item:hover {
		background: var(--surface-hover);
		color: var(--text);
	}
	.item.danger {
		color: var(--danger);
	}

	@media (max-width: 1180px) {
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

	@media (max-width: 900px) {
		.nav {
			gap: var(--space-4);
			padding-left: calc(var(--space-4) + var(--safe-left));
			padding-right: calc(var(--space-4) + var(--safe-right));
		}
		.chip-title,
		.brand span {
			display: none;
		}
	}

	/*
	 * Phones: the sections move into a bottom tab bar (thumb reach, no scrolling strip);
	 * the top bar keeps brand, timer chip, search and the account menu.
	 */
	@media (max-width: 720px) {
		.nav {
			height: calc(var(--nav-h-compact) + var(--safe-top));
		}
		.brand span {
			display: inline;
		}
		nav {
			position: fixed;
			z-index: 20;
			left: 0;
			right: 0;
			bottom: 0;
			display: grid;
			grid-template-columns: repeat(6, minmax(0, 1fr));
			gap: 0;
			overflow: visible;
			padding: 0 var(--safe-right) var(--safe-bottom) var(--safe-left);
			background: var(--bg-nav);
			border-top: 1px solid var(--border);
		}
		nav a {
			flex-direction: column;
			justify-content: center;
			gap: 2px;
			min-width: 0;
			height: var(--tabbar-h);
			padding: 0;
			border-radius: 0;
			font-size: var(--fs-tab);
		}
		nav a.active {
			background: transparent;
			color: var(--accent);
		}
		.tab-icon {
			display: grid;
		}
		.tab-label {
			max-width: 100%;
			overflow: hidden;
			text-overflow: ellipsis;
		}
	}
</style>
