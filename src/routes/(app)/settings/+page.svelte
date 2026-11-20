<script lang="ts">
	import { onMount } from 'svelte';
	import { enhance, type SubmitFunction } from '$app/forms';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import {
		Globe,
		LogOut,
		Monitor,
		Pencil,
		QrCode,
		Settings2,
		Smartphone,
		Tablet,
		Trash2
	} from '@lucide/svelte';
	import Avatar from '#lib/components/Avatar.svelte';
	import Button from '#lib/components/Button.svelte';
	import ColorSwatches from '#lib/components/ColorSwatches.svelte';
	import EmojiPicker from '#lib/components/EmojiPicker.svelte';
	import Dialog from '#lib/components/Dialog.svelte';
	import Menu from '#lib/components/Menu.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import PomodoroSettingsDialog from '#lib/components/focus/PomodoroSettingsDialog.svelte';
	import DesktopAppSection from '#lib/components/settings/DesktopAppSection.svelte';
	import PairDeviceDialog from '#lib/components/settings/PairDeviceDialog.svelte';
	import { formatAgo, type DeviceKind } from '#lib/auth.ts';
	import { useTimer } from '#lib/timer-store.svelte.ts';
	import { useI18n } from '#lib/i18n/context.svelte.ts';
	import type { LanguageSetting } from '#lib/i18n/index.ts';
	import {
		AVATAR_STYLES,
		DEFAULT_PROFILE,
		PROFILE_ANCHOR,
		type AvatarStyle
	} from '#lib/profile.ts';
	import { AVATAR_EMOJIS, isSingleEmoji } from '#lib/emoji.ts';
	import {
		DAILY_GOAL_MAX,
		DAILY_GOAL_MINUTE_STEPS,
		DAILY_GOAL_PRESETS,
		GOAL_ANCHOR,
		GOAL_CUSTOM,
		GOAL_OFF,
		goalChoice,
		splitMinutes
	} from '#lib/daily-goal.ts';
	import {
		STREAK_ANCHOR,
		STREAK_FALLBACK_MIN,
		restWeekdays,
		streakThreshold
	} from '#lib/streak.ts';
	import { addDays, formatDayLabel } from '#lib/dates.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const timer = useTimer();
	const t = useI18n();
	const pomodoro = $derived(timer.settings);

	/** This device first, then by last activity (server order). */
	const devices = $derived(
		[...data.devices].sort(
			(a, b) => Number(b.id === data.currentId) - Number(a.id === data.currentId)
		)
	);
	const now = $derived(new Date(data.now));

	// Local state (not `$derived`): `refreshAll()` after a pairing reloads `data` and must not
	// close the dialog. `?pair` (avatar menu) opens it on navigation.
	// svelte-ignore state_referenced_locally
	let pairOpen = $state(data.pairOpen);
	$effect(() => {
		if (data.pairOpen) pairOpen = true;
	});
	let pomodoroOpen = $state(false);
	let editingId = $state<string | null>(null);
	let confirm = $state<{ id: string; name: string; self: boolean } | null>(null);
	let confirmOpen = $state(false);

	function closePair() {
		pairOpen = false;
		// Drop `?pair` so a reload doesn't reopen the dialog.
		if (page.url.searchParams.has('pair')) void goto('/settings', { replace: true, reset: false });
	}

	function kindIcon(kind: DeviceKind, name: string) {
		if (kind === 'tauri') return Monitor;
		if (kind === 'pwa') return /iPad|tablet/i.test(name) ? Tablet : Smartphone;
		return Globe;
	}

	const fmtDate = (d: Date) =>
		d.toLocaleDateString(t.intl, { month: 'short', day: 'numeric', year: 'numeric' });

	/* ── Profile ──────────────────────────────────────────────────────────── */
	const profileForm = $derived(
		form?.intent === 'profile' && form.errors && form.values
			? { errors: form.errors, values: form.values }
			: null
	);
	const profile = $derived(data.profile ?? DEFAULT_PROFILE);
	// The fields follow the stored profile (after a save: the normalised name), or echo the
	// rejected input; typing overrides them locally.
	let displayName = $derived(profileForm?.values.displayName ?? profile.displayName ?? '');
	let avatarColor = $derived(profileForm?.values.avatarColor ?? profile.avatarColor);
	let avatarStyle = $derived<AvatarStyle>(
		profileForm
			? profileForm.values.avatarStyle === 'emoji'
				? 'emoji'
				: 'initials'
			: profile.avatarEmoji
				? 'emoji'
				: 'initials'
	);
	let avatarEmoji = $derived(profileForm?.values.avatarEmoji ?? profile.avatarEmoji ?? '');
	/** Live preview: a valid emoji while "Emoji" is chosen, else the initials. */
	const previewEmoji = $derived.by(() => {
		const e = avatarEmoji.trim();
		return avatarStyle === 'emoji' && e && isSingleEmoji(e) ? e : null;
	});
	let profileSaved = $state(false);
	const onProfile: SubmitFunction = () => {
		profileSaved = false;
		return async ({ result, update }) => {
			// Reloads the layout data → the nav avatar shows the new profile.
			await update({ reset: false });
			profileSaved = result.type === 'success';
		};
	};

	/* ── Daily goal ───────────────────────────────────────────────────────── */
	const goalForm = $derived(
		form?.intent === 'goal' && 'error' in form && form.values
			? { error: form.error, values: form.values }
			: null
	);
	const storedGoal = $derived(data.dailyGoalMin ?? null);
	const goalDuration = (min: number) => {
		const { h, m } = splitMinutes(min);
		return t.goal.duration(h, m);
	};
	// Follow the stored goal (or the rejected input); the user's choices override locally.
	let goalPreset = $derived(goalForm?.values.preset ?? goalChoice(storedGoal));
	let goalHours = $derived(goalForm?.values.hours ?? String(splitMinutes(storedGoal ?? 60).h));
	let goalMinutes = $derived(goalForm?.values.minutes ?? String(splitMinutes(storedGoal ?? 60).m));
	let goalSaved = $state(false);
	function pickPreset(value: string) {
		// "Custom…" starts from the goal chosen so far.
		if (value === GOAL_CUSTOM && goalPreset !== GOAL_OFF && goalPreset !== GOAL_CUSTOM) {
			const { h, m } = splitMinutes(Number(goalPreset));
			goalHours = String(h);
			goalMinutes = String(m);
		}
		goalPreset = value;
		goalSaved = false;
	}
	const onGoal: SubmitFunction = () => {
		goalSaved = false;
		return async ({ result, update }) => {
			// Reloads the layout data → the nav avatar ring follows at once.
			await update({ reset: false });
			goalSaved = result.type === 'success';
		};
	};

	/* ── Streak ───────────────────────────────────────────────────────────── */
	/** A Monday — weekday names come from `Intl` (Monday first, like the app's weeks). */
	const REF_MONDAY = '2024-01-01';
	const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;
	const weekdayName = (i: number, weekday: 'short' | 'long') =>
		formatDayLabel(addDays(REF_MONDAY, i), { weekday }, t.intl);
	const streakForm = $derived(
		form?.intent === 'streak' && 'error' in form && form.values
			? { error: form.error, values: form.values }
			: null
	);
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
	// Follow the stored rest days (or the rejected input); toggling overrides locally.
	let restDays = $derived<number[]>(
		streakForm
			? streakForm.values.map(Number).filter((i) => Number.isInteger(i))
			: restWeekdays(data.streak?.restMask ?? 0)
	);
	let restSaved = $state(false);
	function toggleRest(i: number, on: boolean) {
		restDays = on ? [...restDays.filter((d) => d !== i), i] : restDays.filter((d) => d !== i);
		restSaved = false;
	}
	const onStreak: SubmitFunction = () => {
		restSaved = false;
		return async ({ result, update }) => {
			// Reloads the layout data → Home, the account menu and Review recount at once.
			await update({ reset: false });
			restSaved = result.type === 'success';
		};
	};

	/* ── Language ─────────────────────────────────────────────────────────── */
	// English and German first (each named in its own language), then the browser default.
	const LANGUAGE_ORDER: LanguageSetting[] = ['en', 'de', 'auto'];
	// Optimistic choice while the save is in flight; follows `data.language` afterwards.
	let language = $derived<LanguageSetting>(data.language);
	let languageForm = $state<HTMLFormElement | undefined>();
	/** Without JS a Save button submits the choice; with JS a change submits right away. */
	let hydrated = $state(false);
	onMount(() => (hydrated = true));
	const languageError = $derived(
		form && 'intent' in form && form.intent === 'language' && 'error' in form ? form.error : null
	);
	const onLanguage: SubmitFunction = () => {
		return async ({ update }) => {
			// Reloads all page data → the layout's `locale` switches the whole UI.
			await update({ reset: false });
		};
	};

	/** Rename inline: close the editor once the list is refreshed. */
	const onRename: SubmitFunction = () => {
		return async ({ result, update }) => {
			await update({ reset: false });
			if (result.type === 'success') editingId = null;
		};
	};

	/** Revoke: revoking this device redirects to /pair → full reload (cookie is gone). */
	const onRevoke: SubmitFunction = () => {
		return async ({ result, update }) => {
			if (result.type === 'redirect') {
				location.assign(result.location);
				return;
			}
			await update();
			confirmOpen = false;
		};
	};

	$effect(() => {
		if (!confirmOpen) confirm = null;
	});

	const renameError = $derived(
		form && 'intent' in form && form.intent === 'rename' && 'error' in form ? form : null
	);
