<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { MediaQuery } from 'svelte/reactivity';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import {
		Bell,
		ChevronLeft,
		ChevronRight,
		Flame,
		Globe,
		Monitor,
		MonitorSmartphone,
		Target,
		Timer
	} from '@lucide/svelte';
	import Avatar from '#lib/components/Avatar.svelte';
	import Dialog from '#lib/components/Dialog.svelte';
	import GroupedList from '#lib/components/GroupedList.svelte';
	import GroupedNavRow from '#lib/components/GroupedNavRow.svelte';
	import AutoStartForm from '#lib/components/settings/AutoStartForm.svelte';
	import DesktopAppSection from '#lib/components/settings/DesktopAppSection.svelte';
	import DeviceList from '#lib/components/settings/DeviceList.svelte';
	import GoalEditor from '#lib/components/settings/GoalEditor.svelte';
	import LanguageEditor from '#lib/components/settings/LanguageEditor.svelte';
	import NotificationsGroup from '#lib/components/settings/NotificationsGroup.svelte';
	import PairDeviceDialog from '#lib/components/settings/PairDeviceDialog.svelte';
	import PomodoroEditor from '#lib/components/settings/PomodoroEditor.svelte';
	import ProfileEditor from '#lib/components/settings/ProfileEditor.svelte';
	import RestDaysEditor from '#lib/components/settings/RestDaysEditor.svelte';
	import SaveStatus from '#lib/components/settings/SaveStatus.svelte';
	import SettingsTile from '#lib/components/settings/SettingsTile.svelte';
	import { provideSaveIndicator } from '#lib/autosave.svelte.ts';
	import { useTimer } from '#lib/timer-store.svelte.ts';
	import { useI18n } from '#lib/i18n/context.svelte.ts';
	import { DEFAULT_PROFILE } from '#lib/profile.ts';
	import { splitMinutes } from '#lib/daily-goal.ts';
	import { formatDurationMin } from '#lib/duration.ts';
	import { STREAK_FALLBACK_MIN, restWeekdays, streakThreshold } from '#lib/streak.ts';
	import {
		DEFAULT_SECTION,
		SECTION_PARAM,
		availableSections,
		requestedSection,
		restDaysSummary,
		sectionFromHash,
		settingsHref,
		weekdayName,
		type SettingsSection
	} from '#lib/settings-sections.ts';
	import type { PageProps } from './$types';

	/*
	 * Settings (AB1). Phones (≤ 720px): one large title and inset grouped sections like iOS
	 * Settings — rows show the current value and open a sheet; switches act in place. Wider:
	 * macOS System Settings — a sidebar of sections, the selected one's form beside it
	 * (`?section=`, client-only). One tree is server-rendered for both (CSS picks); once the page
	 * runs only the current layout stays mounted, so every field exists once. Every change saves
	 * itself through the form actions (`createAutosave`) — there are no Save buttons.
	 */
	let { data, form }: PageProps = $props();

	const timer = useTimer();
	const t = useI18n();
	provideSaveIndicator();
	const pomodoro = $derived(timer.settings);

	let hydrated = $state(false);
	const phoneQuery = new MediaQuery('max-width: 720px', false);
	/** `both` while server-rendered (CSS shows one), then the current layout only. */
	const layout = $derived(hydrated ? (phoneQuery.current ? 'phone' : 'wide') : 'both');

	const tauri = $derived(page.data.device?.kind === 'tauri');
	const sections = $derived(availableSections({ desktopApp: tauri }));
	const requested = $derived(requestedSection(page.url, sections));
	const section = $derived<SettingsSection>(requested ?? DEFAULT_SECTION);
	/** Without JS a phone link to a section shows its form as a page (no sheets without JS). */
	const pushed = $derived(!hydrated && page.url.searchParams.has(SECTION_PARAM));

	onMount(() => {
		hydrated = true;
		// Old anchors (`#profile`, `#goal`, `#streak`) → `?section=`.
		const fromHash = sectionFromHash(location.hash);
		if (fromHash && !page.url.searchParams.has(SECTION_PARAM))
			void goto(settingsHref(fromHash), { replace: true, reset: false });
	});

	/* ── Phone sheets ─────────────────────────────────────────────────────── */
	type Sheet = 'profile' | 'goal' | 'rest' | 'pomodoro' | 'language';
	const SHEET_OF: Partial<Record<SettingsSection, Sheet>> = {
		profile: 'profile',
		goal: 'goal',
		focus: 'pomodoro',
		language: 'language'
	};
	let sheet = $state<Sheet | null>(null);
	let sheetOpen = $state(false);
	function openSheet(next: Sheet) {
		sheet = next;
		sheetOpen = true;
	}
	// A link to a section (avatar menu "Profile…", the palette) opens its sheet on phones.
	$effect(() => {
		if (layout !== 'phone' || !requested) return;
		const next = SHEET_OF[requested];
		if (next) untrack(() => openSheet(next));
	});
	function sheetClosed() {
		sheet = null;
		if (page.url.searchParams.has(SECTION_PARAM) || page.url.hash)
			void goto(settingsHref(null), { replace: true, reset: false });
	}
	const sheetTitle = $derived.by(() => {
		switch (sheet) {
			case 'profile':
				return t.settings.profile;
			case 'goal':
				return t.settings.dailyGoal;
			case 'rest':
				return t.settings.restDays;
			case 'pomodoro':
				return t.settings.pomodoro;
			default:
				return t.settings.language;
		}
	});

	/* ── Pairing (`?pair` from the avatar menu opens it) ──────────────────── */
	// Local state (not `$derived`): `refreshAll()` after a pairing reloads `data` and must not
	// close the dialog.
	// svelte-ignore state_referenced_locally
	let pairOpen = $state(data.pairOpen);
	$effect(() => {
		if (data.pairOpen) pairOpen = true;
	});
	function closePair() {
		pairOpen = false;
		// Drop `?pair` so a reload doesn't reopen the dialog.
		if (page.url.searchParams.has('pair')) {
			const url = new URL(page.url.href);
			url.searchParams.delete('pair');
			void goto(url.pathname + url.search, { replace: true, reset: false });
		}
	}

	/* ── Values ───────────────────────────────────────────────────────────── */
	const devices = $derived(
		[...data.devices].sort(
			(a, b) => Number(b.id === data.currentId) - Number(a.id === data.currentId)
		)
	);
	const now = $derived(new Date(data.now));
	const profile = $derived(data.profile ?? DEFAULT_PROFILE);
	const storedGoal = $derived(data.dailyGoalMin ?? null);
	const restMask = $derived(data.streak?.restMask ?? 0);
	const goalDuration = (min: number) => {
		const { h, m } = splitMinutes(min);
		return t.goal.duration(h, m);
	};
	const threshold = $derived(
		data.streak
			? { min: data.streak.threshold, fromGoal: data.streak.fromGoal }
			: streakThreshold(storedGoal)
	);
	const streakRule = $derived(
		threshold.fromGoal
			? t.settings.streakRuleGoal(goalDuration(threshold.min))
			: t.settings.streakRuleFallback(goalDuration(STREAK_FALLBACK_MIN))
	);
	const goalValue = $derived(
		storedGoal === null ? t.settings.goalOffValue : formatDurationMin(storedGoal, t.intl)
	);
	const restValue = $derived(
		restDaysSummary(restWeekdays(restMask), {
			name: (i) => weekdayName(i, 'short', t.intl),
			count: t.settings.restDaysCount,
			none: t.settings.restNone
		})
	);
	const pomodoroValue = $derived(
		t.settings.pomodoroValue(pomodoro.focusMin, pomodoro.shortBreakMin, pomodoro.longBreakMin)
	);

	/* ── Rejected input of the last action (echoed by the editors) ────────── */
	const profileFailure = $derived(
		form?.intent === 'profile' && 'errors' in form && form.errors && form.values
			? { values: form.values, errors: form.errors }
			: null
	);
	const goalFailure = $derived(
		form?.intent === 'goal' && 'error' in form && form.values
			? { values: form.values, error: form.error }
			: null
	);
	const streakFailure = $derived(
		form?.intent === 'streak' && 'error' in form && form.values
			? { values: form.values, error: form.error }
			: null
	);
	const pomodoroFailure = $derived(
		form?.intent === 'settings' && 'errors' in form && form.errors && form.values
			? { errors: form.errors, values: form.values }
			: null
	);
	const languageError = $derived(
		form?.intent === 'language' && 'error' in form ? (form.error ?? null) : null
	);
	const renameError = $derived(
		form?.intent === 'rename' && 'error' in form && form.error
			? { id: form.id ?? null, error: form.error }
			: null
	);

	const SECTION_TILE: Record<Exclude<SettingsSection, 'profile'>, string> = {
		goal: 'var(--tile-goal)',
		focus: 'var(--tile-focus)',
		notifications: 'var(--tile-notifications)',
		language: 'var(--tile-language)',
		devices: 'var(--tile-devices)',
		desktop: 'var(--tile-neutral)'
	};
	const SECTION_ICON = {
		goal: Target,
		focus: Timer,
		notifications: Bell,
		language: Globe,
		devices: MonitorSmartphone,
		desktop: Monitor
	};
	const sidebarSections = $derived(
		sections.filter((s): s is Exclude<SettingsSection, 'profile'> => s !== 'profile')
	);
