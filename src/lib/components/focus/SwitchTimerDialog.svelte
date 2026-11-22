<script lang="ts">
	import { goto } from '$app/navigation';
	import Button from '#lib/components/Button.svelte';
	import Dialog from '#lib/components/Dialog.svelte';
	import { useTimer, type StartRequest } from '#lib/timer-store.svelte.ts';
	import { useI18n } from '#lib/i18n/context.svelte.ts';

	type Props = { request: StartRequest & { navigate: boolean } };
	let { request }: Props = $props();

	const timer = useTimer();
	const t = useI18n();
	let open = $state(true);

	async function confirm() {
		const ok = await timer.start(request, { replace: true });
		if (!ok) return;
		open = false;
		if (request.navigate) await goto('/focus');
	}
</script>

<!-- Closed in any way (Esc, backdrop, ✕, confirmed) → drop the parked request. -->
<Dialog bind:open title={t.focus.switchDialog.title} onclosed={() => (timer.switchRequest = null)}>
	<p class="text">
		{#if timer.timer}
			<strong>{timer.timer.task.title}</strong>{t.focus.switchDialog.isRunning}{#if timer.view}
				(<span class="tabular">{timer.view.display}</span>){/if}.
		{:else}
			{t.focus.switchDialog.anotherActive}
		{/if}
		{t.focus.switchDialog.promptBefore}<strong>{request.task.title}</strong>{t.focus.switchDialog
			.promptAfter}
	</p>
	{#if timer.error}<p class="error" role="alert">{timer.error}</p>{/if}
	<div class="actions dialog-actions">
		<Button variant="secondary" onclick={() => (open = false)}>{t.common.cancel}</Button>
		<Button variant="primary" onclick={confirm} disabled={timer.busy}>
			{t.focus.stopAndStart}
		</Button>
	</div>
</Dialog>

<style>
	.text {
		color: var(--text-2);
		font-size: var(--fs-md);
		line-height: 1.5;
	}
	.text strong {
		color: var(--text);
		font-weight: var(--fw-medium);
	}
	.error {
		margin-top: var(--space-3);
		color: var(--danger);
		font-size: var(--fs-sm);
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: var(--space-2);
		margin-top: var(--space-6);
	}
</style>
