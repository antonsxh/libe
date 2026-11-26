<script lang="ts">
	import { untrack } from 'svelte';
	import { formatDayLabel, weekDays } from '#lib/dates.ts';
	import { dayDirection } from '#lib/day-view.ts';
	import { isPhoneViewport, motionEase, motionMs } from '#lib/motion.ts';
	import { swipeGesture } from '#lib/swipe-gesture.ts';
	import { useI18n } from '#lib/i18n/context.svelte.ts';

	/**
	 * Phones only (≤ 720px): Mon–Sun of the shown week as weekday initial + date number. The
	 * selected day sits on a pill that slides between days; today's number is in the accent colour; at most
	 * one dot per day (`marked`; overdue days — `alerts` — in the overdue colour). Links (`hrefFor`) work without JS; with JS `onselect`
	 * navigates in place (the page decides how). With `onweek`, swiping the strip sideways
	 * steps a week (left → next, right → previous; the page keeps the weekday) and the new
	 * week slides in from its side (`#lib/swipe.ts` rules, like the day swipe below it).
	 * With `month`, a line above it names the month and links back to "Today" (`todayLink`) —
	 * the phone's whole week navigation (AB3: no ‹ › arrows on phones).
	 */
	type Props = {
		/** Monday of the shown week. */
		monday: string;
		/** The day shown below the strip. */
		selected: string;
		today: string;
		/** Days that get the dot (e.g. open tasks, logged time). */
		marked?: ReadonlySet<string>;
		/** What the dot means, for screen readers ("open tasks"). */
		markLabel?: string;
		/** Days whose dot turns the overdue colour (past days with open tasks); wins over `marked`. */
		alerts?: ReadonlySet<string>;
		/** What an overdue dot means, for screen readers ("overdue tasks"). */
		alertLabel?: string;
		hrefFor: (day: string) => string;
		onselect: (day: string) => void;
		/** Step a week by swiping the strip; resolves once the navigation is done. */
		onweek?: (delta: -1 | 1) => Promise<unknown> | void;
		/** "November 2026" (`weekMonthLabel`) over the strip, with … */
		month?: string;
		/** … "Today": the current week, today selected (`todayHref`, `#lib/day-view.ts`). */
		todayLink?: string;
	};
	let {
		monday,
		selected,
		today,
		marked,
		markLabel,
		alerts,
		alertLabel,
		hrefFor,
		onselect,
		onweek,
		month,
		todayLink
	}: Props = $props();
	const t = useI18n();

	/* ── Week swipe ── */
	let strip = $state<HTMLElement | undefined>();
	/** Drawn offset (px) while following the finger / waiting for the new week. */
	let dx = $state(0);
	let tracking = $state(false);
	let stepping = false;

	async function release(step: -1 | 0 | 1) {
		tracking = false;
		if (step === 0 || !onweek) {
			dx = 0;
			return;
		}
		stepping = true;
		try {
			await onweek(step);
		} finally {
			if (stepping) {
				stepping = false;
				dx = 0;
			}
		}
	}
	const weekSwipe = swipeGesture({
		canStart: () => !!onweek && !stepping && isPhoneViewport(),
		onLock: () => (tracking = true),
		onFollow: (x) => (dx = x),
		onRelease: (step) => void release(step),
		onCancel: () => {
			tracking = false;
			dx = 0;
		}
	});

	/* The week changed (swipe, Today, a day step across Sunday): slide the days in from their side. */
	let shownWeek = untrack(() => monday);
	$effect(() => {
		const next = monday;
		const from = shownWeek;
		if (next === from) return;
		shownWeek = next;
		stepping = false;
		dx = 0;
		const dir = dayDirection(from, next);
		const ms = motionMs('--dur-pop');
		if (!strip || dir === 0 || ms === 0 || !isPhoneViewport()) return;
		const dist = parseFloat(getComputedStyle(strip).getPropertyValue('--day-slide')) || 40;
		strip.animate(
			[
				{ transform: `translateX(${dir * dist}px)`, opacity: 0.35 },
				{ transform: 'translateX(0)', opacity: 1 }
			],
			{ duration: ms, easing: motionEase('--ease-out') }
		);
	});

	const days = $derived(weekDays(monday));
	const index = $derived(Math.max(0, days.indexOf(selected)));

	function click(e: MouseEvent, day: string) {
		if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
		e.preventDefault();
		if (day !== selected) onselect(day);
	}
</script>

