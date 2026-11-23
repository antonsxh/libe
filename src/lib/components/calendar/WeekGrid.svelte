<script lang="ts">
	import { untrack } from 'svelte';
	import { CircleCheck } from '@lucide/svelte';
	import {
		gridStartHour,
		layoutDay,
		sessionSpanLabel,
		slotMinute,
		wallClock,
		wallMinutes,
		type CalendarDay,
		type CalendarSession,
		type CalendarWeek
	} from '#lib/calendar.ts';
	import { formatMinutes, todayISO } from '#lib/dates.ts';
	import { formatDurationMs } from '#lib/duration.ts';
	import { isPhoneViewport } from '#lib/motion.ts';
	import { questColorVar } from '#lib/quest-colors.ts';
	import { layoutBlocks } from '#lib/timeline.ts';
	import type { BlockWithTask } from '#lib/server/blocks.ts';
	import { useI18n } from '#lib/i18n/context.svelte.ts';

	type Props = {
		days: CalendarDay[];
		week: CalendarWeek;
		/** Planned blocks of the week (empty unless "Show plan" is on). */
		blocks: BlockWithTask[];
		timeZone: string;
		/** Server clock (ms), refreshed by the page. */
		now: number;
		onedit: (session: CalendarSession) => void;
		/** Empty slot clicked: day + minute-of-day (rounded down to 15 min). */
		onlog: (day: string, minute: number) => void;
		/**
		 * Phones (≤ 720px): the one day shown full width (day view); the other columns are
		 * hidden by CSS, so the grid renders the same on the server and needs no JS to switch.
		 */
		selected?: string;
	};
	let { days, week, blocks, timeZone, now, onedit, onlog, selected }: Props = $props();
	const t = useI18n();

	/** Must match `--cal-hour` (px per hour) — click positions are converted with it. */
	const HOUR_PX = 50;
	/** Vertical padding above the first hour line (room for its label). */
	const PAD_PX = 10;
	/** Entries are drawn at least this many minutes tall (one line of text). */
	const MIN_DRAWN_MIN = 20;
	/** Entries drawn at least this tall also show their time span. */
	const TALL_MIN = 42;

	const startHour = $derived(
		gridStartHour([
			...week.segments.flat().map((s) => s.startMin),
			...blocks.map((b) => b.startMin)
		])
	);
	const hours = $derived(24 - startHour);
	const placed = $derived(week.segments.map((segs) => layoutDay(segs, MIN_DRAWN_MIN)));
	const planned = $derived(days.map((d) => layoutBlocks(blocks.filter((b) => b.day === d.day))));

	const nowDay = $derived(todayISO(timeZone, new Date(now)));
	const nowMin = $derived(wallMinutes(now, timeZone));
	const showNow = $derived(days.some((d) => d.day === nowDay) && nowMin >= startHour * 60);

	const colorOf = (s: CalendarSession) => questColorVar(s.questColor ?? 'slate');

	function slotClick(e: MouseEvent, d: CalendarDay) {
		// Keyboard activation (detail 0) has no pointer position: 30 min before now on
		// today, else 9:00.
		if (e.detail === 0) {
			const fallback = d.day === nowDay ? Math.max(0, Math.floor((nowMin - 30) / 15) * 15) : 540;
			onlog(d.day, fallback);
			return;
		}
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		onlog(d.day, slotMinute(e.clientY - rect.top - PAD_PX, HOUR_PX, startHour));
	}

	/**
	 * Scroll target once per shown week: ~1 h before now in the current week, else the first
	 * entry. Phones (day view): once per shown day — now on today, else that day's first
	 * entry, else 8:00.
	 */
	let scroller = $state<HTMLDivElement | undefined>();
	const scrollKey = $derived(`${days[0]?.day ?? ''}|${selected ?? ''}`);
	$effect(() => {
		void scrollKey;
		const el = scroller;
		if (!el) return;
		untrack(() => {
			const i = days.findIndex((d) => d.day === selected);
			const dayView = i >= 0 && isPhoneViewport();
			const segs = dayView ? week.segments[i] : week.segments.flat();
			const nowHere = dayView ? selected === nowDay && showNow : showNow;
			const first = Math.min(...segs.map((s) => s.startMin));
			const target = nowHere ? nowMin - 60 : Number.isFinite(first) ? first - 30 : 8 * 60;
			el.scrollTop = Math.max(0, ((target - startHour * 60) * HOUR_PX) / 60);
		});
	});
