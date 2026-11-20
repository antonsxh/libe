<script lang="ts">
	import { onMount } from 'svelte';
	import { Download, LogOut, RefreshCw, RotateCw } from '@lucide/svelte';
	import Button from '#lib/components/Button.svelte';
	import { formatAgo } from '#lib/auth.ts';
	import {
		UPDATE_TRACKS,
		commandErrorText,
		desktopApp,
		downloadPercent,
		isBusy,
		phaseText,
		trackOfVersion,
		unpairErrorText,
		type DesktopApp,
		type UpdateState,
		type UpdateTrack
	} from '#lib/desktop.ts';
	import { useI18n } from '#lib/i18n/context.svelte.ts';

	type Props = { serverVersion: string };
	let { serverVersion }: Props = $props();
	const t = useI18n();

	/** Only inside the desktop app; stays hidden in browsers, the PWA and during SSR. */
	let app = $state<DesktopApp | null>(null);
	let update = $state<UpdateState | null>(null);
	let error = $state<string | null>(null);
	let switching = $state(false);
	let installing = $state(false);
	let now = $state(Date.now());
	/** "Change server / Unpair…": the inline confirmation is open. */
	let confirmUnpair = $state(false);
	let unpairing = $state(false);
	let unpairError = $state<string | null>(null);

	const phase = $derived(update?.phase ?? { kind: 'idle' as const });
	/** Nix builds don't update themselves: no check button, no tracks, no status line. */
	const managed = $derived(update?.managedBy === 'nix');
	const percent = $derived(downloadPercent(phase));
	const serverTrack = $derived(trackOfVersion(serverVersion));
	const busy = $derived(isBusy(phase) || switching || installing);

	async function run<T>(action: () => Promise<T>): Promise<T | undefined> {
		error = null;
		try {
			return await action();
		} catch (e) {
			error = commandErrorText(e, t);
		}
	}

	async function refresh() {
		if (!app) return;
		try {
			update = await app.state();
			now = Date.now();
		} catch {
			// The app didn't grant this origin the update commands (should not happen once
			// paired): hide the section rather than show a broken one.
			update = null;
		}
	}

	async function setTrack(track: UpdateTrack) {
		if (!app || !update || track === update.track) return;
		switching = true;
		const next = await run(() => app!.setTrack(track));
		if (next) update = next;
		switching = false;
	}

	async function check() {
		const next = await run(() => app!.check());
		if (next) update = next;
	}

	async function install() {
		installing = true;
		await run(() => app!.install()); // restarts the app on success
		installing = false;
		await refresh();
	}

	async function unpair() {
		if (!app) return;
		unpairing = true;
		unpairError = null;
		try {
			await app.unpair(); // the app leaves this page for its pairing screen
		} catch (e) {
			unpairError = unpairErrorText(e, t);
			unpairing = false;
			confirmUnpair = false;
		}
	}

	onMount(() => {
		app = desktopApp();
		void refresh();
	});

	// Poll: every second while checking/downloading, otherwise every 30 s (the app also
	// checks on its own every few hours).
	$effect(() => {
		if (!app || !update) return;
		const timer = setTimeout(refresh, isBusy(update.phase) ? 1000 : 30_000);
		return () => clearTimeout(timer);
	});
</script>

