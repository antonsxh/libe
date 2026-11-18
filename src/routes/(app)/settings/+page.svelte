<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import {
		Globe,
		LogOut,
		Monitor,
		Pencil,
		QrCode,
		Settings2,
		Smartphone,
		Tablet,
		Trash2
	} from '@lucide/svelte';
	import Button from '#lib/components/Button.svelte';
	import Dialog from '#lib/components/Dialog.svelte';
	import Menu from '#lib/components/Menu.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import PomodoroSettingsDialog from '#lib/components/focus/PomodoroSettingsDialog.svelte';
	import PairDeviceDialog from '#lib/components/settings/PairDeviceDialog.svelte';
	import { formatAgo, type DeviceKind } from '#lib/auth.ts';
	import { useTimer } from '#lib/timer-store.svelte.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const timer = useTimer();
	const pomodoro = $derived(timer.settings);

	/** This device first, then by last activity (server order). */
	const devices = $derived(
		[...data.devices].sort(
			(a, b) => Number(b.id === data.currentId) - Number(a.id === data.currentId)
		)
	);
	const now = $derived(new Date(data.now));

	// Local state (not `$derived`): `refreshAll()` after a pairing reloads `data` and must not
	// close the dialog. `?pair` (avatar menu) opens it on navigation.
	// svelte-ignore state_referenced_locally
	let pairOpen = $state(data.pairOpen);
	$effect(() => {
		if (data.pairOpen) pairOpen = true;
	});
	let pomodoroOpen = $state(false);
	let editingId = $state<string | null>(null);
	let confirm = $state<{ id: string; name: string; self: boolean } | null>(null);
	let confirmOpen = $state(false);

	function closePair() {
		pairOpen = false;
		// Drop `?pair` so a reload doesn't reopen the dialog.
		if (page.url.searchParams.has('pair')) void goto('/settings', { replace: true, reset: false });
	}

	const KIND_LABEL: Record<DeviceKind, string> = {
		browser: 'Browser',
		pwa: 'Home-screen app',
		tauri: 'Desktop app'
	};

	function kindIcon(kind: DeviceKind, name: string) {
		if (kind === 'tauri') return Monitor;
		if (kind === 'pwa') return /iPad|tablet/i.test(name) ? Tablet : Smartphone;
		return Globe;
	}

	const fmtDate = (d: Date) =>
		d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

	/** Rename inline: close the editor once the list is refreshed. */
	const onRename: SubmitFunction = () => {
		return async ({ result, update }) => {
			await update({ reset: false });
			if (result.type === 'success') editingId = null;
		};
	};

	/** Revoke: revoking this device redirects to /pair → full reload (cookie is gone). */
	const onRevoke: SubmitFunction = () => {
		return async ({ result, update }) => {
			if (result.type === 'redirect') {
				location.assign(result.location);
				return;
			}
			await update();
			confirmOpen = false;
		};
	};

	$effect(() => {
		if (!confirmOpen) confirm = null;
	});

	const renameError = $derived(
		form && 'intent' in form && form.intent === 'rename' && 'error' in form ? form : null
	);
</script>

<svelte:head><title>Settings · libe</title></svelte:head>

<PageHeader title="Settings" subtitle="Paired devices and focus timer." />

