<script lang="ts">
	import { Target } from '@lucide/svelte';
	import GroupedList from '#lib/components/GroupedList.svelte';
	import WelcomeScreen from './WelcomeScreen.svelte';
	import { GOAL_OFF } from '#lib/daily-goal.ts';
	import { formatDurationMin } from '#lib/duration.ts';
	import { WELCOME_GOALS, welcomeHref } from '#lib/onboarding.ts';
	import { useI18n } from '#lib/i18n/context.svelte.ts';

	/** Step 1: the daily goal as an inset grouped choice list; "Set later" skips saving. */
	type Props = {
		/** Preselected form value (minutes or `off`). */
		initial: string;
		taskId: string | null;
		error?: string;
		busy: boolean;
	};
	let { initial, taskId, error, busy }: Props = $props();
	const t = useI18n();
	// svelte-ignore state_referenced_locally — the initial choice; the user's pick wins afterwards.
	let value = $state(initial);
	const options = $derived([
		...WELCOME_GOALS.map((min) => ({ value: String(min), label: formatDurationMin(min, t.intl) })),
		{ value: GOAL_OFF, label: t.onboarding.goal.none }
	]);
</script>

<WelcomeScreen
	step={1}
	backHref={welcomeHref(0, taskId)}
	title={t.onboarding.goal.title}
	lead={t.onboarding.goal.lead}
>
	{#snippet symbol()}<Target strokeWidth={1.5} aria-hidden="true" />{/snippet}
	<GroupedList label={t.onboarding.goal.label} name="goal" {options} bind:value />
	{#if error}<p class="error" role="alert">{error}</p>{/if}
	{#snippet actions()}
		<button class="cta" type="submit" disabled={busy}>{t.onboarding.continue}</button>
		<a class="plain" href={welcomeHref(2, taskId)}>{t.onboarding.goal.later}</a>
	{/snippet}
</WelcomeScreen>

<style>
	.error {
		color: var(--danger);
		font-size: var(--fs-sm);
	}
</style>
