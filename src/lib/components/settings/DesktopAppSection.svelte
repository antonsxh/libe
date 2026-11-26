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

	/**
	 * Settings → Desktop app (only inside the app): version, update track, status with
	 * check / restart, and "Change server / Unpair…" as grouped rows — `pane` on wider screens
	 * (the heading is the pane's title), `group` in the phone list.
	 */
	type Props = { serverVersion: string; variant?: 'pane' | 'group' };
	let { serverVersion, variant = 'group' }: Props = $props();
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
		if (!app || !update || track === update.track || switching) return;
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
	<section class="desktop {variant}" aria-labelledby="desktop-title">
		<h2 id="desktop-title" class="title">{t.desktop.title}</h2>
		<div class="rows">
			{#if managed}
				<div class="row stacked" data-testid="managed-by-nix">
					<p class="row-title">{t.desktop.nix.title}</p>
					<p class="desc">{t.desktop.nix.body}</p>
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
			{:else}
				<div class="row">
					<span class="row-title" id="track-title">{t.desktop.track}</span>
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
				<div class="row stacked status" role="status" data-phase={phase.kind}>
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
						<Button variant="secondary" onclick={install} disabled={installing}>
							{#if phase.needsPassword}<Download size={16} />
								{t.desktop.installRestart}{:else}<RotateCw size={16} />
								{t.desktop.restartToUpdate}{/if}
						</Button>
					{/if}
					{#if error}<p class="error" role="alert">{error}</p>{/if}
				</div>
				<button type="button" class="row action" onclick={check} disabled={busy}>
					<RefreshCw size={16} aria-hidden="true" />
					{t.desktop.check}
				</button>
			{/if}
			<div class="row stacked unpair">
				{#if confirmUnpair}
					<div class="confirm" role="group" aria-labelledby="unpair-title">
						<p id="unpair-title">{t.desktop.unpairConfirm}</p>
						<div class="confirm-buttons">
							<Button
								variant="secondary"
								onclick={() => (confirmUnpair = false)}
								disabled={unpairing}
							>
								{t.common.cancel}
							</Button>
							<Button variant="secondary" onclick={unpair} disabled={unpairing}>
								{unpairing ? t.desktop.unpairing : t.desktop.unpairConfirmButton}
							</Button>
						</div>
					</div>
				{:else}
					<button
						type="button"
						class="action danger"
						onclick={() => {
							unpairError = null;
							confirmUnpair = true;
						}}
					>
						<LogOut size={16} aria-hidden="true" />
						{t.desktop.unpair}
					</button>
					<p class="desc">{t.desktop.unpairDesc}</p>
				{/if}
				{#if unpairError}<p class="error" role="alert">{unpairError}</p>{/if}
			</div>
		</div>
		<p class="foot">
			<span class="tabular" data-testid="app-version">libe {update.version}</span>
			{managed ? t.desktop.nix.desc : t.desktop.desc}
			{#if !managed}{t.desktop.trackDesc}{/if}
		</p>
		<p class="foot" data-testid="server-version">
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
	</section>
{/if}

<style>
	.desktop {
		display: grid;
		gap: var(--space-2);
		min-width: 0;
	}
	.title {
		padding: 0 var(--grouped-inset);
		font-size: var(--fs-label);
		font-weight: var(--fw-semibold);
		color: var(--text-muted);
	}
	.pane .title {
		padding: 0 0 var(--space-3);
		font-size: var(--fs-xl);
		font-weight: var(--fw-bold);
		letter-spacing: var(--tracking-title);
		color: var(--text);
	}
	.rows {
		overflow: hidden;
		border-radius: var(--grouped-radius);
		background: var(--grouped-bg);
	}
	.row {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: var(--space-2) var(--space-3);
		width: 100%;
		min-height: var(--grouped-row-h);
		padding: var(--space-2) var(--grouped-inset);
	}
	.row + .row::before {
		content: '';
		position: absolute;
		top: 0;
		left: var(--grouped-inset);
		right: 0;
		height: 1px;
		background: var(--grouped-separator);
	}
	.stacked {
		flex-direction: column;
		align-items: flex-start;
		padding-block: var(--space-3);
	}
	.row-title {
		font-weight: var(--fw-regular);
	}
	.desc,
	.status {
		font-size: var(--fs-sm);
		color: var(--text-muted);
	}
	.status p {
		color: var(--text-2);
	}
	.action {
		display: inline-flex;
		align-items: center;
		justify-content: flex-start;
		gap: var(--space-2);
		border: 0;
		background: transparent;
		color: var(--accent-text);
		font-size: var(--fs-md);
		text-align: left;
	}
	.row.action {
		justify-content: flex-start;
	}
	.action:disabled {
		color: var(--text-faint);
		cursor: default;
	}
	.action.danger {
		padding: 0;
		color: var(--danger);
	}
	.tracks {
		display: inline-flex;
		padding: 2px;
		border-radius: calc(var(--radius-md) + 1px);
		background: var(--segmented-bg);
	}
	.tracks label {
		position: relative;
		padding: var(--space-1) var(--space-4);
		border-radius: calc(var(--radius-md) - 1px);
		color: var(--text-2);
		font-size: var(--fs-sm);
		cursor: pointer;
	}
	.tracks label.on {
		background: var(--segmented-thumb);
		box-shadow: var(--segmented-shadow);
		color: var(--text);
		font-weight: var(--fw-semibold);
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
		font-size: var(--fs-sm);
	}
	.foot {
		padding: 0 var(--grouped-inset);
		font-size: var(--fs-xs);
		color: var(--text-muted);
	}
	.nix {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: var(--space-2) var(--space-4);
		margin-top: var(--space-2);
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
		display: grid;
		gap: var(--space-3);
		font-size: var(--fs-sm);
	}
	.confirm-buttons {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	code {
		font-family: var(--font-mono);
		font-size: var(--fs-xs);
	}
</style>
