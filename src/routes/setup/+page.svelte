<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import { onMount } from 'svelte';
	import Button from '#lib/components/Button.svelte';
	import AuthShell from '#lib/components/auth/AuthShell.svelte';
	import { clientDeviceKind, clientDeviceName } from '#lib/pwa.ts';
	import { useI18n } from '#lib/i18n/context.svelte.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const t = useI18n();

	let name = $derived(form?.name ?? data.defaultName);
	let kind = $state('browser');
	let busy = $state(false);

	onMount(() => {
		kind = clientDeviceKind();
		if (!form) name = clientDeviceName(t.deviceNames);
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

<svelte:head><title>{t.auth.setup.pageTitle}</title></svelte:head>

<AuthShell
	title={data.hasDevices ? t.auth.setup.titleRecovery : t.auth.setup.title}
	subtitle={data.hasDevices ? t.auth.setup.subtitleRecovery : t.auth.setup.subtitle}
	intro={t.auth.intro}
>
	{#if !data.configured}
		<div class="notice" role="alert">
			<p><strong>{t.auth.setup.notSet}</strong></p>
			<!-- Static, trusted message markup (no user input). -->
			<p>{@html t.auth.setup.notSetHelpHtml}</p>
		</div>
	{:else}
		{#if data.pairedAs}
			<p class="notice">
				{t.auth.alreadyPairedBefore}<strong>{data.pairedAs}</strong>{t.auth.alreadyPairedAfter}
				<a href={data.next}>{t.auth.continue}</a>
			</p>
		{/if}
		<form method="POST" use:enhance={submit}>
			<input type="hidden" name="next" value={data.next} />
			<input type="hidden" name="kind" value={kind} />
			<label class="field">
				<span class="label">{t.auth.setup.secret}</span>
				<input
					type="password"
					name="secret"
					autocomplete="current-password"
					required
					aria-invalid={form?.error ? 'true' : undefined}
				/>
				<span class="hint">{@html t.auth.setup.secretHintHtml}</span>
			</label>
			<label class="field">
				<span class="label">{t.auth.deviceName}</span>
				<input name="name" bind:value={name} maxlength="60" autocomplete="off" required />
			</label>
			{#if !data.hasDevices}
				<!-- First device only. Never prefilled: this public page must not reveal a stored
				     name, and the server only uses it while no name is set. -->
				<label class="field">
					<span class="label">{t.auth.setup.yourName}</span>
					<input
						name="displayName"
						value={form?.displayName ?? ''}
						autocomplete="name"
						aria-describedby="setup-name-hint"
					/>
					<span class="hint" id="setup-name-hint">{t.auth.setup.yourNameHint}</span>
				</label>
			{/if}
			{#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}
			<div class="submit">
				<Button variant="primary" type="submit" disabled={busy}>
					{busy ? t.auth.pairing : t.auth.setup.submit}
				</Button>
			</div>
		</form>
	{/if}

	{#snippet footer()}
		{#if data.hasDevices}
			<p>{t.auth.setup.haveDevice} <a href="/pair">{t.auth.setup.withCode}</a>.</p>
		{/if}
	{/snippet}
</AuthShell>

<style>
	/* The hints come from the messages (`{@html}`), hence :global. */
	.notice :global(code),
	.hint :global(code) {
		font-family: var(--font-mono);
		font-size: 0.92em;
		color: var(--text);
	}
	.notice p + p {
		margin-top: var(--space-2);
	}
</style>
