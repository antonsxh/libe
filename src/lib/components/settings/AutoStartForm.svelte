<script lang="ts">
	import { enhance } from '$app/forms';
	import { TimerReset } from '@lucide/svelte';
	import Switch from '#lib/components/Switch.svelte';
	import NoJsSave from './NoJsSave.svelte';
	import SettingsTile from './SettingsTile.svelte';
	import { createAutosave } from '#lib/autosave.svelte.ts';
	import { formAction } from '#lib/form-action.ts';
	import type { PomodoroSettings } from '#lib/timer.ts';
	import { useI18n } from '#lib/i18n/context.svelte.ts';

	/**
	 * Settings → Auto-start as a switch row (one row of a `GroupedList`): toggling saves the
	 * pomodoro settings with the stored intervals (the shared `settings` action).
	 */
	type Props = { settings: PomodoroSettings };
	let { settings }: Props = $props();
	const t = useI18n();
	const id = $props.id();
	let on = $derived(settings.autoStart);
	const save = createAutosave();
</script>

<form
	class="switch-row"
	method="POST"
	action={formAction('settings')}
	use:enhance={save.enhance}
	{@attach save.form}
>
	<input type="hidden" name="focusMin" value={settings.focusMin} />
	<input type="hidden" name="shortBreakMin" value={settings.shortBreakMin} />
	<input type="hidden" name="longBreakMin" value={settings.longBreakMin} />
	<input type="hidden" name="longBreakEvery" value={settings.longBreakEvery} />
	<SettingsTile color="var(--tile-neutral)"><TimerReset size={16} strokeWidth={2} /></SettingsTile>
	<label class="text" for="{id}-switch">{t.settings.autoStartRow}</label>
	<Switch id="{id}-switch" name="autoStart" bind:checked={on} testid="auto-start" />
	<NoJsSave />
</form>

<style>
	.switch-row {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		min-height: var(--grouped-row-h);
		padding: var(--space-2) var(--grouped-inset);
	}
	.text {
		flex: 1;
		min-width: 0;
		cursor: pointer;
	}
</style>
