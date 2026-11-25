<script lang="ts">
	import { Flag } from '@lucide/svelte';
	import ColorSwatches from '#lib/components/ColorSwatches.svelte';
	import GroupedList from '#lib/components/GroupedList.svelte';
	import GroupedRow from '#lib/components/GroupedRow.svelte';
	import SegmentedControl from '#lib/components/SegmentedControl.svelte';
	import WelcomeScreen from './WelcomeScreen.svelte';
	import { formatDurationMin } from '#lib/duration.ts';
	import { FIRST_STEP_DURATIONS, firstStepDurationChoice, welcomeHref } from '#lib/onboarding.ts';
	import type { WelcomeTask } from '#lib/server/onboarding.ts';
	import { useI18n } from '#lib/i18n/context.svelte.ts';

	/**
	 * Step 2: a grouped form — quest name and colour, then the first step's title and planned
	 * duration (segmented 25 min / 45 min / 1 h). Back from step 3 it shows the created pair,
	 * and Continue edits it.
	 */
	type Echo = {
		name?: string;
		color?: string;
		title?: string;
		duration?: string;
		errors?: Partial<Record<'name' | 'color' | 'title' | 'duration', string>>;
	};
	type Props = { task: WelcomeTask | null; echo: Echo | null; busy: boolean };
	let { task, echo, busy }: Props = $props();
	const t = useI18n();
	const q = $derived(t.onboarding.quest);
	const id = $props.id();

	// svelte-ignore state_referenced_locally — seeded once (echo after a failed submit, or the created pair).
	let name = $state(echo?.name ?? task?.questName ?? '');
	// svelte-ignore state_referenced_locally
	let color = $state(echo?.color ?? task?.questColor ?? 'teal');
	// svelte-ignore state_referenced_locally
	let title = $state(echo?.title ?? task?.title ?? '');
	// svelte-ignore state_referenced_locally
	let duration = $state(echo?.duration ?? String(firstStepDurationChoice(task?.durationMin)));
	const durations = $derived(
		FIRST_STEP_DURATIONS.map((min) => ({
			value: String(min),
			label: formatDurationMin(min, t.intl)
		}))
	);
	const errors = $derived(echo?.errors ?? {});
	const errorList = $derived(Object.values(errors).filter(Boolean));
</script>

<WelcomeScreen step={2} backHref={welcomeHref(1, task?.id)} title={q.title} lead={q.lead}>
	{#snippet symbol()}<Flag strokeWidth={1.5} aria-hidden="true" />{/snippet}
	<GroupedList header={q.section}>
		<GroupedRow>
			<input
				id="{id}-name"
				name="name"
				type="text"
				autocomplete="off"
				aria-label={q.name}
				aria-invalid={errors.name ? true : undefined}
				placeholder={q.namePlaceholder}
				bind:value={name}
			/>
		</GroupedRow>
		<GroupedRow label={q.color} stacked>
			<ColorSwatches name="color" label={q.color} bind:value={color} />
		</GroupedRow>
	</GroupedList>
	<GroupedList header={q.stepSection} footer={q.stepFooter}>
		<GroupedRow>
			<input
				id="{id}-title"
				name="title"
				type="text"
				autocomplete="off"
				aria-label={q.stepTitle}
				aria-invalid={errors.title ? true : undefined}
				placeholder={q.stepPlaceholder}
				bind:value={title}
			/>
		</GroupedRow>
		<GroupedRow label={q.duration} labelId="{id}-duration">
			<SegmentedControl
				name="duration"
				options={durations}
				labelledby="{id}-duration"
				bind:value={duration}
			/>
		</GroupedRow>
	</GroupedList>
	{#if errorList.length > 0}
		<div class="errors" role="alert">
			{#each errorList as message (message)}<p>{message}</p>{/each}
		</div>
	{/if}
	{#snippet actions()}
		<button class="cta" type="submit" disabled={busy}>{t.onboarding.continue}</button>
		<a class="plain" href={welcomeHref(3)}>{q.skip}</a>
	{/snippet}
</WelcomeScreen>

<style>
	.errors {
		display: grid;
		gap: var(--space-1);
		color: var(--danger);
		font-size: var(--fs-sm);
	}
</style>
