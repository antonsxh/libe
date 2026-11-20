<script lang="ts">
	import { page } from '$app/state';
	import {
		CalendarDays,
		ChartColumn,
		Flag,
		Flame,
		House,
		LogOut,
		QrCode,
		Search,
		Settings,
		SquareKanban,
		Timer,
		UserRound
	} from '@lucide/svelte';
	import { NAV_ITEMS, isActive } from '#lib/nav.ts';
	import Avatar from './Avatar.svelte';
	import Logo from './Logo.svelte';
	import Menu from './Menu.svelte';
	import CommandPalette from './palette/CommandPalette.svelte';
	import { useTimer } from '#lib/timer-store.svelte.ts';
	import { timerLabelText } from '#lib/timer.ts';
	import { useI18n } from '#lib/i18n/context.svelte.ts';
	import { isApplePlatform } from '#lib/palette.ts';
	import { PROFILE_HREF } from '#lib/profile.ts';
	import { goalProgress, liveLoggedMin, runningSpan, splitMinutes } from '#lib/daily-goal.ts';
	import { pageStreak } from '#lib/streak.ts';

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
	const profile = $derived(page.data.profile ?? null);
	const displayName = $derived(profile?.displayName ?? null);

	/**
	 * Daily-goal ring: today's minutes from the layout data (server, completed sessions) plus
	 * the active session's running time from the timer snapshot — moves live while it runs.
	 */
	const goal = $derived.by(() => {
		const goalMin = page.data.dailyGoalMin ?? null;
		const log = page.data.todayLog ?? null;
		if (!goalMin || !log) return null;
		const logged = liveLoggedMin(log, runningSpan(timer.timer, timer.view), timer.serverNow);
		return goalProgress(logged, goalMin);
	});
	/** Account menu head: current (live, like Home) and longest streak. */
	const streak = $derived.by(() => {
		const base = page.data.streak ?? null;
		const log = page.data.todayLog ?? null;
		if (!base || !log) return null;
		return pageStreak(base, log, runningSpan(timer.timer, timer.view), timer.serverNow);
	});
	const duration = (min: number) => {
		const { h, m } = splitMinutes(min);
		return t.goal.duration(h, m);
	};
	const accountLabel = $derived.by(() => {
		const base = displayName ? t.nav.accountOf(displayName) : t.nav.account;
		if (!goal) return base;
		return t.nav.withProgress(
			base,
			t.goal.progress(duration(goal.loggedMin), duration(goal.goalMin))
		);
	});

	/** ⌘ vs Ctrl: decided after mount — SSR can't know, and hydration must not keep its guess. */
	let isMac = $state(false);
	$effect(() => {
		isMac = isApplePlatform(navigator as Parameters<typeof isApplePlatform>[0]);
	});

	let searchButton = $state<HTMLButtonElement>();
	let palette = $state<ReturnType<typeof CommandPalette>>();
	let paletteOpen = $state(false);
</script>

{#snippet streakLine()}
	{#if streak}
		<span class="muted streak tabular" data-testid="menu-streak">
			<Flame size={12} aria-hidden="true" class={streak.state === 'active' ? 'lit' : ''} />
			{streak.current > 0 ? t.streak.count(streak.current) : t.streak.none} · {t.streak.longestShort(
				streak.longest
			)}
		</span>
	{/if}
{/snippet}

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
		<!-- Opens the palette synchronously (iOS shows the keyboard only inside the tap). -->
		<button
			class="search"
			type="button"
			bind:this={searchButton}
			aria-label={t.nav.search}
			aria-haspopup="dialog"
			aria-expanded={paletteOpen}
			aria-keyshortcuts={isMac ? 'Meta+K' : 'Control+K'}
			onclick={() => palette?.show(searchButton)}
		>
			<Search size={16} strokeWidth={1.75} />
			<span>{t.nav.search}</span>
			<kbd>{isMac ? '⌘' : 'Ctrl'} K</kbd>
		</button>
		<CommandPalette
			bind:this={palette}
			bind:open={paletteOpen}
			trigger={searchButton}
			apple={isMac}
		/>
		<Menu label={accountLabel}>
			{#snippet trigger()}<Avatar
					name={displayName}
					color={profile?.avatarColor}
					emoji={profile?.avatarEmoji}
					ring={goal}
				/>{/snippet}
			{#snippet children(close)}
				<div class="menu-head">
					{#if displayName}
						<Avatar
							name={displayName}
							color={profile?.avatarColor}
							emoji={profile?.avatarEmoji}
							size="sm"
						/>
						<p class="who">
							<span class="person">{displayName}</span>
							<span class="muted device">{t.nav.thisDeviceIs(deviceName)}</span>
							{@render streakLine()}
						</p>
					{:else}
						<p class="who">
							<span class="muted">{t.nav.signedInAs}</span>
							<span class="person">{deviceName}</span>
							{@render streakLine()}
						</p>
					{/if}
				</div>
				<a class="item" role="menuitem" href={PROFILE_HREF} onclick={close}>
					<UserRound size={14} />
					{t.nav.editProfile}
				</a>
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
		transition:
			color var(--dur) var(--ease),
			border-color var(--dur) var(--ease);
	}
	.search:hover,
	.search[aria-expanded='true'] {
		color: var(--text);
		border-color: var(--border-strong);
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

	.right :global(.trigger-custom:hover .avatar),
	.right :global(.trigger-custom[aria-expanded='true'] .avatar) {
		border-color: var(--text-faint);
	}
	.right :global(.trigger-custom) {
		border-radius: 50%;
	}

	/* Account menu */
	.menu-head {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-2) var(--space-3) var(--space-3);
		margin-bottom: var(--space-1);
		border-bottom: 1px solid var(--border);
		font-size: var(--fs-xs);
	}
	.who {
		display: grid;
		gap: 2px;
		min-width: 0;
	}
	.who > span {
		max-width: 220px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.streak {
		display: flex;
		align-items: center;
		gap: var(--space-1);
	}
	.streak :global(svg) {
		flex: none;
	}
	.streak :global(svg.lit) {
		color: var(--accent);
	}
	.person {
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
