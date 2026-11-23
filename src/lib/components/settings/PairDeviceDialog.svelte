<script lang="ts">
	import { onMount } from 'svelte';
	import { refreshAll } from '$app/navigation';
	import { CircleCheck, RefreshCw } from '@lucide/svelte';
	import Button from '#lib/components/Button.svelte';
	import Dialog from '#lib/components/Dialog.svelte';
	import { PAIRING_CODE_TTL_MS } from '#lib/auth.ts';
	import { qrShape } from '#lib/qr.ts';
	import { useI18n } from '#lib/i18n/context.svelte.ts';

	type Props = { onclose: () => void };
	let { onclose }: Props = $props();
	const t = useI18n();

	let open = $state(true);

	interface Issued {
		id: string;
		code: string;
		url: string;
		/** Expiry on the local clock (server expiry corrected by the clock offset). */
		expiresAt: number;
	}

	/** Expired codes are replaced automatically this many times (~1 h), then we wait. */
	const MAX_AUTO_RENEW = 6;
	const POLL_MS = 2000;

	let issued = $state<Issued | null>(null);
	let paired = $state<string | null>(null);
	let error = $state<string | null>(null);
	let loading = $state(false);
	let renewals = $state(0);
	let now = $state(Date.now());

	const remaining = $derived(issued ? Math.max(0, issued.expiresAt - now) : 0);
	const expired = $derived(issued !== null && remaining === 0);
	const countdown = $derived.by(() => {
		const s = Math.ceil(remaining / 1000);
		return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
	});
	const qr = $derived(issued ? qrShape(issued.url) : null);

	async function generate() {
		loading = true;
		error = null;
		try {
			const res = await fetch('/api/devices/codes', {
				method: 'POST',
				headers: { accept: 'application/json', 'content-type': 'application/json' },
				body: '{}'
			});
			if (!res.ok) throw new Error(String(res.status));
			const data = (await res.json()) as {
				id: string;
				code: string;
				url: string;
				expiresAt: number;
				now: number;
			};
			const offset = data.now - Date.now();
			issued = { id: data.id, code: data.code, url: data.url, expiresAt: data.expiresAt - offset };
			now = Date.now();
		} catch {
			error = t.settings.pair.createFailed;
		} finally {
			loading = false;
		}
	}

	function newCode() {
		renewals = 0;
		void generate();
	}

	// First code on open.
	onMount(() => void generate());

	// Countdown tick + auto-renew when a code runs out (while the dialog is open).
	$effect(() => {
		const t = setInterval(() => (now = Date.now()), 1000);
		return () => clearInterval(t);
	});
	$effect(() => {
		if (expired && !paired && !loading && renewals < MAX_AUTO_RENEW) {
			renewals++;
			void generate();
		}
	});

	// Poll whether the code was used; then show who paired and refresh the device list.
	$effect(() => {
		const id = issued?.id;
		if (!id || paired) return;
		let stopped = false;
		const poll = setInterval(async () => {
			try {
				const res = await fetch(`/api/devices/codes/${id}`, {
					headers: { accept: 'application/json' }
				});
				if (!res.ok || stopped) return;
				const data = (await res.json()) as { status: string; deviceName: string | null };
				if (data.status === 'used' && !stopped) {
					paired = data.deviceName ?? t.settings.pair.newDevice;
					await refreshAll();
				} else if (data.status === 'locked' && !stopped) {
					error = t.settings.pair.locked;
					issued = null;
				}
			} catch {
				// offline for a moment — keep polling
			}
		}, POLL_MS);
		return () => {
			stopped = true;
			clearInterval(poll);
		};
	});
</script>

