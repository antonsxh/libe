<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import { onMount } from 'svelte';
	import Button from '#lib/components/Button.svelte';
	import AuthShell from '#lib/components/auth/AuthShell.svelte';
	import { clientDeviceKind, clientDeviceName, isStandalone } from '#lib/pwa.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let code = $derived(form?.code ?? data.code);
	let name = $derived(form?.name ?? data.defaultName);
	let kind = $state('browser');
	let standalone = $state(false);
	let busy = $state(false);
	let codeInput: HTMLInputElement | undefined = $state();

	onMount(() => {
		kind = clientDeviceKind();
		standalone = isStandalone();
		if (!form) name = clientDeviceName();
		if (!data.pairedAs) codeInput?.focus();
	});

	/** Keep the code readable while typing: digits only, "482 913". */
	function formatInput(e: Event & { currentTarget: HTMLInputElement }) {
		const digits = e.currentTarget.value.replace(/\D/g, '').slice(0, 6);
		code = digits.length > 3 ? `${digits.slice(0, 3)} ${digits.slice(3)}` : digits;
	}

	/** Success → full page load, so the whole app (layout data, timer stream) starts paired. */
	const submit: SubmitFunction = () => {
		busy = true;
		return async ({ result, update }) => {
			if (result.type === 'redirect') {
				location.assign(result.location);
				return;
			}
			busy = false;
			await update({ reset: false });
		};
	};
</script>

<svelte:head><title>Pair this device · libe</title></svelte:head>

<AuthShell
	title="Pair this device"
	subtitle="Enter the code shown on a device that is already paired."
>
	{#if data.pairedAs}
		<p class="notice">
			This device is already paired as <strong>{data.pairedAs}</strong>.
			<a href={data.next}>Continue to libe →</a>
		</p>
	{/if}

	<form method="POST" use:enhance={submit}>
		<input type="hidden" name="next" value={data.next} />
		<input type="hidden" name="kind" value={kind} />
		<label class="field">
			<span class="label">Pairing code</span>
			<input
				bind:this={codeInput}
				class="code tabular"
				name="code"
				value={code}
				oninput={formatInput}
				inputmode="numeric"
				autocomplete="one-time-code"
				placeholder="000 000"
				maxlength="7"
				required
				aria-invalid={form?.error ? 'true' : undefined}
				aria-describedby="code-hint"
			/>
			<span class="hint" id="code-hint">
				On a paired device: avatar menu → <strong>Pair new device</strong>. Codes are valid for 10
				minutes.
			</span>
		</label>
		<label class="field">
			<span class="label">Device name</span>
			<input name="name" bind:value={name} maxlength="60" autocomplete="off" required />
		</label>
		{#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}
		<div class="submit">
			<Button variant="primary" type="submit" disabled={busy}>
				{busy ? 'Pairing…' : 'Pair device'}
			</Button>
		</div>
	</form>

	{#snippet footer()}
		{#if standalone}
			<p>The home-screen app keeps its own sign-in, separate from Safari — pair it here once.</p>
		{/if}
		{#if !data.hasDevices}
			<p>
				Nothing is paired yet. <a href="/setup">Set up the first device</a> with the setup secret.
			</p>
		{:else}
			<p>Lost all your devices? <a href="/setup">Use the setup secret</a>.</p>
		{/if}
	{/snippet}
</AuthShell>

<style>
	.code {
		font-size: var(--fs-xl) !important;
		letter-spacing: 0.18em;
		text-align: center;
	}
</style>
