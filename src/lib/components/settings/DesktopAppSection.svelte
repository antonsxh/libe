<script lang="ts">
	import { onMount } from 'svelte';
	import { Download, RefreshCw, RotateCw } from '@lucide/svelte';
	import Button from '#lib/components/Button.svelte';
	import { formatAgo } from '#lib/auth.ts';
	import {
		UPDATE_TRACKS,
		desktopApp,
		downloadPercent,
		isBusy,
		phaseText,
		trackLabel,
		trackOfVersion,
		type DesktopApp,
		type UpdateState,
		type UpdateTrack
	} from '#lib/desktop.ts';

	type Props = { serverVersion: string };
	let { serverVersion }: Props = $props();

	/** Only inside the desktop app; stays hidden in browsers, the PWA and during SSR. */
	let app = $state<DesktopApp | null>(null);
	let update = $state<UpdateState | null>(null);
	let error = $state<string | null>(null);
	let switching = $state(false);
	let installing = $state(false);
	let now = $state(Date.now());

	const phase = $derived(update?.phase ?? { kind: 'idle' as const });
	const percent = $derived(downloadPercent(phase));
	const serverTrack = $derived(trackOfVersion(serverVersion));
	const busy = $derived(isBusy(phase) || switching || installing);

	async function run<T>(action: () => Promise<T>): Promise<T | undefined> {
		error = null;
		try {
			return await action();
		} catch (e) {
			error = String(e);
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
				<h2 id="desktop-title" class="label">Desktop app</h2>
				<p class="muted desc">
					<span class="tabular" data-testid="app-version">libe {update.version}</span>
					· updates download in the background and install when you restart the app.
				</p>
			</div>
			<Button variant="secondary" onclick={check} disabled={busy}>
				<RefreshCw size={16} /> Check for updates
			</Button>
		</header>

		<div class="row">
			<div class="row-text">
				<p class="row-title" id="track-title">Update track</p>
				<p class="muted desc">
					Stable gets tested releases, Nightly the newest build of libe. Switching installs the
					newest build of that track, even when it is older than this one.
				</p>
			</div>
			<div class="tracks" role="radiogroup" aria-labelledby="track-title">
				{#each UPDATE_TRACKS as track (track.value)}
					<label class:on={update.track === track.value}>
						<input
							type="radio"
							name="update-track"
							value={track.value}
							checked={update.track === track.value}
							disabled={switching || phase.kind === 'installing'}
							onchange={() => setTrack(track.value)}
						/>
						{track.label}
					</label>
				{/each}
			</div>
		</div>

		<div class="status" role="status" data-phase={phase.kind}>
			<p class:error={phase.kind === 'failed'}>
				{phaseText(phase)}
				{#if update.checkedAt && (phase.kind === 'upToDate' || phase.kind === 'failed')}
					<span class="muted">Checked {formatAgo(new Date(update.checkedAt), new Date(now))}.</span>
				{/if}
			</p>
			{#if percent !== null}
				<div
					class="bar"
					role="progressbar"
					aria-label="Download progress"
					aria-valuenow={percent}
					aria-valuemin={0}
					aria-valuemax={100}
				>
					<span style:width="{percent}%"></span>
				</div>
			{/if}
			{#if phase.kind === 'ready'}
				<Button variant="primary" onclick={install} disabled={installing}>
					{#if phase.needsPassword}<Download size={16} /> Install and restart{:else}<RotateCw
							size={16}
						/> Restart to update{/if}
				</Button>
			{/if}
			{#if error}<p class="error" role="alert">{error}</p>{/if}
		</div>

		<p class="muted desc server" data-testid="server-version">
			{#if serverTrack}
				Your server runs libe {serverVersion} ({trackLabel(serverTrack)}).
				{#if serverTrack !== update.track}
					It updates separately, with its Docker image: use the <code>:{update.track}</code> tag to
					put it on {trackLabel(update.track)} too.
				{:else}
					It updates separately, with its Docker image (<code>:{serverTrack}</code>).
				{/if}
			{:else}
				Your server runs a development build of libe ({serverVersion}).
			{/if}
		</p>
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
