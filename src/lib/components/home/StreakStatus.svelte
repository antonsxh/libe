<script lang="ts">
	import { Flame } from '@lucide/svelte';
	import { splitMinutes } from '#lib/daily-goal.ts';
	import type { Streak } from '#lib/streak.ts';
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
	const hint = $derived(
		streak.state === 'pending'
			? t.streak.pending(remaining)
			: streak.state === 'rest'
				? t.streak.rest
				: streak.state === 'none'
					? t.streak.startHint(remaining)
					: null
	);
</script>

<!-- Home header: "12-day streak" + what today still needs; the milestone replaces the chip. -->
<div class="streak" data-testid="streak" data-state={streak.state}>
	{#if streak.milestone !== null}
		<p class="chip milestone" role="status">
			<Flame size={16} aria-hidden="true" />
			<span>{t.streak.milestone(streak.milestone, name)}</span>
		</p>
	{:else}
		<p class="chip" class:lit={streak.state === 'active'} data-testid="streak-chip">
			<Flame size={16} aria-hidden="true" />
			<span>
				{streak.state === 'none' ? t.streak.none : t.streak.count(streak.current)}
			</span>
			{#if streak.state === 'active'}<span class="sr-only">, {t.streak.todayDone}</span>{/if}
		</p>
		{#if hint}
			<p class="hint tabular" data-testid="streak-hint">{hint}</p>
		{/if}
	{/if}
</div>

<style>
	.streak {
		display: grid;
		justify-items: start;
		gap: 4px;
		min-width: 0;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		max-width: 100%;
		padding: var(--space-1) var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-pill);
		background: var(--surface);
		color: var(--text-muted);
		font-size: var(--fs-sm);
		white-space: nowrap;
	}
	.chip :global(svg) {
		flex: none;
		color: var(--text-faint);
	}
	.chip.lit {
		border-color: var(--border-strong);
		color: var(--text);
	}
	.chip.lit :global(svg),
	.chip.milestone :global(svg) {
		color: var(--text);
	}
	.chip.milestone {
		border-color: var(--border-strong);
		background: var(--surface-2);
		color: var(--text);
		white-space: normal;
	}
	.hint {
		color: var(--text-faint);
		font-size: var(--fs-xs);
	}
</style>
