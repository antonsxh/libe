<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import { onMount } from 'svelte';
	import Button from '#lib/components/Button.svelte';
	import AuthShell from '#lib/components/auth/AuthShell.svelte';
	import { clientDeviceKind, clientDeviceName, isStandalone } from '#lib/pwa.ts';
	import { useI18n } from '#lib/i18n/context.svelte.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const t = useI18n();

	let code = $derived(form?.code ?? data.code);
	let name = $derived(form?.name ?? data.defaultName);
	let kind = $state('browser');
	let standalone = $state(false);
	let busy = $state(false);
	let codeInput: HTMLInputElement | undefined = $state();

	onMount(() => {
		kind = clientDeviceKind();
		standalone = isStandalone();
		if (!form) name = clientDeviceName(t.deviceNames);
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

<svelte:head><title>{t.auth.pair.pageTitle}</title></svelte:head>

<AuthShell title={t.auth.pair.title} subtitle={t.auth.pair.subtitle}>
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
			<span class="label">{t.auth.pair.code}</span>
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
			<!-- Static, trusted message markup (no user input). -->
			<span class="hint" id="code-hint">{@html t.auth.pair.codeHintHtml}</span>
		</label>
		<label class="field">
			<span class="label">{t.auth.deviceName}</span>
			<input name="name" bind:value={name} maxlength="60" autocomplete="off" required />
		</label>
		{#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}
		<div class="submit">
			<Button variant="primary" type="submit" disabled={busy}>
				{busy ? t.auth.pairing : t.auth.pair.submit}
			</Button>
		</div>
	</form>

	{#snippet footer()}
		{#if standalone}
			<p>{t.auth.pair.standalone}</p>
		{/if}
		{#if !data.hasDevices}
			<p>
				{t.auth.pair.nothingPaired}
				<a href="/setup">{t.auth.pair.setUpFirst}</a>
				{t.auth.pair.withSecret}
			</p>
		{:else}
			<p>{t.auth.pair.lostAll} <a href="/setup">{t.auth.pair.useSecret}</a>.</p>
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
