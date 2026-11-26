<script lang="ts">
	import { Check, ChevronRight } from '@lucide/svelte';
	import { formatDurationMin } from '#lib/duration.ts';
	import { fadeScale, pop } from '#lib/motion.ts';
	import { useI18n } from '#lib/i18n/context.svelte.ts';

	type Props = {
		/** Tasks planned for today (all done). */
		total: number;
		/** Minutes logged today, live (Home's meta line value). */
		loggedMin: number;
		/** The daily goal in minutes (null = none set). */
		goalMin: number | null;
		/** Plan with tomorrow selected. */
		tomorrowHref: string;
	};
	let { total, loggedMin, goalMin, tomorrowHref }: Props = $props();
	const t = useI18n();

	/** "4 tasks · 3 h 5 min logged · daily goal reached" — only the facts that are true. */
	const facts = $derived(
		[
			t.home.allDone.tasks(total),
			loggedMin > 0 ? t.home.allDone.logged(formatDurationMin(loggedMin, t.intl)) : null,
			goalMin !== null && goalMin > 0 && loggedMin >= goalMin ? t.home.allDone.goalReached : null
		]
			.filter((fact) => fact !== null)
			.join(' · ')
	);
</script>

<!--
	Home's "All done" moment (O4a, variant A): takes Next up's place while today had tasks and
	none is open (`isAllDone`). The check pops once when the card appears after the last tick
	(Svelte intros don't run on first paint; nothing under reduced motion). No confetti.
-->
<section class="card done" aria-labelledby="all-done-title" data-testid="all-done" in:fadeScale>
	<span class="check" aria-hidden="true" in:pop>
		<Check size={30} strokeWidth={3} />
	</span>
	<h2 class="title" id="all-done-title">{t.home.allDone.title}</h2>
	<p class="facts tabular" data-testid="all-done-facts">{facts}</p>
	<a class="tomorrow hit-target" href={tomorrowHref}>
		{t.home.allDone.planTomorrow}<ChevronRight size={16} aria-hidden="true" />
	</a>
</section>

<style>
	.done {
		display: grid;
		justify-items: center;
		gap: var(--space-2);
		padding: var(--space-6) var(--space-5) var(--space-5);
		border-color: var(--border-strong);
		border-radius: var(--radius-xl);
		text-align: center;
	}
	.check {
		display: grid;
		place-items: center;
		width: var(--done-check);
		height: var(--done-check);
		margin-bottom: var(--space-2);
		border-radius: 50%;
		background: var(--success);
		color: var(--success-ink);
		box-shadow: 0 0 0 var(--done-halo-w) var(--success-halo);
	}
	.title {
		font-size: var(--fs-lg);
		font-weight: var(--fw-semibold);
		letter-spacing: -0.01em;
	}
	.facts {
		max-width: 40ch;
		color: var(--text-muted);
		font-size: var(--fs-sm);
		text-wrap: balance;
	}
	.tomorrow {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		margin-top: var(--space-1);
		color: var(--accent-text);
		font-size: var(--fs-md);
		font-weight: var(--fw-medium);
	}
	@media (hover: hover) {
		.tomorrow:hover {
			text-decoration: underline;
		}
	}
</style>