{#if app && update}
	<section class="card section" aria-labelledby="desktop-title">
		<header class="section-head">
			<div>
				<h2 id="desktop-title" class="label">{t.desktop.title}</h2>
				<p class="muted desc">
					<span class="tabular" data-testid="app-version">libe {update.version}</span>
					{managed ? t.desktop.nix.desc : t.desktop.desc}
				</p>
			</div>
			{#if !managed}
				<Button variant="secondary" onclick={check} disabled={busy}>
					<RefreshCw size={16} />
					{t.desktop.check}
				</Button>
			{/if}
		</header>

		{#if managed}
			<div class="row" data-testid="managed-by-nix">
				<div class="row-text">
					<p class="row-title">{t.desktop.nix.title}</p>
					<p class="muted desc">{t.desktop.nix.body}</p>
					<dl class="nix">
						<dt>{t.desktop.nix.update}</dt>
						<dd><code>nix flake update libe</code> {t.desktop.nix.rebuild}</dd>
						<dt>{t.desktop.nix.track}</dt>
						<dd>
							<code>channel/stable</code>
							{t.desktop.nix.or}
							<code>channel/nightly</code>
							{t.desktop.nix.trackNote}
						</dd>
					</dl>
				</div>
			</div>
		{:else}
			<div class="row">
				<div class="row-text">
					<p class="row-title" id="track-title">{t.desktop.track}</p>
					<p class="muted desc">{t.desktop.trackDesc}</p>
				</div>
				<div class="tracks" role="radiogroup" aria-labelledby="track-title">
					{#each UPDATE_TRACKS as track (track)}
						<label class:on={update.track === track}>
							<input
								type="radio"
								name="update-track"
								value={track}
								checked={update.track === track}
								disabled={switching || phase.kind === 'installing'}
								onchange={() => setTrack(track)}
							/>
							{t.desktop.tracks[track]}
						</label>
					{/each}
				</div>
			</div>

			<div class="status" role="status" data-phase={phase.kind}>
				<p class:error={phase.kind === 'failed'}>
					{phaseText(phase, t)}
					{#if update.checkedAt && (phase.kind === 'upToDate' || phase.kind === 'failed')}
						<span class="muted">
							{t.desktop.checked(formatAgo(new Date(update.checkedAt), new Date(now), t))}
						</span>
					{/if}
				</p>
				{#if percent !== null}
					<div
						class="bar"
						role="progressbar"
						aria-label={t.desktop.downloadProgress}
						aria-valuenow={percent}
						aria-valuemin={0}
						aria-valuemax={100}
					>
						<span style:width="{percent}%"></span>
					</div>
				{/if}
				{#if phase.kind === 'ready'}
					<Button variant="primary" onclick={install} disabled={installing}>
						{#if phase.needsPassword}<Download size={16} />
							{t.desktop.installRestart}{:else}<RotateCw size={16} />
							{t.desktop.restartToUpdate}{/if}
					</Button>
				{/if}
				{#if error}<p class="error" role="alert">{error}</p>{/if}
			</div>
		{/if}

		<p class="muted desc server" data-testid="server-version">
			{#if serverTrack}
				{t.desktop.serverRuns(serverVersion, t.desktop.tracks[serverTrack])}
				{#if serverTrack !== update.track}
					{t.desktop.otherTrackBefore}<code>:{update.track}</code>{t.desktop.otherTrackAfter(
						t.desktop.tracks[update.track]
					)}
				{:else}
					{t.desktop.sameTrackBefore}<code>:{serverTrack}</code>{t.desktop.sameTrackAfter}
				{/if}
			{:else}
				{t.desktop.devServer(serverVersion)}
			{/if}
		</p>

		<div class="row unpair">
			<div class="row-text">
				<p class="row-title" id="unpair-title">{t.desktop.unpairTitle}</p>
				<p class="muted desc">{t.desktop.unpairDesc}</p>
			</div>
			{#if confirmUnpair}
				<div class="confirm" role="group" aria-labelledby="unpair-title">
					<p>{t.desktop.unpairConfirm}</p>
					<Button variant="secondary" onclick={() => (confirmUnpair = false)} disabled={unpairing}>
						{t.common.cancel}
					</Button>
					<Button variant="primary" onclick={unpair} disabled={unpairing}>
						{unpairing ? t.desktop.unpairing : t.desktop.unpairConfirmButton}
					</Button>
				</div>
			{:else}
				<Button
					variant="secondary"
					onclick={() => {
						unpairError = null;
						confirmUnpair = true;
					}}
				>
					<LogOut size={16} />
					{t.desktop.unpair}
				</Button>
			{/if}
			{#if unpairError}<p class="error unpair-error" role="alert">{unpairError}</p>{/if}
		</div>
	</section>
{/if}

<style>
	.section {
		padding: var(--space-6);
		border-radius: var(--radius-xl);
		min-width: 0;
	}
	.section-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: var(--space-4);
	}
	.section-head > div {
		flex: 1 1 280px;
		min-width: 0;
	}
	.desc {
		margin-top: var(--space-2);
		font-size: var(--fs-sm);
		max-width: 56ch;
	}
	.row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: var(--space-4);
		margin-top: var(--space-6);
		padding-top: var(--space-5);
		border-top: 1px solid var(--border);
	}
	.row-text {
		flex: 1 1 280px;
		min-width: 0;
	}
	.row-title {
		font-weight: var(--fw-medium);
	}
	.tracks {
		display: inline-flex;
		padding: 3px;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--bg);
	}
	.tracks label {
		position: relative;
		padding: var(--space-2) var(--space-5);
		border-radius: var(--radius-sm);
		color: var(--text-muted);
		font-size: var(--fs-sm);
		cursor: pointer;
	}
	.tracks label.on {
		background: var(--surface-2);
		color: var(--text);
		font-weight: var(--fw-medium);
	}
	.tracks label:has(:focus-visible) {
		box-shadow: var(--ring);
	}
	.tracks label:has(:disabled) {
		cursor: default;
	}
	.tracks input {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}
	.status {
		display: grid;
		justify-items: start;
		gap: var(--space-3);
		margin-top: var(--space-5);
		padding-top: var(--space-5);
		border-top: 1px solid var(--border);
		font-size: var(--fs-sm);
		color: var(--text-2);
	}
	.bar {
		width: min(100%, 360px);
		height: 4px;
		border-radius: var(--radius-pill);
		background: var(--track);
		overflow: hidden;
	}
	.bar span {
		display: block;
		height: 100%;
		background: var(--accent);
		transition: width var(--dur) var(--ease);
	}
	.error {
		color: var(--danger);
	}
	.server {
		margin-top: var(--space-5);
	}
	.nix {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: var(--space-2) var(--space-4);
		margin-top: var(--space-4);
		font-size: var(--fs-sm);
		color: var(--text-2);
	}
	.nix dt {
		color: var(--text-muted);
	}
	.nix dd {
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.confirm {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--space-3);
		font-size: var(--fs-sm);
	}
	.unpair-error {
		flex-basis: 100%;
		font-size: var(--fs-sm);
	}
	code {
		font-family: var(--font-mono);
		font-size: var(--fs-xs);
	}
	@media (max-width: 600px) {
		.section {
			padding: var(--space-5) var(--space-4);
		}
	}
</style>
