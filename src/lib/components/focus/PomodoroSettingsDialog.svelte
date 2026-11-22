<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '#lib/components/Button.svelte';
	import Dialog from '#lib/components/Dialog.svelte';
	import { formAction } from '#lib/form-action.ts';
	import { POMODORO_LIMITS, type PomodoroSettings, type SettingsErrors } from '#lib/timer.ts';
	import { useI18n } from '#lib/i18n/context.svelte.ts';

	type SettingsForm = {
		intent?: string;
		errors?: SettingsErrors;
		values?: Record<string, string>;
	} | null;

	type Props = {
		settings: PomodoroSettings;
		/** `form` of the focus page (re-shows validation errors). */
		form: SettingsForm;
		onclose: () => void;
	};
	let { settings, form, onclose }: Props = $props();
	const t = useI18n();

	let open = $state(true);

	const failed = $derived(form?.intent === 'settings' && form.errors ? form : null);
	const val = (key: keyof PomodoroSettings) =>
		failed?.values?.[key] ?? String(settings[key as Exclude<keyof PomodoroSettings, 'autoStart'>]);

	const FIELDS = $derived.by(() => {
		const s = t.focus.settings;
		const field = (key: keyof typeof POMODORO_LIMITS, label: string, unit: string) => ({
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
</script>

<Dialog bind:open title={t.focus.pomodoroSettings} onclosed={onclose}>
	<form
		method="POST"
		action={formAction('settings')}
		use:enhance={() =>
			async ({ result, update }) => {
				await update({ reset: false });
				if (result.type === 'success') open = false;
			}}
	>
		<div class="fields">
			{#each FIELDS as f (f.key)}
				<label class="field">
					<span class="label">{f.label}</span>
					<span class="input">
						<input
							type="number"
							name={f.key}
							min={f.min}
							max={f.max}
							step="1"
							required
							value={val(f.key)}
							aria-invalid={failed?.errors?.[f.key] ? 'true' : undefined}
						/>
						<span class="unit muted">{f.unit}</span>
					</span>
					{#if failed?.errors?.[f.key]}<span class="error">{failed.errors[f.key]}</span>{/if}
				</label>
			{/each}
		</div>
		<label class="check">
			<input type="checkbox" name="autoStart" checked={settings.autoStart} />
			{t.focus.settings.autoStart}
		</label>
		<p class="hint muted">{t.focus.settings.hint}</p>
		<div class="actions dialog-actions">
			<Button variant="secondary" onclick={() => (open = false)}>{t.common.cancel}</Button>
			<Button variant="primary" type="submit">{t.common.save}</Button>
		</div>
	</form>
</Dialog>

<style>
	.fields {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--space-4) var(--space-3);
	}
	.field {
		display: grid;
		gap: var(--space-1);
		min-width: 0;
	}
	.input {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.input input {
		width: 100%;
		min-width: 0;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		color: var(--text);
		font-size: var(--fs-md);
		padding: var(--space-2) var(--space-3);
	}
	.input input[aria-invalid='true'] {
		border-color: var(--danger);
	}
	.unit {
		font-size: var(--fs-sm);
	}
	.error {
		color: var(--danger);
		font-size: var(--fs-xs);
	}
	.check {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-top: var(--space-5);
		color: var(--text-2);
		font-size: var(--fs-sm);
	}
	.check input {
		accent-color: var(--accent);
	}
	.hint {
		margin-top: var(--space-2);
		font-size: var(--fs-xs);
	}
	.actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-2);
		margin-top: var(--space-6);
	}
</style>
