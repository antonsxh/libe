<script lang="ts">
	import { formAction } from '#lib/form-action.ts';
	import { enhance } from '$app/forms';
	import Dialog from '#lib/components/Dialog.svelte';
	import Button from '#lib/components/Button.svelte';
	import { formatMinutes } from '#lib/dates.ts';
	import { parseClock, type BlockEditor, type BlockFormResult } from '#lib/timeline.ts';
	import { useI18n } from '#lib/i18n/context.svelte.ts';

	type Props = {
		editor: BlockEditor;
		/** `data.form` — re-shows a validation error while the dialog stays open. */
		form: BlockFormResult | null | undefined;
		onclose: () => void;
	};

	let { editor, form, onclose }: Props = $props();
	const t = useI18n();

	let open = $state(true);
	// svelte-ignore state_referenced_locally — initial values; the dialog remounts per editor.
	let start = $state(editor.start);
	// svelte-ignore state_referenced_locally
	let duration = $state(editor.duration);

	const isEdit = $derived(editor.blockId !== undefined);
	const failed = $derived(
		form != null &&
			form.ok === false &&
			form.intent === (isEdit ? 'blockUpdate' : 'block') &&
			(isEdit ? form.blockId === editor.blockId : form.taskId === editor.taskId)
	);
	const errorMessage = $derived(failed ? (form?.errors?.time ?? t.home.block.fallbackError) : '');

	/** Live “7:45 PM → 8:15 PM” preview mirroring the server-side span check. */
	const preview = $derived.by(() => {
		const startMin = parseClock(start);
		const dur = Math.round(Number(duration));
		if (startMin === null || !Number.isFinite(dur) || dur <= 0 || startMin + dur > 1440)
			return null;
		return `${formatMinutes(startMin)} – ${formatMinutes(startMin + dur)}`;
	});

	function close() {
		open = false;
	}
</script>

<Dialog bind:open title={isEdit ? t.home.block.titleEdit : t.home.block.titleNew}>
	<!-- The delete form must stay outside the edit form (no nested <form>); buttons attach via `form=`. -->
	<form
		id="block-form"
		method="POST"
		action={formAction(isEdit ? 'blockUpdate' : 'block')}
		use:enhance={() => {
			return async ({ result, update }) => {
				// Re-render with fresh data (and re-show errors on failure), then close on success.
				await update();
				if (result.type === 'success') onclose();
			};
		}}
	>
		<p class="muted task-name">{editor.taskTitle}</p>

		{#if failed}
			<p class="form-error" role="alert">{errorMessage}</p>
		{/if}

		<div class="fields">
			<label class="field">
				<span class="label">{t.common.start}</span>
				<input name="time" type="time" required bind:value={start} />
			</label>
			<label class="field">
				<span class="label">{t.home.block.duration}</span>
				<input
					name="duration"
					type="number"
					min="5"
					max="1440"
					step="5"
					required
					bind:value={duration}
				/>
			</label>
		</div>
		<p class="preview" class:bad={preview === null}>
			{preview ?? t.home.block.invalidSpan}
		</p>

		{#if isEdit}
			<input type="hidden" name="blockId" value={editor.blockId ?? ''} />
		{:else}
			<input type="hidden" name="taskId" value={editor.taskId} />
		{/if}
	</form>

	{#if isEdit}
		<form
			id="block-delete-form"
			method="POST"
			action={formAction('blockDelete')}
			use:enhance={() => {
				return async ({ result, update }) => {
					await update();
					if (result.type === 'success') onclose();
				};
			}}
		>
			<input type="hidden" name="blockId" value={editor.blockId ?? ''} />
		</form>
	{/if}

	<div class="actions">
		{#if isEdit}
			<Button variant="ghost" type="submit" form="block-delete-form">{t.common.delete}</Button>
		{/if}
		<span class="spacer"></span>
		<Button variant="secondary" type="button" onclick={close}>{t.common.cancel}</Button>
		<Button type="submit" form="block-form">{isEdit ? t.common.save : t.home.block.add}</Button>
	</div>
</Dialog>

<style>
	.task-name {
		margin: calc(-1 * var(--space-2)) 0 var(--space-4);
		font-size: var(--fs-sm);
	}
	.fields {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-3);
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.field input {
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		color: var(--text);
		font-size: var(--fs-md);
		padding: var(--space-2) var(--space-3);
	}
	.field input:hover {
		border-color: var(--border-strong);
	}
	.preview {
		color: var(--text-faint);
		font-size: var(--fs-sm);
		margin: var(--space-2) 0 0;
	}
	.preview.bad {
		color: var(--danger);
	}
	.form-error {
		color: var(--danger);
		font-size: var(--fs-sm);
		margin: 0 0 var(--space-3);
	}
	.actions {
		align-items: center;
		display: flex;
		gap: var(--space-2);
		margin-top: var(--space-5);
	}
	.spacer {
		flex: 1;
	}
</style>