</script>

<svelte:head><title>{t.settings.title} · libe</title></svelte:head>

<PageHeader title={t.settings.title} subtitle={t.settings.subtitle} />

<div class="sections">
	<section class="card section" id={PROFILE_ANCHOR} aria-labelledby="profile-title">
		<div class="section-head">
			<div>
				<h2 id="profile-title" class="label">{t.settings.profile}</h2>
				<p class="muted desc">{t.settings.profileDesc}</p>
			</div>
		</div>
		<form class="profile" method="POST" action="?/profile" use:enhance={onProfile}>
			<Avatar name={displayName} color={avatarColor} emoji={previewEmoji} size="lg" />
			<div class="profile-fields">
				<div class="field">
					<label class="field-label" for="profile-name">{t.settings.displayName}</label>
					<input
						id="profile-name"
						name="displayName"
						value={displayName}
						oninput={(e) => {
							displayName = e.currentTarget.value;
							profileSaved = false;
						}}
						placeholder={t.settings.displayNamePlaceholder}
						autocomplete="name"
						aria-invalid={profileForm?.errors.displayName ? 'true' : undefined}
						aria-describedby="profile-name-hint"
					/>
					{#if profileForm?.errors.displayName}
						<span class="error" role="alert" id="profile-name-hint">
							{profileForm.errors.displayName}
						</span>
					{:else}
						<span class="hint muted" id="profile-name-hint">{t.settings.displayNameHint}</span>
					{/if}
				</div>
				<div class="field">
					<span class="field-label" id="avatar-style-label">{t.settings.avatarStyle}</span>
					<div class="segments" role="radiogroup" aria-labelledby="avatar-style-label">
						{#each AVATAR_STYLES as style (style)}
							<label class:on={avatarStyle === style}>
								<input
									type="radio"
									name="avatarStyle"
									value={style}
									checked={avatarStyle === style}
									onchange={() => {
										avatarStyle = style;
										profileSaved = false;
									}}
								/>
								<span>{t.settings.avatarStyles[style]}</span>
							</label>
						{/each}
					</div>
				</div>
				{#if avatarStyle === 'emoji' || !hydrated}
					<div class="field">
						<span class="field-label" id="avatar-emoji-label">{t.settings.avatarEmoji}</span>
						<EmojiPicker
							name="avatarEmoji"
							bind:value={
								() => avatarEmoji,
								(v) => {
									avatarEmoji = v;
									profileSaved = false;
								}
							}
							labelledby="avatar-emoji-label"
							describedby="avatar-emoji-hint"
							suggestions={AVATAR_EMOJIS}
							groupLabel={t.settings.suggestedEmoji}
							pickLabel={t.settings.useAvatarEmoji}
							placeholder="🦊"
							invalid={Boolean(profileForm?.errors.avatarEmoji)}
						/>
						{#if profileForm?.errors.avatarEmoji}
							<span class="error" role="alert" id="avatar-emoji-hint">
								{profileForm.errors.avatarEmoji}
							</span>
						{:else}
							<span class="hint muted" id="avatar-emoji-hint">{t.settings.avatarEmojiHint}</span>
						{/if}
					</div>
				{/if}
				<div class="field">
					<span class="field-label">{t.settings.avatarColour}</span>
					<ColorSwatches
						name="avatarColor"
						bind:value={
							() => avatarColor,
							(c) => {
								avatarColor = c;
								profileSaved = false;
							}
						}
						label={t.settings.avatarColour}
					/>
					{#if profileForm?.errors.avatarColor}
						<span class="error" role="alert">{profileForm.errors.avatarColor}</span>
					{/if}
				</div>
				<div class="profile-actions">
					<Button variant="primary" type="submit">{t.settings.saveProfile}</Button>
					<span class="saved muted" role="status">
						{profileSaved ? t.settings.profileSaved : ''}
					</span>
				</div>
			</div>
		</form>
	</section>

	<section class="card section" id={GOAL_ANCHOR} aria-labelledby="goal-title">
		<div class="section-head">
			<div>
				<h2 id="goal-title" class="label">{t.settings.dailyGoal}</h2>
				<p class="muted desc">{t.settings.dailyGoalDesc}</p>
			</div>
		</div>
		<form class="goal" method="POST" action="?/goal" use:enhance={onGoal}>
			<div class="goal-fields">
				<div class="field">
					<label class="field-label" for="goal-preset">{t.settings.goal}</label>
					<select
						id="goal-preset"
						name="preset"
						value={goalPreset}
						onchange={(e) => pickPreset(e.currentTarget.value)}
						aria-describedby="goal-hint"
						aria-invalid={goalForm ? 'true' : undefined}
					>
						<option value={GOAL_OFF}>{t.settings.goalOff}</option>
						{#each DAILY_GOAL_PRESETS as min (min)}
							<option value={String(min)}>{goalDuration(min)}</option>
						{/each}
						<option value={GOAL_CUSTOM}>{t.settings.goalCustom}</option>
					</select>
				</div>
				{#if goalPreset === GOAL_CUSTOM || !hydrated}
					<div class="field">
						<label class="field-label" for="goal-hours">{t.settings.goalHours}</label>
						<input
							id="goal-hours"
							class="goal-hours"
							name="hours"
							type="number"
							inputmode="numeric"
							min="0"
							max={DAILY_GOAL_MAX / 60}
							step="1"
							value={goalHours}
							oninput={(e) => {
								goalHours = e.currentTarget.value;
								goalSaved = false;
							}}
						/>
					</div>
					<div class="field">
						<label class="field-label" for="goal-minutes">{t.settings.goalMinutes}</label>
						<select
							id="goal-minutes"
							name="minutes"
							value={goalMinutes}
							onchange={(e) => {
								goalMinutes = e.currentTarget.value;
								goalSaved = false;
							}}
						>
							{#each DAILY_GOAL_MINUTE_STEPS as m (m)}
								<option value={String(m)}>{m}</option>
							{/each}
						</select>
					</div>
				{/if}
			</div>
			{#if goalForm}
				<p class="error" role="alert" id="goal-hint">{goalForm.error}</p>
			{:else}
				<p class="hint muted" id="goal-hint">{t.settings.goalHint}</p>
			{/if}
			<div class="profile-actions">
				<Button variant="primary" type="submit">{t.settings.saveGoal}</Button>
				<span class="saved muted" role="status">{goalSaved ? t.settings.goalSaved : ''}</span>
			</div>
		</form>
	</section>

	<section class="card section" id={STREAK_ANCHOR} aria-labelledby="streak-title">
		<div class="section-head">
			<div>
				<h2 id="streak-title" class="label">{t.settings.streak}</h2>
				<p class="muted desc" data-testid="streak-rule">{streakRule}</p>
				<p class="muted desc">{t.settings.streakRuleHistory}</p>
			</div>
		</div>
		<form class="goal" method="POST" action="?/streak" use:enhance={onStreak}>
			<fieldset class="rest" aria-describedby="rest-hint">
				<legend class="field-label">{t.settings.restDays}</legend>
				<div class="weekdays">
					{#each WEEKDAYS as i (i)}
						{@const on = restDays.includes(i)}
						<label class="weekday" class:on title={weekdayName(i, 'long')}>
							<input
								type="checkbox"
								name="restDay"
								value={String(i)}
								checked={on}
								aria-label={weekdayName(i, 'long')}
								onchange={(e) => toggleRest(i, e.currentTarget.checked)}
							/>
							<span aria-hidden="true">{weekdayName(i, 'short')}</span>
						</label>
					{/each}
				</div>
			</fieldset>
			{#if streakForm}
				<p class="error" role="alert" id="rest-hint">{streakForm.error}</p>
			{:else}
				<p class="hint muted" id="rest-hint">{t.settings.restDaysHint}</p>
			{/if}
			<div class="profile-actions">
				<Button variant="primary" type="submit">{t.settings.saveRestDays}</Button>
				<span class="saved muted" role="status">
					{restSaved ? t.settings.restDaysSaved : ''}
				</span>
			</div>
		</form>
	</section>

	<section class="card section" aria-labelledby="devices-title">
		<header class="section-head">
			<div>
				<h2 id="devices-title" class="label">{t.settings.devices}</h2>
				<p class="muted desc">{t.settings.devicesDesc}</p>
			</div>
			<Button variant="primary" onclick={() => (pairOpen = true)}>
				<QrCode size={16} />
				{t.settings.pairNew}
			</Button>
		</header>

		<ul class="devices">
			{#each devices as device (device.id)}
				{@const Icon = kindIcon(device.kind, device.name)}
				{@const self = device.id === data.currentId}
				<li class="device" class:self>
					<span class="icon" aria-hidden="true"><Icon size={18} strokeWidth={1.75} /></span>
					<div class="info">
						{#if editingId === device.id}
							<form class="rename" method="POST" action="?/rename" use:enhance={onRename}>
								<input type="hidden" name="id" value={device.id} />
								<!-- svelte-ignore a11y_autofocus -->
								<input
									name="name"
									value={device.name}
									maxlength="60"
									required
									autofocus
									aria-label={t.settings.deviceName}
									onkeydown={(e) => e.key === 'Escape' && (editingId = null)}
								/>
								<Button variant="primary" size="sm" type="submit">{t.common.save}</Button>
								<Button variant="ghost" size="sm" onclick={() => (editingId = null)}>
									{t.common.cancel}
								</Button>
							</form>
							{#if renameError && renameError.id === device.id}
								<p class="error" role="alert">{renameError.error}</p>
							{/if}
						{:else}
							<p class="name">
								<span class="name-text">{device.name}</span>
								{#if self}<span class="badge">{t.settings.thisDevice}</span>{/if}
							</p>
						{/if}
						<p class="meta muted">
							<span>{t.settings.kinds[device.kind]}</span>
							<span aria-hidden="true">·</span>
							<span>{t.settings.paired(fmtDate(device.pairedAt))}</span>
							<span aria-hidden="true">·</span>
							<span>
								{#if self}{t.settings.activeNow}{:else if device.lastSeenAt}{t.settings.lastSeen(
										formatAgo(device.lastSeenAt, now, t)
									)}{:else}{t.settings.neverSeen}{/if}
							</span>
						</p>
					</div>
					<Menu label={t.common.actionsFor(device.name)}>
						{#snippet children(close)}
							<button
								type="button"
								class="item"
								role="menuitem"
								onclick={() => {
									close();
									editingId = device.id;
								}}
							>
								<Pencil size={14} />
								{t.settings.rename}
							</button>
							<button
								type="button"
								class="item danger"
								role="menuitem"
								onclick={() => {
									close();
									confirm = { id: device.id, name: device.name, self };
									confirmOpen = true;
								}}
							>
								{#if self}<LogOut size={14} />
									{t.settings.signOut}{:else}<Trash2 size={14} />
									{t.settings.revokeMenu}{/if}
							</button>
						{/snippet}
					</Menu>
				</li>
			{/each}
		</ul>

		<form class="signout" method="POST" action="/settings?/signout">
			<Button variant="ghost" type="submit">
				<LogOut size={16} />
				{t.settings.signOutDevice}
			</Button>
		</form>
	</section>

	<section class="card section" aria-labelledby="focus-title">
		<header class="section-head">
			<div>
				<h2 id="focus-title" class="label">{t.settings.focusTimer}</h2>
				<p class="muted desc tabular">
					{t.settings.pomodoroSummary(
						pomodoro.focusMin,
						pomodoro.shortBreakMin,
						pomodoro.longBreakMin,
						pomodoro.longBreakEvery
					)}{pomodoro.autoStart ? t.settings.autoStart : ''}
				</p>
			</div>
			<Button variant="secondary" onclick={() => (pomodoroOpen = true)}>
				<Settings2 size={16} />
				{t.settings.pomodoroSettings}
			</Button>
		</header>
	</section>

	<section class="card section" aria-labelledby="language-title">
		<form
			class="section-head"
			method="POST"
			action="?/language"
			use:enhance={onLanguage}
			bind:this={languageForm}
		>
			<div>
				<h2 id="language-title" class="label">{t.settings.language}</h2>
				<p class="muted desc">{t.settings.languageDesc}</p>
				{#if languageError}<p class="error" role="alert">{languageError}</p>{/if}
			</div>
			<div class="language">
				<div class="segments" role="radiogroup" aria-labelledby="language-title">
					{#each LANGUAGE_ORDER as option (option)}
						<label class:on={language === option}>
							<input
								type="radio"
								name="language"
								value={option}
								checked={language === option}
								lang={option === 'auto' ? undefined : option}
								onchange={() => {
									language = option;
									languageForm?.requestSubmit();
								}}
							/>
							<span lang={option === 'auto' ? undefined : option}>
								{t.settings.languageOptions[option]}
							</span>
						</label>
					{/each}
				</div>
				{#if !hydrated}
					<Button variant="secondary" size="sm" type="submit">{t.common.save}</Button>
				{/if}
			</div>
		</form>
	</section>

	<DesktopAppSection serverVersion={data.serverVersion} />
</div>

{#if pairOpen}
	<PairDeviceDialog onclose={closePair} />
{/if}

{#if pomodoroOpen}
	<PomodoroSettingsDialog
		settings={pomodoro}
		form={form && 'intent' in form && form.intent === 'settings' ? form : null}
		onclose={() => (pomodoroOpen = false)}
	/>
{/if}

{#if confirm}
	<Dialog
		bind:open={confirmOpen}
		title={confirm.self ? t.settings.confirmSignOutTitle : t.settings.confirmRevokeTitle}
	>
		<p class="confirm-text">
			<strong>{confirm.name}</strong>{confirm.self
				? t.settings.confirmSignOut
				: t.settings.confirmRevoke}
		</p>
		<form method="POST" action="?/revoke" use:enhance={onRevoke} class="confirm-actions">
			<input type="hidden" name="id" value={confirm.id} />
			<Button variant="secondary" onclick={() => (confirmOpen = false)}>{t.common.cancel}</Button>
			<Button variant="primary" type="submit">
				{confirm.self ? t.settings.signOut : t.settings.revoke}
			</Button>
		</form>
	</Dialog>
{/if}

<style>
	.sections {
		display: grid;
		gap: var(--space-6);
		max-width: 880px;
	}
	.section {
		padding: var(--space-6);
		border-radius: var(--radius-xl);
		min-width: 0;
	}
	.section-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: var(--space-4);
	}
	.section-head > div {
		flex: 1 1 280px;
		min-width: 0;
	}
	.desc {
		margin-top: var(--space-2);
		font-size: var(--fs-sm);
		max-width: 56ch;
	}

	.devices {
		list-style: none;
		margin: var(--space-6) 0 0;
		padding: 0;
		border-top: 1px solid var(--border);
	}
	.device {
		display: flex;
		align-items: center;
		gap: var(--space-4);
		padding: var(--space-4) 0;
		border-bottom: 1px solid var(--border);
		min-width: 0;
	}
	.icon {
		flex: none;
		display: grid;
		place-items: center;
		width: 40px;
		height: 40px;
		border-radius: var(--radius-md);
		background: var(--surface-2);
		color: var(--text-muted);
	}
	.self .icon {
		color: var(--accent);
	}
	.info {
		flex: 1;
		min-width: 0;
		display: grid;
		gap: var(--space-1);
	}
	.name {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-width: 0;
		font-weight: var(--fw-medium);
	}
	.name-text {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.badge {
		flex: none;
		padding: 1px var(--space-2);
		border: 1px solid color-mix(in srgb, var(--accent) 45%, transparent);
		border-radius: var(--radius-pill);
		color: var(--accent);
		font-size: var(--fs-xs);
		font-weight: var(--fw-medium);
	}
	.meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0 var(--space-2);
		font-size: var(--fs-sm);
	}
	.rename {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
	}
	.rename input {
		flex: 1 1 180px;
		min-width: 0;
		height: 32px;
		padding: 0 var(--space-3);
		background: var(--bg);
		border: 1px solid var(--accent);
		border-radius: var(--radius-md);
		font-size: var(--fs-md);
	}
	.error {
		color: var(--danger);
		font-size: var(--fs-sm);
	}
	/* Profile */
	.sections > section {
		scroll-margin-top: calc(var(--nav-h) + var(--safe-top) + var(--space-4));
	}
	.profile {
		display: flex;
		align-items: flex-start;
		gap: var(--space-6);
		margin-top: var(--space-6);
	}
	.profile-fields {
		flex: 1;
		min-width: 0;
		display: grid;
		gap: var(--space-5);
	}
	.field {
		display: grid;
		gap: var(--space-2);
		min-width: 0;
	}
	.field-label {
		font-size: var(--fs-sm);
		font-weight: var(--fw-medium);
		color: var(--text-2);
	}
	.field input {
		width: 100%;
		max-width: 360px;
		height: 40px;
		padding: 0 var(--space-3);
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		color: var(--text);
		font-size: var(--fs-md);
	}
	.field input:hover,
	.field select:hover {
		border-color: var(--border-strong);
	}
	.field select {
		height: 40px;
		padding: 0 var(--space-3);
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		color: var(--text);
		font-size: var(--fs-md);
	}
	.field select[aria-invalid='true'] {
		border-color: var(--danger);
	}
	.goal {
		display: grid;
		gap: var(--space-3);
		margin-top: var(--space-6);
	}
	.goal-fields {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: var(--space-4);
	}
	.rest {
		display: grid;
		gap: var(--space-2);
		min-width: 0;
		margin: 0;
		padding: 0;
		border: none;
	}
	.rest legend {
		padding: 0;
		margin-bottom: var(--space-2);
	}
	/* Seven equal toggles in one row, down to phone width (≥ 44 px tall on touch). */
	.weekdays {
		display: grid;
		grid-template-columns: repeat(7, minmax(0, 56px));
		gap: var(--space-2);
	}
	.weekday {
		position: relative;
		display: grid;
		place-items: center;
		min-width: 0;
		height: 36px;
		padding: 0 var(--space-1);
		border: 1px solid var(--border);
		border-radius: var(--radius-pill);
		background: var(--bg);
		color: var(--text-muted);
		font-size: var(--fs-sm);
		cursor: pointer;
		user-select: none;
		transition:
			color var(--dur) var(--ease),
			border-color var(--dur) var(--ease),
			background var(--dur) var(--ease);
	}
	.weekday:hover {
		border-color: var(--border-strong);
		color: var(--text);
	}
	.weekday.on {
		border-color: color-mix(in srgb, var(--accent) 55%, transparent);
		background: var(--accent-soft);
		color: var(--accent);
		font-weight: var(--fw-medium);
	}
	.weekday:has(:focus-visible) {
		box-shadow: var(--ring);
	}
	.weekday input {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}
	@media (pointer: coarse) {
		.weekday {
			height: var(--hit-min);
		}
	}
	@media (max-width: 600px) {
		.weekdays {
			gap: var(--space-1);
		}
	}
	.field .goal-hours {
		width: 96px;
	}
	.field input[aria-invalid='true'] {
		border-color: var(--danger);
	}
	.hint {
		font-size: var(--fs-xs);
	}
	.profile-actions {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--space-3);
	}
	.saved {
		font-size: var(--fs-sm);
	}

	.signout {
		margin-top: var(--space-4);
		display: flex;
		justify-content: flex-end;
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

	.language {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--space-3);
		max-width: 100%;
	}
	/* Segmented control (same look as the desktop app's update track). */
	.segments {
		display: inline-flex;
		justify-self: start;
		flex-wrap: wrap;
		max-width: 100%;
		padding: 3px;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--bg);
	}
	.segments label {
		position: relative;
		padding: var(--space-2) var(--space-4);
		border-radius: var(--radius-sm);
		color: var(--text-muted);
		font-size: var(--fs-sm);
		cursor: pointer;
		white-space: nowrap;
	}
	.segments label.on {
		background: var(--surface-2);
		color: var(--text);
		font-weight: var(--fw-medium);
	}
	.segments label:has(:focus-visible) {
		box-shadow: var(--ring);
	}
	.segments input {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}

	.confirm-text {
		color: var(--text-2);
	}
	.confirm-actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-2);
		margin-top: var(--space-6);
	}

	@media (max-width: 720px) {
		.sections > section {
			scroll-margin-top: calc(var(--nav-h-compact) + var(--safe-top) + var(--space-4));
		}
	}

	@media (max-width: 600px) {
		.section {
			padding: var(--space-5) var(--space-4);
		}
		.profile {
			flex-direction: column;
		}
		.section-head :global(.btn) {
			width: 100%;
		}
	}
</style>
