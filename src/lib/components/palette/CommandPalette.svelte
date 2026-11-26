<script lang="ts">
	import { tick } from 'svelte';
	import { goto, refreshAll } from '$app/navigation';
	import { page } from '$app/state';
	import {
		CalendarArrowDown,
		CalendarDays,
		ChartColumn,
		Clock,
		Flag,
		House,
		LoaderCircle,
		Pause,
		Play,
		Search,
		Settings,
		Square,
		SquareKanban,
		Timer,
		UserRound
	} from '@lucide/svelte';
	import { NAV_ITEMS } from '#lib/nav.ts';
	import { PROFILE_HREF } from '#lib/profile.ts';
	import { formatDayLabel } from '#lib/dates.ts';
	import { questColorVar } from '#lib/quest-colors.ts';
	import {
		SEARCH_DEBOUNCE_MS,
		filterByText,
		flattenGroups,
		isPaletteShortcut,
		normalizeQuery,
		stepIndex,
		taskHref,
		type Group
	} from '#lib/palette.ts';
	import type { SearchQuest, SearchResult, SearchTask } from '#lib/server/search.ts';
	import { useTimer } from '#lib/timer-store.svelte.ts';
	import { useI18n } from '#lib/i18n/context.svelte.ts';

	type Props = {
		/** The nav button: focus returns there when the palette was opened from it. */
		trigger?: HTMLElement;
		/** ⌘ (Apple) or Ctrl — decided on the client by the nav. */
		apple?: boolean;
		/** Whether the palette is open (read by the trigger's `aria-expanded`). */
		open?: boolean;
	};
	let { trigger, apple = false, open = $bindable(false) }: Props = $props();

	type Icon = typeof House;
	/** One option and what running it does. */
	type PaletteItem =
		| { key: string; kind: 'page'; label: string; href: string; icon: Icon }
		| { key: string; kind: 'action'; label: string; detail: string; icon: Icon; run: () => void }
		| { key: string; kind: 'quest'; label: string; quest: SearchQuest }
		| { key: string; kind: 'task'; label: string; task: SearchTask; today: string };

	const t = useI18n();
	const timer = useTimer();
	const id = $props.id();
	const listId = `${id}-list`;

	let dialog = $state<HTMLDialogElement>();
	let input = $state<HTMLInputElement>();
	let list = $state<HTMLDivElement>();
	let query = $state('');
	/** Key of the highlighted option; null/unknown → the first one. */
	let activeKey = $state<string | null>(null);
	/** Where focus goes back to on close (null: leave it, e.g. after navigating). */
	let returnTo: HTMLElement | null = null;

	/* ── Open / close ──────────────────────────────────────────────────────── */

	/**
	 * Open the palette. Synchronous on purpose: iOS Safari only shows the keyboard when the
	 * input is focused inside the tap's own event handler.
	 */
	export function show(from: HTMLElement | null = trigger ?? null) {
		if (!dialog || !input || dialog.open) return;
		returnTo = from;
		query = '';
		activeKey = null;
		measureViewport();
		dialog.showModal();
		input.focus();
		open = true;
	}

	/** Close; `restore` = put focus back where it came from. */
	export function hide(restore = true) {
		if (!dialog?.open) return;
		if (!restore) returnTo = null;
		dialog.close();
		closed();
	}

	/**
	 * Clean up right away — the `close` event arrives a task later, possibly after the palette
	 * was opened again (a quick second ⌘K) — so it only covers closes we didn't start.
	 */
	function closed() {
		if (!open) return;
		open = false;
		query = '';
		const target = returnTo;
		returnTo = null;
		if (target?.isConnected) target.focus();
	}

	function onclose() {
		if (!dialog?.open) closed();
	}

	/** ⌘K / Ctrl+K anywhere (also inside text fields): toggle. */
	function onWindowKey(e: KeyboardEvent) {
		if (e.isComposing || !isPaletteShortcut(e, apple)) return;
		if (dialog?.open) {
			e.preventDefault();
			hide();
			return;
		}
		// Another modal dialog (Log time…, a confirmation) keeps the keyboard.
		if (document.querySelector('dialog[open]')) return;
		e.preventDefault();
		const active = document.activeElement;
		show(active instanceof HTMLElement && active !== document.body ? active : (trigger ?? null));
	}

	/**
	 * iOS keeps the layout viewport when the keyboard opens; cap the panel to the *visible*
	 * height so the list scrolls above the keyboard instead of behind it.
	 */
	let viewportH = $state<number | null>(null);
	function measureViewport() {
		viewportH = window.visualViewport?.height ?? null;
	}
	$effect(() => {
		const vv = window.visualViewport;
		if (!open || !vv) return;
		vv.addEventListener('resize', measureViewport);
		return () => vv.removeEventListener('resize', measureViewport);
	});

	/* ── Server search ─────────────────────────────────────────────────────── */

	const q = $derived(normalizeQuery(query));
	let results = $state<SearchResult | null>(null);
	let loading = $state(false);
	let failed = $state(false);

	$effect(() => {
		const term = q;
		if (!term) {
			results = null;
			loading = false;
			failed = false;
			return;
		}
		loading = true;
		const ctrl = new AbortController();
		const timeout = setTimeout(async () => {
			try {
				const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`, {
					headers: { accept: 'application/json' },
					signal: ctrl.signal
				});
				if (!res.ok) throw new Error(String(res.status));
				const data = (await res.json()) as SearchResult;
				if (ctrl.signal.aborted) return;
				results = data;
				failed = false;
			} catch {
				if (ctrl.signal.aborted) return;
				results = null;
				failed = true;
			}
			loading = false;
		}, SEARCH_DEBOUNCE_MS);
		return () => {
			clearTimeout(timeout);
			ctrl.abort();
		};
	});

	/* ── Items ─────────────────────────────────────────────────────────────── */

	const PAGE_ICONS: Record<string, Icon> = {
		'/': House,
		'/plan': SquareKanban,
		'/calendar': CalendarDays,
		'/focus': Timer,
		'/quests': Flag,
		'/review': ChartColumn
	};

	const pages = $derived<PaletteItem[]>([
		...NAV_ITEMS.map((item) => ({
			key: `page:${item.href}`,
			kind: 'page' as const,
			label: t.nav[item.key],
			href: item.href,
			icon: PAGE_ICONS[item.href]
		})),
		{
			key: 'page:/settings',
			kind: 'page',
			label: t.nav.settings,
			href: '/settings',
			icon: Settings
		}
	]);

	/** Always there: jumps to Settings → Profile (a page item, listed under Actions). */
	const profileAction = $derived<PaletteItem>({
		key: 'action:profile',
		kind: 'page',
		label: t.palette.editProfile,
		href: PROFILE_HREF,
		icon: UserRound
	});

	/**
	 * Timer actions: only what the app already offers for the active timer (Focus screen,
	 * task cards) — then "Move overdue tasks to today" and "Edit profile".
	 */
	const actions = $derived.by<PaletteItem[]>(() => [
		...timerActions(),
		...overdueActions(),
		profileAction
	]);

	/** "Move overdue tasks to today" — only while there are any (root layout `overdueCount`). */
	function overdueActions(): PaletteItem[] {
		const n = page.data.overdueCount ?? 0;
		if (n <= 0) return [];
		return [
			{
				key: 'action:overdue',
				kind: 'action',
				label: t.overdue.paletteAction,
				detail: t.overdue.paletteDetail(n),
				icon: CalendarArrowDown,
				run: () => void overdueToToday()
			}
		];
	}

	/** Same server flow as Home's "All to today" (`rescheduleOverdue`), then fresh data everywhere. */
	async function overdueToToday() {
		const res = await fetch('/api/overdue', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ to: 'today', all: true })
		}).catch(() => null);
		if (res?.ok) await refreshAll().catch(() => {});
	}

	function timerActions(): PaletteItem[] {
		const view = timer.view;
		const active = timer.timer;
		if (!view || !active) return [];
		const task = { id: active.task.id, title: active.task.title };
		const detail = active.task.title;
		const out: PaletteItem[] = [];
		if (view.isFocus && view.status === 'running') {
			out.push({
				key: 'action:pause',
				kind: 'action',
				label: t.palette.pauseTimer,
				detail,
				icon: Pause,
				run: () => void timer.command('pause')
			});
		} else if (view.isFocus && view.status === 'paused') {
			out.push({
				key: 'action:resume',
				kind: 'action',
				label: t.palette.resumeTimer,
				detail,
				icon: Play,
				run: () => void timer.command('resume')
			});
		}
		out.push(
			{
				key: 'action:stop',
				kind: 'action',
				label: t.palette.stopTimer,
				detail,
				icon: Square,
				run: () => void timer.command('stop')
			},
			{
				key: 'action:log',
				kind: 'action',
				label: t.common.logTimeMenu,
				detail,
				icon: Clock,
				run: () => (timer.logTarget = task)
			}
		);
		return out;
	}

	const groups = $derived.by<Group<PaletteItem>[]>(() => {
		const label = (i: PaletteItem) => i.label;
		const all: Group<PaletteItem>[] = [
			{ key: 'pages', label: t.palette.pages, items: filterByText(pages, q, label) },
			{ key: 'actions', label: t.palette.actions, items: filterByText(actions, q, label) }
		];
		const r = results;
		if (q && r) {
			all.push(
				{
					key: 'quests',
					label: t.palette.quests,
					items: r.quests.map((quest) => ({
						key: `quest:${quest.id}`,
						kind: 'quest' as const,
						label: quest.name,
						quest
					}))
				},
				{
					key: 'tasks',
					label: t.palette.tasks,
					items: r.tasks.map((task) => ({
						key: `task:${task.id}`,
						kind: 'task' as const,
						label: task.title,
						task,
						today: r.today
					}))
				}
			);
		}
		return all.filter((g) => g.items.length > 0);
	});

	const flat = $derived(flattenGroups(groups));
	const activeIndex = $derived.by(() => {
		const i = flat.findIndex((item) => item.key === activeKey);
		return i >= 0 ? i : flat.length > 0 ? 0 : -1;
	});
	const activeItem = $derived(activeIndex >= 0 ? flat[activeIndex] : null);
	const optionId = (key: string) => `${id}-opt-${key.replace(/[^a-zA-Z0-9-]/g, '-')}`;

	function dayLabel(day: string | null, today: string): string {
		if (day === null) return t.common.backlog;
		if (day === today) return t.common.today;
		return formatDayLabel(day, { weekday: 'short', month: 'short', day: 'numeric' }, t.intl);
	}

	/* ── Running items ─────────────────────────────────────────────────────── */

	async function run(item: PaletteItem) {
		switch (item.kind) {
			case 'page':
				hide(false);
				await goto(item.href);
				break;
			case 'action':
				hide();
				item.run();
				break;
			case 'quest':
				hide(false);
				await goto(`/quests/${item.quest.id}`);
				break;
			case 'task': {
				hide(false);
				await goto(taskHref(item.task, item.today));
				await tick();
				revealTask(item.task.id);
				break;
			}
		}
	}

	/** Scroll the task's card/row into view (also inside the horizontally scrolling board). */
	function revealTask(taskId: string) {
		const el = document.querySelector<HTMLElement>(`[data-task="${CSS.escape(taskId)}"]`);
		if (!el) return;
		el.scrollIntoView({ block: 'center', inline: 'nearest' });
		el.animate([{ outline: '2px solid var(--accent)' }, { outline: '2px solid transparent' }], {
			duration: 1600,
			easing: 'ease-out'
		});
	}

	/** Same as ▶ on a task card: start a focus timer (or ask to switch), then open Focus. */
	async function startFocus(task: SearchTask) {
		hide(false);
		const ok = await timer.start(
			{ task: { id: task.id, title: task.title }, mode: 'focus' },
			{ navigate: true }
		);
		if (ok) await goto('/focus');
	}

	/* ── Keyboard ──────────────────────────────────────────────────────────── */

	function setActive(index: number) {
		const item = flat[index];
		if (!item) return;
		activeKey = item.key;
		tick().then(() =>
			list
				?.querySelector<HTMLElement>(`#${CSS.escape(optionId(item.key))}`)
				?.scrollIntoView({ block: 'nearest' })
		);
	}

	function onInputKey(e: KeyboardEvent) {
		if (e.isComposing) return;
		switch (e.key) {
			case 'ArrowDown':
			case 'ArrowUp':
				e.preventDefault();
				setActive(stepIndex(activeIndex, e.key === 'ArrowDown' ? 1 : -1, flat.length));
				break;
			case 'Home':
			case 'End':
				if (!e.ctrlKey && !e.metaKey) return; // keep caret movement in the input
				e.preventDefault();
				setActive(e.key === 'Home' ? 0 : flat.length - 1);
				break;
			case 'Enter':
				if (!activeItem) return;
				e.preventDefault();
				if (e.shiftKey && activeItem.kind === 'task') void startFocus(activeItem.task);
				else void run(activeItem);
				break;
			case 'Escape':
				e.preventDefault();
				hide();
				break;
		}
	}

	const status = $derived(
		failed
			? t.palette.failed
			: q && flat.length === 0
				? loading
					? t.palette.searching
					: t.palette.noResults
				: ''
	);
</script>

<svelte:window onkeydown={onWindowKey} />

<dialog
	bind:this={dialog}
	class="palette"
	aria-label={t.palette.title}
	style:--vvh={viewportH ? `${viewportH}px` : undefined}
	{onclose}
	onclick={(e) => {
		// Backdrop clicks land on the dialog element itself.
		if (e.target === dialog) hide();
	}}
>
	<div class="field">
		<span class="lead" aria-hidden="true">
			{#if loading}
				<span class="spin"><LoaderCircle size={18} strokeWidth={1.75} /></span>
			{:else}
				<Search size={18} strokeWidth={1.75} />
			{/if}
		</span>
		<input
			bind:this={input}
			bind:value={query}
			type="text"
			role="combobox"
			aria-label={t.palette.inputLabel}
			aria-expanded={flat.length > 0}
			aria-controls={listId}
			aria-autocomplete="list"
			aria-activedescendant={activeItem ? optionId(activeItem.key) : undefined}
			placeholder={t.palette.placeholder}
			autocomplete="off"
			autocapitalize="off"
			spellcheck="false"
			enterkeyhint="go"
			oninput={() => (activeKey = null)}
			onkeydown={onInputKey}
		/>
		<kbd class="esc">Esc</kbd>
		<!-- Touch: no Esc key, and the iOS keyboard leaves little backdrop to tap. -->
		<button type="button" class="cancel" onclick={() => hide()}>{t.common.cancel}</button>
	</div>

	<!-- Pointer presses keep focus in the input (and the iOS keyboard up). -->
	<div
		bind:this={list}
		class="list"
		id={listId}
		role="listbox"
		aria-label={t.palette.results}
		tabindex="-1"
		onmousedown={(e) => e.preventDefault()}
	>
		{#each groups as group (group.key)}
			<div class="group" role="group" aria-labelledby={`${id}-g-${group.key}`}>
				<div class="group-label" id={`${id}-g-${group.key}`} aria-hidden="true">
					{group.label}
				</div>
				{#each group.items as item (item.key)}
					{@const selected = activeItem?.key === item.key}
					<div
						class="option"
						class:selected
						role="option"
						id={optionId(item.key)}
						aria-selected={selected}
						aria-keyshortcuts={item.kind === 'task' ? 'Shift+Enter' : undefined}
						tabindex="-1"
						onpointermove={() => (activeKey = item.key)}
						onclick={() => void run(item)}
						onkeydown={() => {}}
					>
						{#if item.kind === 'page' || item.kind === 'action'}
							<span class="icon" aria-hidden="true">
								<item.icon size={16} strokeWidth={1.75} />
							</span>
							<span class="text">
								<span class="name">{item.label}</span>
								{#if item.kind === 'action'}<span class="detail">{item.detail}</span>{/if}
							</span>
						{:else if item.kind === 'quest'}
							<span class="icon emoji" aria-hidden="true">{item.quest.icon}</span>
							<span class="text">
								<span class="name">{item.label}</span>
							</span>
							<span class="hint" style:--q={questColorVar(item.quest.color)}>
								<span class="dot" aria-hidden="true"></span>{t.common.quest}
							</span>
						{:else}
							{@const task = item.task}
							<span class="icon" aria-hidden="true" style:--q={questColorVar(task.questColor)}>
								<span class="dot"></span>
							</span>
							<span class="text">
								<span class="name">{item.label}</span>
								<span class="detail">{task.questName ?? t.common.other}</span>
							</span>
							<span class="hint tabular">{dayLabel(task.day, item.today)}</span>
							<button
								type="button"
								class="go"
								tabindex="-1"
								aria-label={t.palette.startFocus(task.title)}
								title={t.palette.startFocus(task.title)}
								onclick={(e) => {
									e.stopPropagation();
									void startFocus(task);
								}}
							>
								<Play size={14} />
							</button>
						{/if}
					</div>
				{/each}
			</div>
		{/each}
	</div>

	<p class="status" role="status" class:empty={!status}>{status}</p>

	<footer class="keys" aria-hidden="true">
		<span><kbd>↑</kbd><kbd>↓</kbd> {t.palette.keys.move}</span>
		<span><kbd>↵</kbd> {t.palette.keys.open}</span>
		<span><kbd>⇧</kbd><kbd>↵</kbd> {t.palette.keys.focus}</span>
		<span><kbd>Esc</kbd> {t.palette.keys.close}</span>
	</footer>
</dialog>

<style>
	dialog.palette {
		/* Near the top third; the visible height (iOS keyboard) caps the panel. */
		--palette-top: 12vh;
		width: min(600px, calc(100vw - var(--space-8)));
		max-width: none;
		max-height: min(560px, calc(var(--vvh, 100dvh) - var(--palette-top) - var(--space-8)));
		margin: var(--palette-top) auto auto;
		padding: 0;
		overflow: hidden;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		color: var(--text);
		box-shadow: var(--shadow-pop);
	}
	dialog.palette[open] {
		display: flex;
		flex-direction: column;
	}
	dialog.palette::backdrop {
		background: var(--backdrop);
		backdrop-filter: blur(2px);
	}

	.field {
		flex: none;
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: 0 var(--space-4);
		border-bottom: 1px solid var(--border);
	}
	.lead {
		display: grid;
		color: var(--text-muted);
	}
	.spin {
		display: grid;
		animation: spin 0.9s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	input {
		flex: 1;
		min-width: 0;
		height: 52px;
		padding: 0;
		background: transparent;
		border: none;
		color: var(--text);
		font: inherit;
		font-size: var(--fs-md);
	}
	input::placeholder {
		color: var(--text-faint);
	}
	input:focus-visible {
		outline: none;
		box-shadow: none;
	}

	kbd {
		font-family: var(--font-sans);
		font-size: var(--fs-xs);
		color: var(--text-faint);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-sm);
		padding: 0 var(--space-1);
		min-width: 1.5em;
		text-align: center;
	}

	.cancel {
		display: none;
		flex: none;
		padding: 0 var(--space-2);
		background: none;
		border: 0;
		color: var(--accent-text);
		font: inherit;
		font-size: var(--fs-md);
	}

	.list {
		flex: 1 1 auto;
		min-height: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: var(--space-1) var(--space-2) var(--space-2);
	}
	.list:empty {
		display: none;
	}
	.list:focus-visible {
		outline: none;
	}

	.group-label {
		padding: var(--space-3) var(--space-2) var(--space-1);
		font-size: var(--fs-xs);
		font-weight: var(--fw-semibold);
		color: var(--text-muted);
	}

	.option {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		min-height: 40px;
		padding: var(--space-1) var(--space-2);
		border-radius: var(--radius-md);
		color: var(--text-2);
		cursor: pointer;
		user-select: none;
	}
	.option.selected {
		background: var(--surface-2);
		color: var(--text);
	}
	.icon {
		flex: none;
		display: grid;
		place-items: center;
		width: 24px;
		height: 24px;
		color: var(--text-muted);
	}
	.selected .icon {
		color: var(--text);
	}
	.emoji {
		font-size: var(--fs-md);
		line-height: 1;
	}
	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--q);
	}
	.text {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
	}
	.name,
	.detail {
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	.name {
		flex: 0 1 auto;
		font-size: var(--fs-md);
	}
	.detail {
		flex: 0 10 auto;
		min-width: 0;
		color: var(--text-muted);
		font-size: var(--fs-sm);
	}
	.hint {
		flex: none;
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		color: var(--text-muted);
		font-size: var(--fs-xs);
	}

	.go {
		flex: none;
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		padding: 0;
		background: transparent;
		border: 1px solid transparent;
		border-radius: var(--radius-sm);
		color: var(--text-faint);
	}
	.selected .go {
		color: var(--text-2);
		border-color: var(--border-strong);
	}
	.go:hover {
		color: var(--accent-text);
		background: var(--surface-hover);
	}

	.status {
		flex: none;
		padding: var(--space-4);
		color: var(--text-muted);
		font-size: var(--fs-sm);
		text-align: center;
	}
	.status.empty {
		display: none;
	}

	.keys {
		flex: none;
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1) var(--space-4);
		padding: var(--space-2) var(--space-4);
		border-top: 1px solid var(--border);
		color: var(--text-faint);
		font-size: var(--fs-xs);
	}
	.keys span {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
	}

	/* Touch: no keyboard legend, roomier rows. */
	@media (pointer: coarse) {
		.keys,
		.esc {
			display: none;
		}
		.cancel {
			display: block;
		}
		.option {
			min-height: var(--hit-min);
		}
	}

	/* Phones: full width at the top, clear of the notch; the list scrolls inside. */
	@media (max-width: 720px) {
		dialog.palette {
			--palette-top: calc(var(--safe-top) + var(--space-3));
			width: calc(100vw - var(--safe-left) - var(--safe-right) - 2 * var(--space-3));
			max-height: calc(var(--vvh, 100dvh) - var(--palette-top) - var(--space-3));
		}
		.text {
			flex-direction: column;
			align-items: stretch;
			gap: 0;
		}
		.name,
		.detail {
			flex: none;
		}
	}
</style>
