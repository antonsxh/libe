<script lang="ts">
	import { enhance } from '$app/forms';
	import GroupedList from '#lib/components/GroupedList.svelte';
	import NoJsSave from './NoJsSave.svelte';
	import { createAutosave } from '#lib/autosave.svelte.ts';
	import { formAction } from '#lib/form-action.ts';
	import { useI18n } from '#lib/i18n/context.svelte.ts';
	import { THEMES, type Theme } from '#lib/theme.ts';

	/**
	 * Settings → Appearance (R3): this device's light/dark choice; a pick saves and the page
	 * switches right away (`+page.svelte` calls `applyTheme` once the action answered).
	 */
	type Props = { theme: Theme; error: string | null; heading?: boolean };
	let { theme, error, heading = true }: Props = $props();
	const t = useI18n();
	const id = $props.id();
	const ORDER: Theme[] = [...THEMES]; // Automatic · Light · Dark
	let value = $derived<string>(theme);
	const options = $derived(
		ORDER.map((o) => ({ value: o, label: t.settings.appearanceOptions[o] }))
	);
	const save = createAutosave();
</script>

<form
	class="editor"
	method="POST"
	action={formAction('appearance')}
	use:enhance={save.enhance}
	{@attach save.form}
>
	<GroupedList
		header={heading ? t.settings.appearance : undefined}
		label={t.settings.appearance}
		name="theme"
		{options}
		bind:value
		footer={t.settings.appearanceDesc}
		describedby={error ? `${id}-error` : undefined}
	/>
	{#if error}<p class="error" role="alert" id="{id}-error">{error}</p>{/if}
	<NoJsSave />
</form>

<style>
	.editor {
		display: grid;
		gap: var(--space-2);
	}
	.error {
		padding: 0 var(--grouped-inset);
		color: var(--danger);
		font-size: var(--fs-xs);
	}
</style>
