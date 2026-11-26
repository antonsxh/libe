<script lang="ts">
	import { untrack } from 'svelte';
	import { browser } from '$app/env';
	import { formatMinutes, minuteOfDay } from '#lib/dates.ts';
	import { questColorVar } from '#lib/quest-colors.ts';
	import { dayWindow, layoutBlocks, nowWindow } from '#lib/timeline.ts';
	import type { BlockWithTask } from '#lib/server/blocks.ts';
	import { useI18n } from '#lib/i18n/context.svelte.ts';

	/** Blocks shorter than this only show their title on one line. */
	const SHORT_MIN = 45;

	let {
		blocks,
		/** Minute of the day when the page was rendered (server clock); then updated live. */
		now: serverNow,
		/**
		 * `now`: Home's compact view — an hour back, four ahead, stretched to the blocks still
		 * planned (`nowWindow`). `day`: 06:00 (or the first block) until midnight, scrolled to the
		 * now line inside its scrolling container (the daily-plan sheet).
		 */
		range = 'day',
		onedit
	}: {
		blocks: BlockWithTask[];
		now: number;
		range?: 'now' | 'day';
		onedit: (block: BlockWithTask) => void;
	} = $props();

	const t = useI18n();
	let placed = $derived(layoutBlocks(blocks));
	let nowMin = $state(untrack(() => serverNow));
	let cardEl: HTMLDivElement | undefined = $state();

	const win = $derived(range === 'now' ? nowWindow(blocks, nowMin) : dayWindow(blocks));
	const hours = $derived(win.endHour - win.startHour);
	const nowVisible = $derived(nowMin >= win.startHour * 60 && nowMin <= win.endHour * 60);
	/** Only blocks inside the window are drawn (and reachable by keyboard / screen readers). */
	const shown = $derived(
		placed.filter((p) => p.block.endMin > win.startHour * 60 && p.block.startMin < win.endHour * 60)
	);

	$effect(() => {
		if (!browser) return;
		const id = setInterval(() => (nowMin = minuteOfDay()), 30_000);
		return () => clearInterval(id);
	});

	// The whole day, once on mount: centre the now line (or the first block) in the scrolling
	// container around it (the sheet's body), after the sheet has been laid out.
	$effect(() => {
		if (!browser || range !== 'day' || !cardEl) return;
		const card = cardEl;
		const frame = requestAnimationFrame(() => {
			const target = card.querySelector('.now') ?? card.querySelector('.block');
			let box = card.parentElement;
			while (box && !/(auto|scroll)/.test(getComputedStyle(box).overflowY)) box = box.parentElement;
			if (!target || !box || box === document.documentElement) return;
			const offset = target.getBoundingClientRect().top - box.getBoundingClientRect().top;
			box.scrollTop += offset - box.clientHeight / 2;
		});
		return () => cancelAnimationFrame(frame);
	});
</script>

<div
	class="timeline"
	class:compact={range === 'now'}
	role="group"
	aria-label={t.home.dayTimeline}
	bind:this={cardEl}
>
	<div class="grid" style:--hours={hours} style:--from={win.startHour * 60}>
		<div class="labels" aria-hidden="true">
			{#each { length: hours } as _, i}
				<span class="hour" style:--h={i}>{win.startHour + i}:00</span>
			{/each}
		</div>
		<div class="track">
			{#each { length: hours } as _, i}
				<span class="line" style:--h={i}></span>
			{/each}

			{#each shown as p (p.block.id)}
				<button
					type="button"
					class="block event"
					class:short={p.block.endMin - p.block.startMin < SHORT_MIN}
					style:--q={questColorVar(p.block.questColor)}
					style:--s={p.block.startMin}
					style:--e={p.block.endMin}
					style:--col={p.column}
					style:--cols={p.columns}
					aria-label={t.home.editBlockAria(
						p.block.taskTitle,
						formatMinutes(p.block.startMin),
						formatMinutes(p.block.endMin)
					)}
					onclick={() => onedit(p.block)}
				>
					<span class="b-title">{p.block.taskTitle}</span>
					{#if p.block.endMin - p.block.startMin >= SHORT_MIN}
						<span class="b-time tabular">
							{formatMinutes(p.block.startMin)} – {formatMinutes(p.block.endMin)}
						</span>
					{/if}
				</button>
			{/each}

			{#if nowVisible}
				<div class="now" style:--now={nowMin} aria-hidden="true">
					<span class="now-dot"></span>
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	.timeline {
		--tl-hour: 52px;
		padding: var(--space-3) var(--space-2) var(--space-3) 0;
		overflow: hidden;
	}
	.timeline.compact {
		--tl-hour: 40px;
	}
	.grid {
		display: grid;
		grid-template-columns: 46px minmax(0, 1fr);
		position: relative;
	}

	.labels {
		position: relative;
		height: calc(var(--tl-hour) * var(--hours));
	}
	.hour {
		position: absolute;
		right: var(--space-3);
		top: calc(var(--h) * var(--tl-hour));
		transform: translateY(-50%);
		font-size: var(--fs-xs);
		font-variant-numeric: tabular-nums;
		color: var(--text-faint);
	}

	.track {
		position: relative;
		height: calc(var(--tl-hour) * var(--hours));
		background: var(--today-tint);
		border-radius: var(--radius-lg);
	}
	.line {
		position: absolute;
		left: 0;
		right: 0;
		top: calc(var(--h) * var(--tl-hour));
		border-top: 1px solid color-mix(in srgb, var(--border-strong) 30%, transparent);
	}

	.block {
		position: absolute;
		top: calc((var(--s) - var(--from)) * var(--tl-hour) / 60);
		height: calc((var(--e) - var(--s)) * var(--tl-hour) / 60 - 2px);
		left: calc(var(--col) * 100% / var(--cols) + 1px);
		width: calc(100% / var(--cols) - 3px);
		display: grid;
		align-content: start;
		gap: 0;
		padding: var(--space-1) var(--space-2);
		overflow: hidden;
		text-align: left;
		color: var(--text);
		cursor: pointer;
		z-index: 1;
		transition: filter var(--dur) var(--ease);
	}
	.block:hover {
		filter: brightness(1.18);
	}
	.block.short {
		align-content: center;
	}
	.b-title {
		font-size: var(--fs-xs);
		font-weight: var(--fw-medium);
		line-height: 1.3;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	.b-time {
		font-size: var(--fs-xs);
		line-height: 1.3;
		color: color-mix(in srgb, var(--q) var(--event-time-mix), var(--text));
	}

	/*
	 * The now line: `--now-line` (Apple Calendar's red, like the Calendar's) across the track,
	 * a dot on its left edge; the hour labels stay readable.
	 */
	.now {
		position: absolute;
		left: 0;
		right: 0;
		top: calc((var(--now) - var(--from)) * var(--tl-hour) / 60 - var(--now-line-w) / 2);
		height: var(--now-line-w);
		background: var(--now-line);
		z-index: 2;
		pointer-events: none;
	}
	.now-dot {
		position: absolute;
		left: calc(var(--now-dot) / -2);
		top: calc((var(--now-line-w) - var(--now-dot)) / 2);
		width: var(--now-dot);
		height: var(--now-dot);
		border-radius: 50%;
		background: var(--now-line);
	}
</style>
