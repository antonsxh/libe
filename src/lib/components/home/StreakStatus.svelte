<script lang="ts">
	import { Flame } from '@lucide/svelte';
	import { splitMinutes } from '#lib/daily-goal.ts';
	import { streakHint, type Streak } from '#lib/streak.ts';
	import { useI18n } from '#lib/i18n/context.svelte.ts';

	type Props = {
		/** The live streak (`pageStreak`). */
		streak: Streak;
		/** Display name for the milestone line (vocative only). */
		name: string | null;
	};
	let { streak, name }: Props = $props();
	const t = useI18n();

	const remaining = $derived.by(() => {
		const { h, m } = splitMinutes(streak.remainingMin);
		return t.goal.duration(h, m);
	});
	/** Only while it helps (`streakHint`): keep it, a rest day, or a start already under way. */
	const hint = $derived.by(() => {
		const kind = streakHint(streak);
		if (kind === 'keep') return t.streak.pending(remaining);
		if (kind === 'rest') return t.streak.rest;
		if (kind === 'start') return t.streak.startHint(remaining);
		return null;
	});
</script>

<!--
	The streak as one item of Home's meta line ("3-day streak"); the milestone replaces it on
	the day it is reached. What today still needs is the tooltip and is read after the count.
-->
<span class="streak" data-testid="streak" data-state={streak.state} title={hint ?? undefined}>
	{#if streak.milestone !== null}
		<span class="item milestone" role="status">
			<Flame size={13} aria-hidden="true" />
			<span>{t.streak.milestone(streak.milestone, name)}</span>
		</span>
	{:else}
		<span class="item" class:lit={streak.state === 'active'} data-testid="streak-chip">
			<Flame size={13} aria-hidden="true" />
			<span>
				{streak.state === 'none' ? t.streak.none : t.streak.count(streak.current)}
			</span>
			{#if streak.state === 'active'}<span class="sr-only">, {t.streak.todayDone}</span>{/if}
		</span>
		{#if hint}
			<span class="sr-only" data-testid="streak-hint">{hint}</span>
		{/if}
	{/if}
</span>

<style>
	.streak {
		display: inline-flex;
		align-items: center;
		min-width: 0;
	}
	.item {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		min-width: 0;
		white-space: nowrap;
	}
	.item :global(svg) {
		flex: none;
		color: var(--text-faint);
	}
	.lit,
	.milestone {
		color: var(--text);
	}
	.lit :global(svg),
	.milestone :global(svg) {
		color: var(--accent-text);
	}
	.milestone {
		white-space: normal;
	}
</style>