<div class="sections">
	<section class="card section" aria-labelledby="devices-title">
		<header class="section-head">
			<div>
				<h2 id="devices-title" class="label">Devices</h2>
				<p class="muted desc">
					Every browser, home-screen app and desktop app that can open libe. Revoke one to sign it
					out everywhere at once.
				</p>
			</div>
			<Button variant="primary" onclick={() => (pairOpen = true)}>
				<QrCode size={16} /> Pair new device
			</Button>
		</header>

		<ul class="devices">
			{#each devices as device (device.id)}
				{@const Icon = kindIcon(device.kind, device.name)}
				{@const self = device.id === data.currentId}
				<li class="device" class:self>
					<span class="icon" aria-hidden="true"><Icon size={18} strokeWidth={1.75} /></span>
					<div class="info">
						{#if editingId === device.id}
							<form class="rename" method="POST" action="?/rename" use:enhance={onRename}>
								<input type="hidden" name="id" value={device.id} />
								<!-- svelte-ignore a11y_autofocus -->
								<input
									name="name"
									value={device.name}
									maxlength="60"
									required
									autofocus
									aria-label="Device name"
									onkeydown={(e) => e.key === 'Escape' && (editingId = null)}
								/>
								<Button variant="primary" size="sm" type="submit">Save</Button>
								<Button variant="ghost" size="sm" onclick={() => (editingId = null)}>Cancel</Button>
							</form>
							{#if renameError && renameError.id === device.id}
								<p class="error" role="alert">{renameError.error}</p>
							{/if}
						{:else}
							<p class="name">
								<span class="name-text">{device.name}</span>
								{#if self}<span class="badge">This device</span>{/if}
							</p>
						{/if}
						<p class="meta muted">
							<span>{KIND_LABEL[device.kind]}</span>
							<span aria-hidden="true">·</span>
							<span>Paired {fmtDate(device.pairedAt)}</span>
							<span aria-hidden="true">·</span>
							<span>
								{#if self}Active now{:else if device.lastSeenAt}Last seen {formatAgo(
										device.lastSeenAt,
										now
									)}{:else}Never seen{/if}
							</span>
						</p>
					</div>
					<Menu label={`Actions for ${device.name}`}>
						{#snippet children(close)}
							<button
								type="button"
								class="item"
								role="menuitem"
								onclick={() => {
									close();
									editingId = device.id;
								}}
							>
								<Pencil size={14} /> Rename…
							</button>
							<button
								type="button"
								class="item danger"
								role="menuitem"
								onclick={() => {
									close();
									confirm = { id: device.id, name: device.name, self };
									confirmOpen = true;
								}}
							>
								{#if self}<LogOut size={14} /> Sign out{:else}<Trash2 size={14} /> Revoke…{/if}
							</button>
						{/snippet}
					</Menu>
				</li>
			{/each}
		</ul>

		<form class="signout" method="POST" action="/settings?/signout">
			<Button variant="ghost" type="submit"><LogOut size={16} /> Sign out this device</Button>
		</form>
	</section>

	<section class="card section" aria-labelledby="focus-title">
		<header class="section-head">
			<div>
				<h2 id="focus-title" class="label">Focus timer</h2>
				<p class="muted desc tabular">
					Pomodoro: {pomodoro.focusMin} min focus · {pomodoro.shortBreakMin} min break · {pomodoro.longBreakMin}
					min long break every {pomodoro.longBreakEvery} rounds{pomodoro.autoStart
						? ' · auto-start'
						: ''}
				</p>
			</div>
			<Button variant="secondary" onclick={() => (pomodoroOpen = true)}>
				<Settings2 size={16} /> Pomodoro settings
			</Button>
		</header>
	</section>
</div>

{#if pairOpen}
	<PairDeviceDialog onclose={closePair} />
{/if}

{#if pomodoroOpen}
	<PomodoroSettingsDialog
		settings={pomodoro}
		form={form && 'intent' in form && form.intent === 'settings' ? form : null}
		onclose={() => (pomodoroOpen = false)}
	/>
{/if}

{#if confirm}
	<Dialog bind:open={confirmOpen} title={confirm.self ? 'Sign out this device?' : 'Revoke device?'}>
		<p class="confirm-text">
			{#if confirm.self}
				<strong>{confirm.name}</strong> will be signed out. To use libe here again you’ll need a pairing
				code from another device (or the setup secret).
			{:else}
				<strong>{confirm.name}</strong> will be signed out immediately and can’t open libe until it is
				paired again.
			{/if}
		</p>
		<form method="POST" action="?/revoke" use:enhance={onRevoke} class="confirm-actions">
			<input type="hidden" name="id" value={confirm.id} />
			<Button variant="secondary" onclick={() => (confirmOpen = false)}>Cancel</Button>
			<Button variant="primary" type="submit">{confirm.self ? 'Sign out' : 'Revoke'}</Button>
		</form>
	</Dialog>
{/if}

<style>
	.sections {
		display: grid;
		gap: var(--space-6);
		max-width: 880px;
	}
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

	.devices {
		list-style: none;
		margin: var(--space-6) 0 0;
		padding: 0;
		border-top: 1px solid var(--border);
	}
	.device {
		display: flex;
		align-items: center;
		gap: var(--space-4);
		padding: var(--space-4) 0;
		border-bottom: 1px solid var(--border);
		min-width: 0;
	}
	.icon {
		flex: none;
		display: grid;
		place-items: center;
		width: 40px;
		height: 40px;
		border-radius: var(--radius-md);
		background: var(--surface-2);
		color: var(--text-muted);
	}
	.self .icon {
		color: var(--accent);
	}
	.info {
		flex: 1;
		min-width: 0;
		display: grid;
		gap: var(--space-1);
	}
	.name {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-width: 0;
		font-weight: var(--fw-medium);
	}
	.name-text {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.badge {
		flex: none;
		padding: 1px var(--space-2);
		border: 1px solid color-mix(in srgb, var(--accent) 45%, transparent);
		border-radius: var(--radius-pill);
		color: var(--accent);
		font-size: var(--fs-xs);
		font-weight: var(--fw-medium);
	}
	.meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0 var(--space-2);
		font-size: var(--fs-sm);
	}
	.rename {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
	}
	.rename input {
		flex: 1 1 180px;
		min-width: 0;
		height: 32px;
		padding: 0 var(--space-3);
		background: var(--bg);
		border: 1px solid var(--accent);
		border-radius: var(--radius-md);
		font-size: var(--fs-md);
	}
	.error {
		color: var(--danger);
		font-size: var(--fs-sm);
	}
	.signout {
		margin-top: var(--space-4);
		display: flex;
		justify-content: flex-end;
	}

	.item {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		width: 100%;
		padding: var(--space-2) var(--space-3);
		background: transparent;
		border: none;
		border-radius: var(--radius-sm);
		color: var(--text-2);
		font-size: var(--fs-sm);
		text-align: left;
		white-space: nowrap;
	}
	.item:hover {
		background: var(--surface-hover);
		color: var(--text);
	}
	.item.danger {
		color: var(--danger);
	}

	.confirm-text {
		color: var(--text-2);
	}
	.confirm-actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-2);
		margin-top: var(--space-6);
	}

	@media (max-width: 600px) {
		.section {
			padding: var(--space-5) var(--space-4);
		}
		.section-head :global(.btn) {
			width: 100%;
		}
	}
</style>
