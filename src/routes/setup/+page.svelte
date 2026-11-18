<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import { onMount } from 'svelte';
	import Button from '#lib/components/Button.svelte';
	import AuthShell from '#lib/components/auth/AuthShell.svelte';
	import { clientDeviceKind, clientDeviceName } from '#lib/pwa.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let name = $derived(form?.name ?? data.defaultName);
	let kind = $state('browser');
	let busy = $state(false);

	onMount(() => {
		kind = clientDeviceKind();
		if (!form) name = clientDeviceName();
	});

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

<svelte:head><title>Set up libe</title></svelte:head>

<AuthShell
	title={data.hasDevices ? 'Pair with the setup secret' : 'Set up libe'}
	subtitle={data.hasDevices
		? 'Recovery: pair this device with the server’s setup secret.'
		: 'Pair your first device with the setup secret from the server configuration.'}
>
	{#if !data.configured}
		<div class="notice" role="alert">
			<p><strong>LIBE_SETUP_SECRET is not set.</strong></p>
			<p>
				Set it in the server environment (<code>.env</code> for development, the
				<code>environment</code> of the <code>app</code> service in <code>compose.yaml</code>) to a
				long random value, e.g. <code>openssl rand -base64 24</code>, restart the server and reload
				this page.
			</p>
		</div>
	{:else}
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
				<span class="label">Setup secret</span>
				<input
					type="password"
					name="secret"
					autocomplete="current-password"
					required
					aria-invalid={form?.error ? 'true' : undefined}
				/>
				<span class="hint">The value of <code>LIBE_SETUP_SECRET</code> on the server.</span>
			</label>
			<label class="field">
				<span class="label">Device name</span>
				<input name="name" bind:value={name} maxlength="60" autocomplete="off" required />
			</label>
			{#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}
			<div class="submit">
				<Button variant="primary" type="submit" disabled={busy}>
					{busy ? 'Pairing…' : 'Pair this device'}
				</Button>
			</div>
		</form>
	{/if}

	{#snippet footer()}
		{#if data.hasDevices}
			<p>Have a paired device nearby? <a href="/pair">Pair with a code instead</a>.</p>
		{/if}
	{/snippet}
</AuthShell>

<style>
	code {
		font-family: var(--font-mono);
		font-size: 0.92em;
		color: var(--text);
	}
	.notice p + p {
		margin-top: var(--space-2);
	}
</style>
