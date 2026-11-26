<script lang="ts">
	import { enhance } from '$app/forms';
	import GroupedList from '#lib/components/GroupedList.svelte';
	import NoJsSave from './NoJsSave.svelte';
	import { createAutosave } from '#lib/autosave.svelte.ts';
	import { formAction } from '#lib/form-action.ts';
	import { restWeekdays } from '#lib/streak.ts';
	import { weekdayName } from '#lib/settings-sections.ts';
	import { useI18n } from '#lib/i18n/context.svelte.ts';

	/**
	 * Settings → Rest days: the weekdays as a checklist (Monday first); every tick saves the
	 * whole set (`parseRestDays`, at most six). The streak rule is the footer.
	 */
	type Failure = { values: string[]; error: string };
	type Props = { restMask: number; failure: Failure | null; streakRule: string; heading?: boolean };
	let { restMask, failure, streakRule, heading = true }: Props = $props();
	const t = useI18n();
	const id = $props.id();

	// Follow the stored rest days (or the rejected input); ticking overrides locally.
	let values = $derived<string[]>(failure ? failure.values : restWeekdays(restMask).map(String));
	const options = $derived(
		[0, 1, 2, 3, 4, 5, 6].map((i) => ({ value: String(i), label: weekdayName(i, 'long', t.intl) }))
	);
	const save = createAutosave();
</script>

<form
	class="editor"
	method="POST"
	action={formAction('streak')}
	novalidate
	use:enhance={save.enhance}
	{@attach save.form}
>
	<GroupedList
		header={heading ? t.settings.restDays : undefined}
		label={t.settings.restDays}
		name="restDay"
		multiple
		{options}
		bind:values
		describedby="{id}-hint"
	/>
	{#if failure}
		<p class="error" role="alert" id="{id}-hint">{failure.error}</p>
	{/if}
	<div class="foot" id={failure ? undefined : `${id}-hint`}>
		<p data-testid="streak-rule">{streakRule}</p>
		<p>{t.settings.restDaysHint}</p>
		<p>{t.settings.streakRuleHistory}</p>
	</div>
	<NoJsSave />
</form>

<style>
	.editor {
		display: grid;
		gap: var(--space-2);
	}
	.foot {
		display: grid;
		gap: var(--space-1);
		padding: 0 var(--grouped-inset);
		color: var(--text-muted);
		font-size: var(--fs-xs);
	}
	.error {
		padding: 0 var(--grouped-inset);
		color: var(--danger);
		font-size: var(--fs-xs);
	}
</style>