</script>

<svelte:head><title>{t.settings.title} · libe</title></svelte:head>

<h1 class:pushed-hide={pushed}>{t.settings.title}</h1>

<div class="settings" class:pushed data-layout={layout}>
	{#if layout !== 'wide'}
		<div class="list" data-testid="settings-list">
			<GroupedList label={t.settings.profile}>
				<a
					class="profile-row press"
					href={settingsHref('profile')}
					aria-haspopup="dialog"
					data-testid="row-profile"
					onclick={(e) => {
						e.preventDefault();
						openSheet('profile');
					}}
				>
					<Avatar
						name={profile.displayName}
						color={profile.avatarColor}
						emoji={profile.avatarEmoji}
						size="lg"
					/>
					<span class="profile-text">
						<span class="profile-name">{profile.displayName ?? t.settings.profile}</span>
						<span class="profile-hint">{t.settings.profileRowHint}</span>
					</span>
					<ChevronRight size={16} class="chev" aria-hidden="true" />
				</a>
			</GroupedList>

			<GroupedList header={t.settings.yourDay}>
				<GroupedNavRow
					label={t.settings.dailyGoal}
					value={goalValue}
					tile="var(--tile-goal)"
					href={settingsHref('goal')}
					dialog
					testid="row-goal"
					onclick={() => openSheet('goal')}
				>
					{#snippet icon()}<Target size={16} strokeWidth={2} />{/snippet}
				</GroupedNavRow>
				<GroupedNavRow
					label={t.settings.restDays}
					value={restValue}
					tile="var(--tile-streak)"
					href={settingsHref('goal')}
					dialog
					testid="row-rest"
					onclick={() => openSheet('rest')}
				>
					{#snippet icon()}<Flame size={16} strokeWidth={2} />{/snippet}
				</GroupedNavRow>
			</GroupedList>

			<GroupedList header={t.settings.focusGroup} footer={t.settings.autoStartDesc}>
				<GroupedNavRow
					label={t.settings.pomodoro}
					value={pomodoroValue}
					tile="var(--tile-focus)"
					href={settingsHref('focus')}
					dialog
					testid="row-pomodoro"
					onclick={() => openSheet('pomodoro')}
				>
					{#snippet icon()}<Timer size={16} strokeWidth={2} />{/snippet}
				</GroupedNavRow>
				<AutoStartForm settings={pomodoro} />
			</GroupedList>

			<NotificationsGroup header={t.settings.thisDevice} fallbackFooter={t.settings.languageDesc}>
				<GroupedNavRow
					label={t.settings.language}
					value={t.settings.languageOptions[data.language]}
					tile="var(--tile-language)"
					href={settingsHref('language')}
					dialog
					testid="row-language"
					onclick={() => openSheet('language')}
				>
					{#snippet icon()}<Globe size={16} strokeWidth={2} />{/snippet}
				</GroupedNavRow>
			</NotificationsGroup>

			<DeviceList
				header={t.settings.devices}
				{devices}
				currentId={data.currentId}
				{now}
				{renameError}
				onpair={() => (pairOpen = true)}
			/>

			{#if tauri}
				<DesktopAppSection serverVersion={data.serverVersion} variant="group" />
			{/if}
		</div>
	{/if}

	{#if layout !== 'phone'}
		<div class="split">
			<nav class="sidebar" aria-label={t.settings.sectionsLabel}>
				<a
					class="me"
					href={settingsHref('profile')}
					aria-label={profile.displayName
						? `${t.settings.profile}: ${profile.displayName}`
						: t.settings.profile}
					aria-current={section === 'profile' ? 'page' : undefined}
					data-sveltekit-replacestate
					data-sveltekit-reset="false"
				>
					<Avatar
						name={profile.displayName}
						color={profile.avatarColor}
						emoji={profile.avatarEmoji}
						size="md"
					/>
					<span class="me-text">
						<span class="me-name">{profile.displayName ?? t.settings.profile}</span>
						<span class="me-hint">{t.settings.profileRowHint}</span>
					</span>
				</a>
				{#each sidebarSections as s (s)}
					{@const Icon = SECTION_ICON[s]}
					<a
						class="item"
						href={settingsHref(s)}
						aria-current={section === s ? 'page' : undefined}
						data-sveltekit-replacestate
						data-sveltekit-reset="false"
					>
						<SettingsTile color={SECTION_TILE[s]} size="sm">
							<Icon size={13} strokeWidth={2.25} />
						</SettingsTile>
						{t.settings.sections[s]}
					</a>
				{/each}
			</nav>

			<section
				class="pane"
				aria-labelledby={section === 'desktop' ? 'desktop-title' : 'pane-title'}
				data-section={section}
			>
				{#if pushed}
					<a class="back" href={settingsHref(null)}>
						<ChevronLeft size={18} aria-hidden="true" />{t.settings.title}
					</a>
				{/if}
				{#if section !== 'desktop'}
					<header class="pane-head">
						<h2 id="pane-title">{t.settings.sections[section]}</h2>
						<SaveStatus />
					</header>
				{/if}
				{#if section === 'profile'}
					<ProfileEditor {profile} failure={profileFailure} />
				{:else if section === 'goal'}
					<GoalEditor goalMin={storedGoal} failure={goalFailure} />
					<RestDaysEditor {restMask} failure={streakFailure} {streakRule} />
				{:else if section === 'focus'}
					<PomodoroEditor settings={pomodoro} failure={pomodoroFailure} />
					<GroupedList label={t.settings.autoStartRow} footer={t.settings.autoStartDesc}>
						<AutoStartForm settings={pomodoro} />
					</GroupedList>
				{:else if section === 'notifications'}
					<NotificationsGroup />
				{:else if section === 'language'}
					<LanguageEditor language={data.language} error={languageError} />
				{:else if section === 'devices'}
					<DeviceList
						{devices}
						currentId={data.currentId}
						{now}
						{renameError}
						onpair={() => (pairOpen = true)}
					/>
				{:else if section === 'desktop'}
					<DesktopAppSection serverVersion={data.serverVersion} variant="pane" />
				{/if}
			</section>
		</div>
	{/if}
</div>

{#if sheet}
	<Dialog bind:open={sheetOpen} onclosed={sheetClosed} title={sheetTitle}>
		<div class="sheet" data-testid="settings-sheet">
			{#if sheet === 'profile'}
				<ProfileEditor {profile} failure={profileFailure} />
			{:else if sheet === 'goal'}
				<GoalEditor goalMin={storedGoal} failure={goalFailure} heading={false} />
			{:else if sheet === 'rest'}
				<RestDaysEditor {restMask} failure={streakFailure} {streakRule} heading={false} />
			{:else if sheet === 'pomodoro'}
				<PomodoroEditor settings={pomodoro} failure={pomodoroFailure} heading={false} />
			{:else}
				<LanguageEditor language={data.language} error={languageError} heading={false} />
			{/if}
			<SaveStatus />
		</div>
	</Dialog>
{/if}

{#if pairOpen}
	<PairDeviceDialog onclose={closePair} />
{/if}

<style>
	.settings {
		min-width: 0;
		margin-top: var(--space-4);
	}
	/* ── Phones: one grouped list ── */
	.list {
		display: grid;
		gap: var(--space-6);
		max-width: var(--settings-pane-max);
		margin-inline: auto;
	}
	.profile-row {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		min-height: var(--grouped-row-h);
		padding: var(--space-3) var(--space-3) var(--space-3) var(--grouped-inset);
		color: var(--text);
		text-decoration: none;
		-webkit-tap-highlight-color: transparent;
		transition: background var(--dur) var(--ease);
	}
	@media (hover: hover) {
		.profile-row:hover {
			background: var(--surface-hover);
		}
	}
	.profile-row:active {
		background: var(--surface-2);
	}
	.profile-text {
		flex: 1;
		min-width: 0;
		display: grid;
		gap: 2px;
	}
	.profile-name {
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
		font-size: var(--fs-lg);
		font-weight: var(--fw-semibold);
	}
	.profile-hint {
		color: var(--text-muted);
		font-size: var(--fs-sm);
	}
	.profile-row :global(.chev) {
		flex: none;
		color: var(--text-faint);
	}

	/* ── Wider: sidebar + pane (macOS System Settings) ── */
	.split {
		display: grid;
		grid-template-columns: var(--settings-sidebar) minmax(0, 1fr);
		gap: var(--space-8);
		align-items: start;
	}
	.sidebar {
		position: sticky;
		top: calc(var(--nav-h) + var(--safe-top) + var(--space-4));
		display: grid;
		gap: 2px;
	}
	.me,
	.item {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		border-radius: var(--radius-md);
		color: var(--text-2);
		text-decoration: none;
		transition:
			background var(--dur) var(--ease),
			color var(--dur) var(--ease);
	}
	.me {
		margin-bottom: var(--space-3);
		padding: var(--space-2);
	}
	.item {
		min-height: 34px;
		padding: var(--space-1) var(--space-2);
		font-size: var(--fs-md);
	}
	@media (hover: hover) {
		.me:hover,
		.item:hover {
			background: var(--surface-hover);
			color: var(--text);
		}
	}
	.me[aria-current='page'],
	.item[aria-current='page'] {
		background: var(--sidebar-active-bg);
		color: var(--sidebar-active-ink);
	}
	.item[aria-current='page'] :global(.tile) {
		background: var(--sidebar-active-tile);
	}
	.me-text {
		min-width: 0;
		display: grid;
	}
	.me-name {
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
		color: inherit;
		font-weight: var(--fw-semibold);
	}
	.me-hint {
		font-size: var(--fs-xs);
		opacity: 0.75;
	}
	.pane {
		display: grid;
		gap: var(--space-6);
		max-width: var(--settings-pane-max);
		min-width: 0;
	}
	.pane-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-4);
	}
	.pane-head h2 {
		font-size: var(--fs-xl);
		font-weight: var(--fw-bold);
		letter-spacing: var(--tracking-title);
	}
	.back {
		display: none;
	}

	/* ── Sheets (phones) ── */
	.sheet {
		--grouped-bg: var(--grouped-bg-raised);
		--grouped-separator: var(--grouped-separator-raised);
		display: grid;
		gap: var(--space-5);
	}
	.sheet :global(.save-status) {
		justify-self: center;
	}

	/* Server-rendered for both layouts: CSS shows the right one until the page runs. */
	@media (max-width: 720px) {
		.settings[data-layout='both'] .split {
			display: none;
		}
		/* No JS + a section link: its form as a page with a way back. */
		.settings.pushed .list {
			display: none;
		}
		.settings.pushed .split {
			display: grid;
			grid-template-columns: minmax(0, 1fr);
		}
		.settings.pushed .sidebar {
			display: none;
		}
		.settings.pushed .back {
			display: inline-flex;
			align-items: center;
			color: var(--accent-text);
			text-decoration: none;
		}
		.pushed-hide {
			display: none;
		}
	}
	@media (min-width: 721px) {
		.settings[data-layout='both'] .list {
			display: none;
		}
	}
	@media (max-width: 1000px) and (min-width: 721px) {
		.split {
			grid-template-columns: 200px minmax(0, 1fr);
			gap: var(--space-6);
		}
	}
</style>
