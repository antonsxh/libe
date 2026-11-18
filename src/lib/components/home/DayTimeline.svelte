<script lang="ts">
	import { untrack } from 'svelte';
	import { browser } from '$app/env';
	import { formatMinutes, minuteOfDay } from '#lib/dates.ts';
	import { questColorVar } from '#lib/quest-colors.ts';
	import { layoutBlocks } from '#lib/timeline.ts';
	import type { BlockWithTask } from '#lib/server/blocks.ts';

	/** Timeline window: 06:00 until midnight. */
	const START_HOUR = 6;
	const END_HOUR = 24;
	const HOUR_H = 52; // px per hour, matches --tl-hour
	/** Blocks shorter than this only show their title on one line. */
	const SHORT_MIN = 45;

	let {
		blocks,
		/** Minute of the day when the page was rendered (server clock); then updated live. */
		now: serverNow,
		onedit
	}: {
		blocks: BlockWithTask[];
		now: number;
		onedit: (block: BlockWithTask) => void;
	} = $props();

	let placed = $derived(layoutBlocks(blocks));
	let nowMin = $state(untrack(() => serverNow));
	let cardEl: HTMLDivElement | undefined = $state();

	const nowVisible = $derived(nowMin >= START_HOUR * 60 && nowMin <= END_HOUR * 60);

	$effect(() => {
		if (!browser) return;
		const id = setInterval(() => (nowMin = minuteOfDay()), 30_000);
		return () => clearInterval(id);
	});

	// Once on load: bring the now line (or the first block) into view.
	let scrolled = false;
	$effect(() => {
		if (!browser || scrolled || !cardEl) return;
		scrolled = true;
		const target = cardEl.querySelector('.now') ?? cardEl.querySelector('.block');
		if (!target) return;
		const r = target.getBoundingClientRect();
		if (r.top < 0 || r.bottom > window.innerHeight) target.scrollIntoView({ block: 'center' });
	});
</script>

<div class="timeline card" role="group" aria-label="Day timeline" bind:this={cardEl}>
	<div class="grid" style:--tl-hour={`${HOUR_H}px`}>
		<div class="labels" aria-hidden="true">
			{#each { length: END_HOUR - START_HOUR } as _, i}
				<span class="hour" style:--h={i}>{START_HOUR + i}:00</span>
			{/each}
		</div>
		<div class="track">
			{#each { length: END_HOUR - START_HOUR } as _, i}
				<span class="line" style:--h={i}></span>
			{/each}

			{#each placed as p (p.block.id)}
				<button
					type="button"
					class="block hatch"
					class:short={p.block.endMin - p.block.startMin < SHORT_MIN}
					style:--q={questColorVar(p.block.questColor)}
					style:--s={p.block.startMin}
					style:--e={p.block.endMin}
					style:--col={p.column}
					style:--cols={p.columns}
					aria-label="Edit time block: {p.block.taskTitle}, {formatMinutes(
						p.block.startMin
					)} to {formatMinutes(p.block.endMin)}"
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
		border-radius: var(--radius-xl);
		padding: var(--space-3) var(--space-2) var(--space-3) 0;
		overflow: hidden;
	}
	.grid {
		display: grid;
		grid-template-columns: 46px minmax(0, 1fr);
		position: relative;
	}

	.labels {
		position: relative;
		height: calc((var(--tl-hour)) * 18);
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
		height: calc(var(--tl-hour) * 18);
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
		top: calc((var(--s) - 360) * var(--tl-hour) / 60);
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
		color: var(--text-2);
	}

	.now {
		position: absolute;
		left: -46px;
		right: 0;
		top: calc((var(--now) - 360) * var(--tl-hour) / 60);
		border-top: 1px solid var(--accent);
		z-index: 2;
		pointer-events: none;
	}
	.now-dot {
		position: absolute;
		left: 0;
		top: -3.5px;
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--accent);
	}
</style>