{#if month}
	<div class="month-row">
		<span class="month" aria-live="polite">{month}</span>
		{#if todayLink}
			<a
				class="today-link"
				href={todayLink}
				aria-current={days.includes(today) ? 'date' : undefined}
				data-sveltekit-reset="false"
			>
				{t.common.today}
			</a>
		{/if}
	</div>
{/if}

<nav
	class="strip"
	class:swipe={!!onweek}
	class:tracking
	aria-label={t.week.days}
	style:--i={index}
	style:transform={dx ? `translateX(${dx}px)` : undefined}
	bind:this={strip}
	{@attach weekSwipe}
>
	<span class="pill" aria-hidden="true"></span>
	{#each days as day (day)}
		{@const alert = alerts?.has(day) ?? false}
		{@const mark = alert || (marked?.has(day) ?? false)}
		<a
			class="day press"
			class:sel={day === selected}
			class:today={day === today}
			href={hrefFor(day)}
			data-day={day}
			aria-current={day === selected ? 'true' : undefined}
			aria-label={t.week.dayAria(
				formatDayLabel(day, { weekday: 'long', month: 'long', day: 'numeric' }, t.intl),
				day === today,
				alert ? (alertLabel ?? null) : mark ? (markLabel ?? null) : null
			)}
			data-sveltekit-reset="false"
			onclick={(e) => click(e, day)}
		>
			<span class="wd">{formatDayLabel(day, { weekday: 'narrow' }, t.intl)}</span>
			<span class="num tabular">{Number(day.slice(8))}</span>
			<span class="dot" class:on={mark} class:alert aria-hidden="true"></span>
		</a>
	{/each}
</nav>

<style>
	.strip,
	.month-row {
		display: none;
	}

	@media (max-width: 720px) {
		.month-row {
			display: flex;
			align-items: baseline;
			justify-content: space-between;
			gap: var(--space-3);
			padding: 0 var(--space-1);
			margin-bottom: var(--space-2);
		}
		.month {
			font-size: var(--fs-md);
			font-weight: var(--fw-semibold);
			color: var(--text);
		}
		.today-link {
			font-size: var(--fs-sm);
			color: var(--accent-text);
		}
		.strip {
			position: relative;
			display: grid;
			grid-template-columns: repeat(7, 1fr);
			height: var(--day-strip-h);
			margin-bottom: var(--space-4);
			transition: transform var(--dur-pop) var(--ease-out);
		}
		/* Swiping weeks: sideways moves come to us, vertical scrolling stays the browser's. */
		.strip.swipe,
		.strip.swipe * {
			touch-action: pan-y pinch-zoom;
			-webkit-user-drag: none;
		}
		.strip.tracking {
			transition: none;
			-webkit-user-select: none;
			user-select: none;
		}
		/* The selected day's pill: one element that slides from day to day. */
		.pill {
			position: absolute;
			inset: 0 auto 0 0;
			width: calc(100% / 7);
			padding: 0 var(--space-1);
			transform: translateX(calc(var(--i) * 100%));
			transition: transform var(--dur-pop) var(--ease-out);
			pointer-events: none;
		}
		.pill::before {
			content: '';
			display: block;
			height: 100%;
			border-radius: var(--radius-lg);
			background: var(--surface-2);
			box-shadow: inset 0 0 0 1px var(--border-strong);
		}
		.day {
			position: relative;
			display: grid;
			justify-items: center;
			align-content: center;
			gap: 2px;
			border-radius: var(--radius-lg);
			color: var(--text-muted);
			-webkit-tap-highlight-color: transparent;
			transition:
				color var(--dur) var(--ease),
				scale var(--dur-press) var(--ease-out);
		}
		.wd {
			font-size: var(--fs-xs);
			font-weight: var(--fw-medium);
			line-height: 1;
			color: var(--text-faint);
		}
		.num {
			font-size: var(--fs-md);
			font-weight: var(--fw-medium);
			line-height: 1.2;
		}
		.sel {
			color: var(--text);
		}
		.sel .wd {
			color: var(--text-muted);
		}
		.today .num {
			color: var(--accent-text);
		}
		.dot {
			width: var(--day-dot);
			height: var(--day-dot);
			border-radius: 50%;
		}
		.dot.on {
			background: var(--text-faint);
		}
		.sel .dot.on {
			background: var(--text-muted);
		}
		.dot.on.alert {
			background: var(--overdue);
		}
	}
</style>
