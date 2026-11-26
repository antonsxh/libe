<script lang="ts">
	import { page } from '$app/state';
	import {
		CalendarDays,
		ChartColumn,
		Flag,
		Flame,
		House,
		QrCode,
		Search,
		Settings,
		SquareKanban,
		Timer,
		UserRound
	} from '@lucide/svelte';
	import { NAV_ITEMS, TAB_ITEMS, activeTab, isActive } from '#lib/nav.ts';
	import { fadeScale } from '#lib/motion.ts';
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

	/** Icons for the floating bottom tab bar (phones). */
	const ICONS = {
		'/': House,
		'/plan': SquareKanban,
		'/calendar': CalendarDays,
		'/focus': Timer,
		'/quests': Flag,
		'/review': ChartColumn
	} as Record<string, typeof House>;

	/** Overdue tasks (root layout `overdueCount`): a dot on the Home item while there are any. */
	const overdue = $derived(page.data.overdueCount ?? 0);

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

	/** Phones: slot of the tab bar's sliding indicator (-1 = none; after the tabs = avatar). */
	const tab = $derived(activeTab(page.url.pathname));

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

<!-- The account menu of the top-bar avatar (desktop/tablet; phones link the avatar to Settings). -->
{#snippet accountMenu(close: () => void)}
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
{/snippet}

<header class="nav">
	<a class="brand" href="/" aria-label={t.nav.brandHome}>
		<Logo />
		<span>libe</span>
	</a>

	<!--
		Desktop/tablet: the section links in the top bar. Phones (≤ 720px): a floating capsule at
		the bottom — icons with a small label under each, Focus left out (mini-player, Next up, ▶,
		palette), the account avatar ("Me") as the last slot, one pill sliding to the active slot.
	-->
	<nav aria-label={t.nav.main} style:--tabs={TAB_ITEMS.length + 1}>
		{#if tab >= 0}
			<span class="tab-pill" style:--i={tab} aria-hidden="true">
				<span transition:fadeScale></span>
			</span>
		{/if}
		{#each NAV_ITEMS as item (item.href)}
			{@const Icon = ICONS[item.href]}
			{@const active = isActive(page.url.pathname, item.href)}
			<a
				href={item.href}
				class:active
				class:wide-only={item.key === 'focus'}
				aria-current={active ? 'page' : undefined}
				aria-label={item.key === 'home' && overdue > 0
					? t.overdue.navLabel(t.nav.home, overdue)
					: undefined}
			>
				<span class="tab-icon" aria-hidden="true">
					<Icon size={22} strokeWidth={active ? 2.25 : 1.75} />
				</span>
				<span class="tab-label">{t.nav[item.key]}</span>
				{#if item.key === 'home' && overdue > 0}
					<span class="overdue-dot" aria-hidden="true" transition:fadeScale></span>
				{/if}
			</a>
		{/each}
		<!-- Phones: the avatar goes straight to Settings (no account menu). -->
		<span class="tab-account">
			<a
				href="/settings"
				aria-label={accountLabel}
				aria-current={tab === TAB_ITEMS.length ? 'page' : undefined}
			>
				<Avatar
					name={displayName}
					color={profile?.avatarColor}
					emoji={profile?.avatarEmoji}
					size="sm"
					ring={goal}
				/>
				<span class="tab-label" aria-hidden="true">{t.nav.me}</span>
			</a>
		</span>
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
		<span class="top-account">
			<Menu label={accountLabel}>
				{#snippet trigger()}<Avatar
						name={displayName}
						color={profile?.avatarColor}
						emoji={profile?.avatarEmoji}
						ring={goal}
					/>{/snippet}
				{#snippet children(close)}{@render accountMenu(close)}{/snippet}
			</Menu>
		</span>
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

	/* Overdue tasks: a small dot at the Home item's top right (no number — Home has the list). */
	nav a {
		position: relative;
	}
	.overdue-dot {
		position: absolute;
		top: var(--space-1);
		right: var(--space-1);
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--overdue);
		box-shadow: 0 0 0 2px var(--bg-nav);
		pointer-events: none;
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
	/* A lit flame is the one reward colour (Apple Fitness orange), filled. */
	.streak :global(svg.lit) {
		color: var(--streak);
		fill: currentColor;
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

	/* Phone-only parts of the nav (the tab bar's pill and avatar). */
	.tab-pill,
	.tab-account {
		display: none;
	}
	.top-account {
		display: flex;
	}

	/*
	 * Phones: the sections move into a floating capsule at the bottom (thumb reach, icons only);
	 * the top bar keeps only brand and search. The avatar is the capsule's last slot.
	 */
	@media (max-width: 720px) {
		.nav {
			height: calc(var(--nav-h-compact) + var(--safe-top));
		}
		.brand span {
			display: inline;
		}
		/* The mini-player above the tab bar shows the timer (MiniPlayer.svelte). */
		.chip,
		.top-account,
		nav a.wide-only {
			display: none;
		}
		nav {
			position: fixed;
			z-index: 20;
			left: calc(var(--tabbar-inset) + var(--safe-left));
			right: calc(var(--tabbar-inset) + var(--safe-right));
			bottom: var(--tabbar-lift);
			max-width: var(--tabbar-max-w);
			height: var(--tabbar-h);
			margin-inline: auto;
			display: grid;
			grid-template-columns: repeat(var(--tabs), minmax(0, 1fr));
			gap: 0;
			overflow: visible;
			padding: var(--tabbar-pad);
			border: 1px solid var(--glass-border);
			border-radius: var(--radius-pill);
			background: var(--glass-bg);
			-webkit-backdrop-filter: var(--glass-blur);
			backdrop-filter: var(--glass-blur);
			box-shadow: var(--shadow-float);
			-webkit-touch-callout: none;
			-webkit-user-select: none;
			user-select: none;
		}
		@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
			nav {
				background: var(--glass-bg-solid);
			}
		}

		/* One indicator for the whole bar: it slides to the active slot (springy, on the tap). */
		.tab-pill {
			position: absolute;
			top: var(--tabbar-pad);
			bottom: var(--tabbar-pad);
			left: var(--tabbar-pad);
			display: block;
			width: calc((100% - 2 * var(--tabbar-pad)) / var(--tabs));
			transform: translateX(calc(var(--i) * 100%));
			transition: transform var(--dur-sheet) var(--ease-spring);
			pointer-events: none;
		}
		.tab-pill > span {
			display: block;
			height: 100%;
			border-radius: var(--radius-pill);
			background: var(--tab-pill);
		}

		nav a,
		.tab-account {
			position: relative; /* above the pill */
			display: grid;
			place-items: center;
			align-content: center;
			gap: var(--tab-label-gap);
			min-width: 0;
			padding: 0;
			border-radius: var(--radius-pill);
			-webkit-tap-highlight-color: transparent;
		}
		nav a {
			color: var(--text-muted);
			transition: color var(--dur) var(--ease);
		}
		nav a.active {
			background: transparent;
		}
		.tab-icon {
			display: grid;
			place-items: center;
			transition: scale var(--dur-press) var(--ease-out);
		}
		.tab-icon :global(svg) {
			width: var(--tab-icon);
			height: var(--tab-icon);
			transition: stroke-width var(--dur-pop) var(--ease-out);
		}
		nav a:active .tab-icon {
			scale: var(--press-scale);
		}
		/* The dot sits on the icon's top right corner (icon + label are centred as a block). */
		.overdue-dot {
			top: calc(
				50% - (var(--tab-icon) + var(--tab-label-gap) + var(--fs-tab-label) * 1.2) / 2 - 1px
			);
			right: auto;
			left: calc(50% + var(--tab-icon) / 2 - 5px);
			box-shadow: 0 0 0 2px var(--glass-bg-solid);
		}
		/* A small label under each icon (Apple tab bars always name their tabs). */
		.tab-label {
			max-width: 100%;
			overflow: hidden;
			white-space: nowrap;
			text-overflow: ellipsis;
			font-size: var(--fs-tab-label);
			font-weight: var(--fw-medium);
			line-height: 1.2;
			letter-spacing: 0.01em;
		}
		/* The active tab: icon and label in the accent, on its pill. */
		nav a.active,
		.tab-account a[aria-current='page'] {
			color: var(--accent-text);
		}

		/* The avatar slot: the whole slot is the link (hit area), avatar and label centred. */
		.tab-account a {
			display: grid;
			place-items: center;
			align-content: center;
			gap: var(--tab-label-gap);
			width: 100%;
			height: 100%;
			color: var(--text-muted);
		}
		.tab-account :global(.wrap.sm) {
			--avatar-size: var(--tab-avatar);
		}
		.tab-account a:active :global(.wrap) {
			scale: var(--press-scale);
		}
	}
</style>
