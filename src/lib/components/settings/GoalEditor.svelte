<script lang="ts">
	import { enhance } from '$app/forms';
	import GroupedList from '#lib/components/GroupedList.svelte';
	import GroupedRow from '#lib/components/GroupedRow.svelte';
	import NoJsSave from './NoJsSave.svelte';
	import { createAutosave } from '#lib/autosave.svelte.ts';
	import { formAction } from '#lib/form-action.ts';
	import {
		DAILY_GOAL_MAX,
		DAILY_GOAL_MINUTE_STEPS,
		GOAL_CUSTOM,
		GOAL_OFF,
		goalChoice,
		splitMinutes
	} from '#lib/daily-goal.ts';
	import { formatDurationMin } from '#lib/duration.ts';
	import { WELCOME_GOALS } from '#lib/onboarding.ts';
	import { useI18n } from '#lib/i18n/context.svelte.ts';

	/**
	 * Settings → Daily goal: the first-run flow's choices, "Custom duration…" (hours + minutes
	 * rows) and "No daily goal". A choice saves at once; the custom duration when a field is
	 * committed. The server's `parseDailyGoal` decides.
	 */
	type Failure = { values: { preset: string; hours: string; minutes: string }; error: string };
	/** `heading: false` in a sheet (its title says it). */
	type Props = { goalMin: number | null; failure: Failure | null; heading?: boolean };
	let { goalMin, failure, heading = true }: Props = $props();
	const t = useI18n();
	const id = $props.id();

	// Follow the stored goal (or the rejected input); the user's choices override locally.
	let preset = $derived(failure?.values.preset ?? goalChoice(goalMin, WELCOME_GOALS));
	let hours = $derived(failure?.values.hours ?? String(splitMinutes(goalMin ?? 60).h));
	let minutes = $derived(failure?.values.minutes ?? String(splitMinutes(goalMin ?? 60).m));
	const customStored = $derived(
		goalMin !== null && goalChoice(goalMin, WELCOME_GOALS) === GOAL_CUSTOM ? goalMin : null
	);

	const options = $derived([
		...WELCOME_GOALS.map((min) => ({ value: String(min), label: formatDurationMin(min, t.intl) })),
		{
			value: GOAL_CUSTOM,
			label: t.settings.goalCustomRow,
			detail: customStored !== null ? formatDurationMin(customStored, t.intl) : undefined
		},
		{ value: GOAL_OFF, label: t.settings.goalOff }
	]);

	const save = createAutosave({
		// "Custom duration…" first shows the fields; the duration saves when it is entered.
		skip: (target) =>
			target instanceof HTMLInputElement && target.name === 'preset' && target.value === GOAL_CUSTOM
	});

	function pick(value: string | undefined) {
		if (value === undefined) return;
		// "Custom…" starts from the goal chosen so far.
		if (value === GOAL_CUSTOM && preset !== GOAL_OFF && preset !== GOAL_CUSTOM) {
			const { h, m } = splitMinutes(Number(preset));
			hours = String(h);
			minutes = String(m);
		}
		preset = value;
	}
</script>

<form
	class="editor"
	method="POST"
	action={formAction('goal')}
	novalidate
	use:enhance={save.enhance}
	{@attach save.form}
>
	<GroupedList
		header={heading ? t.settings.dailyGoal : undefined}
		label={t.settings.dailyGoal}
		name="preset"
		{options}
		bind:value={() => preset, pick}
		describedby="{id}-hint"
	>
		{#if preset === GOAL_CUSTOM}
			<GroupedRow label={t.settings.goalHours} for="{id}-hours">
				<input
					id="{id}-hours"
					class="num tabular"
					name="hours"
					type="number"
					inputmode="numeric"
					min="0"
					max={DAILY_GOAL_MAX / 60}
					step="1"
					enterkeyhint="done"
					value={hours}
					oninput={(e) => (hours = e.currentTarget.value)}
					aria-invalid={failure ? 'true' : undefined}
				/>
			</GroupedRow>
			<GroupedRow label={t.settings.goalMinutes} for="{id}-minutes">
				<select
					id="{id}-minutes"
					class="select tabular"
					name="minutes"
					value={minutes}
					onchange={(e) => (minutes = e.currentTarget.value)}
				>
					{#each DAILY_GOAL_MINUTE_STEPS as m (m)}
						<option value={String(m)}>{m}</option>
					{/each}
				</select>
			</GroupedRow>
		{/if}
	</GroupedList>
	{#if failure}
		<p class="error" role="alert" id="{id}-hint">{failure.error}</p>
	{:else}
		<p class="hint" id="{id}-hint">
			{preset === GOAL_CUSTOM ? t.settings.goalHint : t.settings.dailyGoalDesc}
		</p>
	{/if}
	<NoJsSave />
</form>

<style>
	.editor {
		display: grid;
		gap: var(--space-2);
	}
	.num,
	.select {
		width: 6em;
		min-height: calc(var(--grouped-row-h) - 2 * var(--space-2));
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--text);
		font-size: var(--fs-md);
		text-align: right;
	}
	.select {
		width: auto;
		text-align-last: right;
		cursor: pointer;
	}
	.num:focus-visible,
	.select:focus-visible {
		outline: none;
		box-shadow: var(--ring);
		border-radius: var(--radius-sm);
	}
	.num[aria-invalid='true'] {
		color: var(--danger);
	}
	.hint,
	.error {
		padding: 0 var(--grouped-inset);
		font-size: var(--fs-xs);
	}
	.hint {
		color: var(--text-muted);
	}
	.error {
		color: var(--danger);
	}
</style>
