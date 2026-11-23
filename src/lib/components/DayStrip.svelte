<script lang="ts">
	import { formatDayLabel, weekDays } from '#lib/dates.ts';
	import { useI18n } from '#lib/i18n/context.svelte.ts';

	/**
	 * Phones only (≤ 720px): Mon–Sun of the shown week as weekday initial + date number. The
	 * selected day sits on a pill that slides between days; today's number is the accent; at most
	 * one dot per day (`marked`; overdue days — `alerts` — in the overdue colour). Links (`hrefFor`) work without JS; with JS `onselect`
	 * navigates in place (the page decides how).
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
	};
	let { monday, selected, today, marked, markLabel, alerts, alertLabel, hrefFor, onselect }: Props =
		$props();
	const t = useI18n();

	const days = $derived(weekDays(monday));
	const index = $derived(Math.max(0, days.indexOf(selected)));

	function click(e: MouseEvent, day: string) {
		if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
		e.preventDefault();
		if (day !== selected) onselect(day);
	}
</script>

<nav class="strip" aria-label={t.week.days} style:--i={index}>
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
	.strip {
		display: none;
	}

	@media (max-width: 720px) {
		.strip {
			position: relative;
			display: grid;
			grid-template-columns: repeat(7, 1fr);
			height: var(--day-strip-h);
			margin-bottom: var(--space-4);
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
			color: var(--accent);
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
