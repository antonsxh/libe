<script lang="ts">
	import { enhance } from '$app/forms';
	import GroupedList from '#lib/components/GroupedList.svelte';
	import NoJsSave from './NoJsSave.svelte';
	import { createAutosave } from '#lib/autosave.svelte.ts';
	import { formAction } from '#lib/form-action.ts';
	import type { LanguageSetting } from '#lib/i18n/index.ts';
	import { useI18n } from '#lib/i18n/context.svelte.ts';

	/** Settings → Language: a choice list; a pick saves and the whole UI switches. */
	type Props = { language: LanguageSetting; error: string | null; heading?: boolean };
	let { language, error, heading = true }: Props = $props();
	const t = useI18n();
	const id = $props.id();
	// English and German first (each named in its own language), then the browser default.
	const ORDER: LanguageSetting[] = ['en', 'de', 'auto'];
	let value = $derived<string>(language);
	const options = $derived(
		ORDER.map((o) => ({
			value: o,
			label: t.settings.languageOptions[o],
			lang: o === 'auto' ? undefined : o
		}))
	);
	const save = createAutosave();
</script>

<form
	class="editor"
	method="POST"
	action={formAction('language')}
	use:enhance={save.enhance}
	{@attach save.form}
>
	<GroupedList
		header={heading ? t.settings.language : undefined}
		label={t.settings.language}
		name="language"
		{options}
		bind:value
		footer={t.settings.languageDesc}
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