<Dialog bind:open title={t.settings.pair.title} onclosed={onclose}>
	{#if paired}
		<div class="done" role="status">
			<CircleCheck size={40} strokeWidth={1.5} />
			<p><strong>{paired}</strong>{t.settings.pair.isPaired}</p>
			<div class="actions">
				<Button variant="secondary" onclick={() => ((paired = null), newCode())}>
					{t.settings.pair.pairAnother}
				</Button>
				<Button variant="primary" onclick={() => (open = false)}>{t.common.done}</Button>
			</div>
		</div>
	{:else}
		<p class="muted intro">
			{t.settings.pair.introBefore}<strong>libe</strong>{t.settings.pair.introAfter}
		</p>

		<div class="code-box" aria-live="polite">
			{#if issued && !expired}
				<p
					class="code tabular"
					aria-label={t.settings.pair.codeAria(issued.code.split('').join(' '))}
				>
					{issued.code}
				</p>
				<p class="timer tabular muted">{t.settings.pair.validFor(countdown)}</p>
				<span class="bar" style:--p={remaining / PAIRING_CODE_TTL_MS} aria-hidden="true"></span>
			{:else if loading}
				<p class="code tabular faint" aria-label={t.settings.pair.generatingAria}>––– –––</p>
				<p class="timer muted">{t.settings.pair.generating}</p>
			{:else}
				<p class="code tabular faint">––– –––</p>
				<p class="timer muted">{expired ? t.settings.pair.expired : t.settings.pair.noCode}</p>
			{/if}
		</div>

		{#if qr && issued && !expired}
			<figure class="qr">
				<svg
					viewBox={`-2 -2 ${qr.size + 4} ${qr.size + 4}`}
					role="img"
					aria-label={t.settings.pair.qrAria}
					shape-rendering="crispEdges"
				>
					<rect x="-2" y="-2" width={qr.size + 4} height={qr.size + 4} class="qr-bg" />
					<path d={qr.path} class="qr-fg" />
				</svg>
				<figcaption class="muted">
					{t.settings.pair.opens} <span class="url">{issued.url}</span>
				</figcaption>
			</figure>
		{/if}

		{#if error}<p class="error" role="alert">{error}</p>{/if}

		<div class="actions">
			<Button variant="ghost" onclick={newCode} disabled={loading}>
				<RefreshCw size={15} />
				{t.settings.pair.newCode}
			</Button>
			<Button variant="secondary" onclick={() => (open = false)}>{t.common.close}</Button>
		</div>
	{/if}
</Dialog>

<style>
	.intro {
		font-size: var(--fs-sm);
	}
	.intro strong {
		color: var(--text-2);
		font-weight: var(--fw-medium);
	}
	.code-box {
		position: relative;
		display: grid;
		justify-items: center;
		gap: var(--space-1);
		margin-top: var(--space-5);
		padding: var(--space-6) var(--space-4) var(--space-5);
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		overflow: hidden;
	}
	.code {
		font-family: var(--font-display);
		font-size: var(--fs-stat);
		font-weight: var(--fw-medium);
		letter-spacing: 0.08em;
		line-height: 1.1;
		white-space: nowrap;
	}
	.code.faint {
		color: var(--text-faint);
	}
	.timer {
		font-size: var(--fs-sm);
	}
	.bar {
		position: absolute;
		left: 0;
		bottom: 0;
		height: 2px;
		width: calc(var(--p) * 100%);
		background: var(--text-muted);
		transition: width 1s linear;
	}
	.qr {
		display: grid;
		justify-items: center;
		gap: var(--space-2);
		margin: var(--space-5) 0 0;
	}
	.qr svg {
		width: min(196px, 60vw);
		height: auto;
		border-radius: var(--radius-md);
	}
	/* Dark-on-light: every phone camera reads it (inverted codes are hit-and-miss). */
	.qr-bg {
		fill: var(--text);
	}
	.qr-fg {
		fill: var(--bg);
	}
	figcaption {
		max-width: 100%;
		font-size: var(--fs-xs);
		text-align: center;
		overflow-wrap: anywhere;
	}
	.url {
		color: var(--text-2);
	}
	.error {
		margin-top: var(--space-4);
		color: var(--danger);
		font-size: var(--fs-sm);
	}
	.actions {
		display: flex;
		justify-content: flex-end;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin-top: var(--space-6);
	}
	.done {
		display: grid;
		justify-items: center;
		gap: var(--space-3);
		padding: var(--space-4) 0 0;
		color: var(--success);
		text-align: center;
	}
	.done p {
		color: var(--text);
	}
	.done .actions {
		justify-content: center;
	}
</style>
