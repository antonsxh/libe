<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '#lib/components/Button.svelte';
	import Dialog from '#lib/components/Dialog.svelte';
	import { formAction } from '#lib/form-action.ts';
	import type { PomodoroSettings, SettingsErrors } from '#lib/timer.ts';

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

	let open = $state(true);
	$effect(() => {
		if (!open) onclose();
	});

	const failed = $derived(form?.intent === 'settings' && form.errors ? form : null);
	const val = (key: keyof PomodoroSettings) =>
		failed?.values?.[key] ?? String(settings[key as Exclude<keyof PomodoroSettings, 'autoStart'>]);

	const FIELDS = [
		{ key: 'focusMin', label: 'Focus', unit: 'min', min: 1, max: 180 },
		{ key: 'shortBreakMin', label: 'Short break', unit: 'min', min: 1, max: 60 },
		{ key: 'longBreakMin', label: 'Long break', unit: 'min', min: 1, max: 120 },
		{ key: 'longBreakEvery', label: 'Long break every', unit: 'rounds', min: 1, max: 12 }
	] as const;
</script>

<Dialog bind:open title="Pomodoro settings">
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
			Start breaks and the next round automatically
		</label>
		<p class="hint muted">
			Changes apply from the next phase. After a long break the next round always waits for you.
		</p>
		<div class="actions">
			<Button variant="secondary" onclick={() => (open = false)}>Cancel</Button>
			<Button variant="primary" type="submit">Save</Button>
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
