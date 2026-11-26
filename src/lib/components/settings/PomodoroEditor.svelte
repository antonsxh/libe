<script lang="ts">
	import { enhance } from '$app/forms';
	import GroupedList from '#lib/components/GroupedList.svelte';
	import GroupedRow from '#lib/components/GroupedRow.svelte';
	import NoJsSave from './NoJsSave.svelte';
	import { createAutosave } from '#lib/autosave.svelte.ts';
	import { formAction } from '#lib/form-action.ts';
	import { POMODORO_LIMITS, type PomodoroSettings, type SettingsErrors } from '#lib/timer.ts';
	import { useI18n } from '#lib/i18n/context.svelte.ts';

	/**
	 * Settings → Pomodoro: the four intervals as number rows; a field saves when committed
	 * (blur / Enter) through the shared `settings` action (`parsePomodoroSettings`). Auto-start
	 * is its own switch row (`AutoStartForm`) and rides along unchanged here.
	 */
	type Failure = { errors: SettingsErrors; values: Record<string, string> };
	type Props = { settings: PomodoroSettings; failure: Failure | null; heading?: boolean };
	let { settings, failure, heading = true }: Props = $props();
	const t = useI18n();
	const id = $props.id();

	type Key = keyof typeof POMODORO_LIMITS;
	const fields = $derived.by(() => {
		const s = t.focus.settings;
		const field = (key: Key, label: string, unit: string) => ({
			key,
			label,
			unit,
			min: POMODORO_LIMITS[key][0],
			max: POMODORO_LIMITS[key][1]
		});
		return [
			field('focusMin', s.focus, s.unitMin),
			field('shortBreakMin', s.shortBreak, s.unitMin),
			field('longBreakMin', s.longBreak, s.unitMin),
			field('longBreakEvery', s.longBreakEvery, s.unitRounds)
		];
	});
	const value = (key: Key) => failure?.values[key] ?? String(settings[key]);
	const errors = $derived(fields.filter((f) => failure?.errors[f.key]));
	const save = createAutosave();
</script>

<form
	class="editor"
	method="POST"
	action={formAction('settings')}
	novalidate
	use:enhance={save.enhance}
	{@attach save.form}
>
	<GroupedList
		header={heading ? t.settings.pomodoro : undefined}
		label={t.settings.pomodoro}
		describedby="{id}-hint"
	>
		{#each fields as f (f.key)}
			<GroupedRow label={f.label} for="{id}-{f.key}">
				<span class="field">
					<input
						id="{id}-{f.key}"
						class="num tabular"
						type="number"
						inputmode="numeric"
						name={f.key}
						min={f.min}
						max={f.max}
						step="1"
						enterkeyhint="done"
						value={value(f.key)}
						aria-invalid={failure?.errors[f.key] ? 'true' : undefined}
					/>
					<span class="unit">{f.unit}</span>
				</span>
			</GroupedRow>
		{/each}
	</GroupedList>
	{#if settings.autoStart}<input type="hidden" name="autoStart" value="on" />{/if}
	{#if errors.length > 0}
		<div class="error" role="alert" id="{id}-hint">
			{#each errors as f (f.key)}<p>{f.label}: {failure?.errors[f.key]}</p>{/each}
		</div>
	{:else}
		<p class="hint" id="{id}-hint">{t.focus.settings.hint}</p>
	{/if}
	<NoJsSave />
</form>

<style>
	.editor {
		display: grid;
		gap: var(--space-2);
	}
	.field {
		display: inline-flex;
		align-items: baseline;
		gap: var(--space-2);
	}
	.num {
		width: 4em;
		min-height: calc(var(--grouped-row-h) - 2 * var(--space-2));
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--text);
		font-size: var(--fs-md);
		text-align: right;
	}
	.num:focus-visible {
		outline: none;
		box-shadow: var(--ring);
		border-radius: var(--radius-sm);
	}
	.num[aria-invalid='true'] {
		color: var(--danger);
	}
	.unit {
		min-width: 3.5em;
		color: var(--text-muted);
		font-size: var(--fs-sm);
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
		display: grid;
		gap: var(--space-1);
		color: var(--danger);
	}
</style>
