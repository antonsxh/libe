<script lang="ts">
	import { goto } from '$app/navigation';
	import Button from '#lib/components/Button.svelte';
	import Dialog from '#lib/components/Dialog.svelte';
	import { useTimer, type StartRequest } from '#lib/timer-store.svelte.ts';

	type Props = { request: StartRequest & { navigate: boolean } };
	let { request }: Props = $props();

	const timer = useTimer();
	let open = $state(true);

	// Escape / backdrop / ✕ close the native dialog → drop the parked request.
	$effect(() => {
		if (!open) timer.switchRequest = null;
	});

	async function confirm() {
		const ok = await timer.start(request, { replace: true });
		if (!ok) return;
		open = false;
		if (request.navigate) await goto('/focus');
	}
</script>

<Dialog bind:open title="Switch timer?">
	<p class="text">
		{#if timer.timer}
			<strong>{timer.timer.task.title}</strong> is running{#if timer.view}
				(<span class="tabular">{timer.view.display}</span>){/if}.
		{:else}
			Another timer is active.
		{/if}
		Stop it — its time is kept — and start <strong>{request.task.title}</strong>?
	</p>
	{#if timer.error}<p class="error" role="alert">{timer.error}</p>{/if}
	<div class="actions">
		<Button variant="secondary" onclick={() => (open = false)}>Cancel</Button>
		<Button variant="primary" onclick={confirm} disabled={timer.busy}>
			Stop current and start
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