</script>

<div
	class="cal card"
	class:day-view={!!selected}
	role="group"
	aria-label={t.calendar.grid}
	bind:this={scroller}
	style:--days={days.length}
	style:--start={startHour * 60}
	style:--hours={hours}
	style:--pad={`${PAD_PX}px`}
>
	<div class="grid">
		<div class="corner" aria-hidden="true"></div>
		{#each days as d, i (d.day)}
			<div
				class="head"
				class:today={d.isToday}
				class:sel={d.day === selected}
				style:grid-column={i + 2}
			>
				<span class="wd">{d.weekday} <span class="num">{d.dayNum}</span></span>
				<span class="total tabular" data-testid="day-total">
					{formatDurationMs(week.dayMs[i], t.intl)}
				</span>
			</div>
		{/each}

		<div class="gutter" aria-hidden="true">
			{#each { length: hours } as _, h (h)}
				<span class="hour tabular" style:--h={h}>{startHour + h}:00</span>
			{/each}
		</div>

		{#each days as d, i (d.day)}
			<div
				class="col"
				class:today={d.isToday}
				class:sel={d.day === selected}
				data-day={d.day}
				style:grid-column={i + 2}
			>
				<button
					type="button"
					class="slot"
					aria-label={t.calendar.logTimeOn(d.label)}
					onclick={(e) => slotClick(e, d)}
				></button>

				{#each planned[i] as p (p.block.id)}
					<div
						class="plan"
						style:--q={questColorVar(p.block.questColor ?? 'slate')}
						style:--t={p.block.startMin}
						style:--b={p.block.endMin}
						style:--col={p.column}
						style:--cols={p.columns}
						title={t.calendar.planned(p.block.taskTitle)}
					>
						<span class="plan-title">{p.block.taskTitle}</span>
					</div>
				{/each}

				{#each placed[i] as p (p.item.key)}
					{@const s = p.item.session}
					{@const tall = p.bottom - p.top >= TALL_MIN}
					{@const span = sessionSpanLabel(s, timeZone, t.intl)}
					{#if s.active}
						<a
							class="entry dot-grid active"
							class:tall
							class:paused={s.paused}
							href="/focus"
							data-session={s.id}
							style:--q={colorOf(s)}
							style:--t={p.top}
							style:--b={p.bottom}
							style:--col={p.column}
							style:--cols={p.columns}
							aria-label={t.calendar.activeAria(
								!!s.paused,
								s.taskTitle,
								wallClock(s.startedAt, timeZone)
							)}
						>
							<span class="title"><span class="rec" aria-hidden="true"></span>{s.taskTitle}</span>
							{#if tall}
								<span class="time tabular">
									{wallClock(s.startedAt, timeZone)} – {s.paused
										? t.calendar.paused
										: t.calendar.now}
								</span>
							{/if}
						</a>
					{:else}
						<button
							type="button"
							class="entry dot-grid"
							class:tall
							data-session={s.id}
							style:--q={colorOf(s)}
							style:--t={p.top}
							style:--b={p.bottom}
							style:--col={p.column}
							style:--cols={p.columns}
							aria-label={t.calendar.editAria(s.taskTitle, span)}
							title="{s.taskTitle} · {span}"
							onclick={() => onedit(s)}
						>
							<span class="title">{s.taskTitle}</span>
							{#if tall}<span class="time tabular">{span}</span>{/if}
							{#if s.taskDone}
								<span class="done" aria-label={t.calendar.done}><CircleCheck size={11} /></span>
							{/if}
						</button>
					{/if}
				{/each}
			</div>
		{/each}

		{#if showNow}
			<div class="now-layer" class:elsewhere={!!selected && selected !== nowDay} aria-hidden="true">
				<div class="now" style:--now={nowMin} title={formatMinutes(Math.floor(nowMin))}>
					<span class="now-dot"></span>
				</div>
			</div>
		{/if}
	</div>
</div>

<style>
	.cal {
		position: relative;
		height: max(420px, calc(100dvh - var(--nav-h) - 230px));
		overflow: auto;
		border-radius: var(--radius-xl);
		overscroll-behavior: contain;
		scrollbar-color: var(--border-strong) transparent;
	}
	.grid {
		display: grid;
		grid-template-columns: var(--cal-gutter) repeat(var(--days), minmax(var(--cal-col-min), 1fr));
		grid-template-rows: auto calc(var(--pad) + var(--hours) * var(--cal-hour) + var(--space-2));
		min-width: calc(var(--cal-gutter) + var(--days) * var(--cal-col-min));
	}

	/* ── Sticky header row + hour gutter ───────────────────── */
	.corner,
	.head {
		position: sticky;
		top: 0;
		grid-row: 1;
		background: var(--surface);
		border-bottom: 1px solid var(--border);
	}
	.corner {
		left: 0;
		grid-column: 1;
		z-index: 5;
	}
	.head {
		z-index: 4;
		display: grid;
		justify-items: center;
		gap: 2px;
		padding: var(--space-3) var(--space-2) var(--space-2);
		border-left: 1px solid var(--border);
	}
	.head.today {
		background: linear-gradient(var(--today-tint), var(--today-tint)), var(--surface);
	}
	.wd {
		font-size: var(--fs-md);
		font-weight: var(--fw-medium);
		color: var(--text-2);
		white-space: nowrap;
	}
	.num {
		color: var(--text-faint);
		font-weight: var(--fw-regular);
	}
	.head.today .wd {
		color: var(--text);
	}
	.head.today .num {
		color: var(--accent);
	}
	.total {
		font-size: var(--fs-xs);
		color: var(--text-faint);
		white-space: nowrap;
	}
	.head.today .total {
		color: var(--text-muted);
	}

	.gutter {
		position: sticky;
		left: 0;
		z-index: 3;
		grid-row: 2;
		grid-column: 1;
		background: var(--surface);
	}
	.hour {
		position: absolute;
		right: var(--space-2);
		top: calc(var(--pad) + var(--h) * var(--cal-hour));
		transform: translateY(-50%);
		font-size: var(--fs-xs);
		color: var(--text-faint);
	}

	/* ── Day columns ───────────────────────────────────────── */
	.col {
		position: relative;
		grid-row: 2;
		border-left: 1px solid var(--border);
		background-image: linear-gradient(to bottom, var(--grid-line) 1px, transparent 1px);
		background-size: 100% var(--cal-hour);
		background-position: 0 var(--pad);
		background-repeat: repeat-y;
		min-width: 0;
	}
	.col.today {
		background-color: var(--today-tint);
	}
	.slot {
		position: absolute;
		inset: 0;
		width: 100%;
		border: none;
		background: transparent;
		cursor: copy;
		z-index: 0;
	}
	.slot:hover {
		background: color-mix(in srgb, var(--text) 2%, transparent);
	}
	/*
	 * No touch press scale here: the tapped time is read from the slot's rect, and a whole
	 * day column shrinking under the finger moved it by ~20 px (13:22 became 13:00).
	 */
	.slot:active {
		scale: none;
		filter: none;
		background: color-mix(in srgb, var(--text) 4%, transparent);
	}

	/* Shared placement: --t/--b = drawn range (minutes of day), --col/--cols = overlap lane. */
	.entry,
	.plan {
		position: absolute;
		top: calc(var(--pad) + (var(--t) - var(--start)) * var(--cal-hour) / 60 + 1px);
		height: calc((var(--b) - var(--t)) * var(--cal-hour) / 60 - 2px);
		left: calc(var(--col) * 100% / var(--cols) + 2px);
		width: calc(100% / var(--cols) - 4px);
	}

	.plan {
		z-index: 1;
		border: 1px dashed color-mix(in srgb, var(--q) 70%, transparent);
		border-radius: var(--radius-xs);
		padding: 1px var(--space-2);
		overflow: hidden;
		pointer-events: none;
	}
	.plan-title {
		display: block;
		font-size: var(--fs-xs);
		line-height: 1.3;
		color: var(--text-faint);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.entry {
		z-index: 2;
		display: flex;
		flex-direction: column;
		justify-content: center;
		min-width: 0;
		padding: 0 var(--space-2);
		overflow: hidden;
		text-align: left;
		color: var(--text);
		cursor: pointer;
		transition: filter var(--dur) var(--ease);
	}
	.entry.tall {
		justify-content: flex-start;
		padding-top: var(--space-1);
	}
	.entry:hover {
		filter: brightness(1.2);
		z-index: 3;
	}
	.entry:focus-visible {
		z-index: 3;
	}
	.title {
		display: block;
		min-width: 0;
		font-size: var(--fs-xs);
		font-weight: var(--fw-medium);
		line-height: 1.25;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.time {
		font-size: var(--fs-xs);
		line-height: 1.3;
		color: var(--text-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.done {
		position: absolute;
		right: 3px;
		bottom: 2px;
		display: grid;
		color: color-mix(in srgb, var(--q) 80%, var(--text));
	}
	.entry:has(.done) .title {
		padding-right: var(--space-3);
	}

	/* The running/paused timer: accent outline, pulsing dot. */
	.entry.active {
		border-color: var(--accent);
		box-shadow: 0 0 0 1px var(--accent);
	}
	.rec {
		display: inline-block;
		width: 6px;
		height: 6px;
		margin-right: var(--space-1);
		border-radius: 50%;
		background: var(--danger);
		vertical-align: 1px;
		animation: rec 2s ease-in-out infinite;
	}
	.paused .rec {
		background: var(--text-faint);
		animation: none;
	}
	@keyframes rec {
		50% {
			opacity: 0.35;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.rec {
			animation: none;
		}
	}

	/* ── Now line across the whole week ────────────────────── */
	.now-layer {
		position: relative;
		grid-row: 2;
		grid-column: 2 / -1;
		pointer-events: none;
		z-index: 3;
	}
	.now {
		position: absolute;
		left: 0;
		right: 0;
		top: calc(var(--pad) + (var(--now) - var(--start)) * var(--cal-hour) / 60);
		border-top: 1px solid var(--accent);
	}
	.now-dot {
		position: absolute;
		left: -4px;
		top: -4.5px;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--accent);
	}

	/*
	 * Phones: the day view — only the selected day, full width (no sideways scrolling); its
	 * header is one compact line (day + total); the now line only on today.
	 */
	@media (max-width: 720px) {
		.cal.day-view {
			height: max(
				360px,
				calc(100dvh - var(--nav-h-compact) - var(--tabbar-h) - var(--tabbar-lift) - 248px)
			);
			overflow-x: hidden;
			border-radius: var(--radius-lg);
			touch-action: pan-y pinch-zoom;
		}
		.day-view .grid {
			grid-template-columns: var(--cal-gutter) minmax(0, 1fr);
			min-width: 0;
		}
		.day-view .head:not(.sel),
		.day-view .col:not(.sel) {
			display: none;
		}
		.day-view .head.sel,
		.day-view .col.sel {
			grid-column: 2 !important;
		}
		/* One day at a time: the strip already marks today, a tinted full column is noise. */
		.day-view .head.today {
			background: var(--surface);
		}
		.day-view .col.today {
			background-color: transparent;
		}
		.day-view .head {
			display: flex;
			align-items: baseline;
			justify-content: space-between;
			padding: var(--space-2) var(--space-3);
		}
		.day-view .total {
			font-size: var(--fs-sm);
		}
		.day-view .now-layer.elsewhere {
			display: none;
		}
	}
</style>
