<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import {
		ChevronRight,
		Globe,
		LogOut,
		Monitor,
		Plus,
		Smartphone,
		Tablet,
		Trash2
	} from '@lucide/svelte';
	import Button from '#lib/components/Button.svelte';
	import Dialog from '#lib/components/Dialog.svelte';
	import GroupedList from '#lib/components/GroupedList.svelte';
	import GroupedRow from '#lib/components/GroupedRow.svelte';
	import SaveStatus from './SaveStatus.svelte';
	import SettingsTile from './SettingsTile.svelte';
	import { createAutosave } from '#lib/autosave.svelte.ts';
	import { formAction } from '#lib/form-action.ts';
	import { DEVICE_NAME_MAX, formatAgo, type DeviceKind } from '#lib/auth.ts';
	import { useI18n } from '#lib/i18n/context.svelte.ts';

	/**
	 * Settings → Devices: one row per paired device (this one first, marked), a row opens the
	 * device's sheet — its name (saves when committed, the `rename` action), kind, pairing date,
	 * last activity and Revoke / Sign out (a confirmation, the `revoke` action) — and
	 * "Pair a device" as the add row.
	 */
	type Device = {
		id: string;
		name: string;
		kind: DeviceKind;
		pairedAt: Date;
		lastSeenAt: Date | null;
	};
	type Props = {
		devices: Device[];
		currentId: string;
		now: Date;
		renameError: { id: string | null; error: string } | null;
		header?: string;
		onpair: () => void;
	};
	let { devices, currentId, now, renameError, header, onpair }: Props = $props();
	const t = useI18n();
	const id = $props.id();

	function kindIcon(kind: DeviceKind, name: string) {
		if (kind === 'tauri') return Monitor;
		if (kind === 'pwa') return /iPad|tablet/i.test(name) ? Tablet : Smartphone;
		return Globe;
	}
	const fmtDate = (d: Date) =>
		d.toLocaleDateString(t.intl, { month: 'short', day: 'numeric', year: 'numeric' });
	const activity = (d: Device) =>
		d.id === currentId
			? t.settings.activeNow
			: d.lastSeenAt
				? t.settings.lastSeen(formatAgo(d.lastSeenAt, now, t))
				: t.settings.neverSeen;
	const sub = (d: Device) =>
		d.id === currentId
			? `${t.settings.thisDevice} · ${t.settings.activeNow}`
			: `${t.settings.kinds[d.kind]} · ${activity(d)}`;

	/* ── The device sheet ── */
	let selectedId = $state<string | null>(null);
	let sheetOpen = $state(false);
	const selected = $derived(devices.find((d) => d.id === selectedId) ?? null);
	let confirm = $state<{ id: string; name: string; self: boolean } | null>(null);
	let confirmOpen = $state(false);
	/** Revoke was tapped: the confirmation opens once the sheet is gone. */
	let pendingConfirm: { id: string; name: string; self: boolean } | null = null;

	function open(device: Device) {
		selectedId = device.id;
		sheetOpen = true;
	}
	function askRevoke(device: Device) {
		pendingConfirm = { id: device.id, name: device.name, self: device.id === currentId };
		sheetOpen = false;
	}
	function sheetClosed() {
		selectedId = null;
		if (pendingConfirm) {
			confirm = pendingConfirm;
			pendingConfirm = null;
			confirmOpen = true;
		}
	}

	let name = $derived(selected?.name ?? '');
	const rename = createAutosave();

	/** Revoke: revoking this device redirects to /pair → full reload (the cookie is gone). */
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
</script>

<GroupedList
	{header}
	label={header ? undefined : t.settings.devices}
	footer={t.settings.devicesDesc}
>
	{#each devices as device (device.id)}
		{@const Icon = kindIcon(device.kind, device.name)}
		{@const self = device.id === currentId}
		<button
			type="button"
			class="row press"
			aria-haspopup="dialog"
			data-testid="device-row"
			onclick={() => open(device)}
		>
			<SettingsTile color={self ? 'var(--tile-devices)' : 'var(--tile-neutral)'}>
				<Icon size={16} strokeWidth={2} />
			</SettingsTile>
			<span class="text">
				<span class="name">{device.name}</span>
				<span class="sub">{sub(device)}</span>
			</span>
			<ChevronRight size={16} class="chev" aria-hidden="true" />
		</button>
	{/each}
	<button type="button" class="row add press" aria-haspopup="dialog" onclick={onpair}>
		<span class="plus" aria-hidden="true"><Plus size={14} strokeWidth={3} /></span>
		<span class="text">{t.settings.pairRow}</span>
	</button>
</GroupedList>

{#if selected}
	{@const self = selected.id === currentId}
	<Dialog bind:open={sheetOpen} onclosed={sheetClosed} title={selected.name}>
		<div class="sheet">
			<form
				method="POST"
				action={formAction('rename')}
				novalidate
				use:enhance={rename.enhance}
				{@attach rename.form}
			>
				<input type="hidden" name="id" value={selected.id} />
				<GroupedList>
					<GroupedRow label={t.settings.deviceName} for="{id}-name">
						<input
							id="{id}-name"
							name="name"
							value={name}
							oninput={(e) => (name = e.currentTarget.value)}
							maxlength={DEVICE_NAME_MAX}
							enterkeyhint="done"
							autocomplete="off"
							aria-invalid={renameError?.id === selected.id ? 'true' : undefined}
						/>
					</GroupedRow>
				</GroupedList>
				{#if renameError && renameError.id === selected.id}
					<p class="error" role="alert">{renameError.error}</p>
				{/if}
			</form>
			<GroupedList label={selected.name}>
				<GroupedRow label={t.settings.deviceKind}>{t.settings.kinds[selected.kind]}</GroupedRow>
				<GroupedRow label={t.settings.devicePaired}>{fmtDate(selected.pairedAt)}</GroupedRow>
				<GroupedRow label={t.settings.deviceLastSeen}>{activity(selected)}</GroupedRow>
			</GroupedList>
			<GroupedList label={self ? t.settings.signOut : t.settings.revoke}>
				<button type="button" class="row danger" onclick={() => askRevoke(selected)}>
					{#if self}<LogOut size={16} aria-hidden="true" />
						{t.settings.signOut}{:else}<Trash2 size={16} aria-hidden="true" />
						{t.settings.revokeMenu}{/if}
				</button>
			</GroupedList>
			<SaveStatus />
		</div>
	</Dialog>
{/if}

{#if confirm}
	<Dialog
		bind:open={confirmOpen}
		onclosed={() => (confirm = null)}
		title={confirm.self ? t.settings.confirmSignOutTitle : t.settings.confirmRevokeTitle}
	>
		<p class="confirm-text">
			<strong>{confirm.name}</strong>{confirm.self
				? t.settings.confirmSignOut
				: t.settings.confirmRevoke}
		</p>
		<form
			method="POST"
			action={formAction('revoke')}
			use:enhance={onRevoke}
			class="confirm-actions dialog-actions"
		>
			<input type="hidden" name="id" value={confirm.id} />
			<Button variant="secondary" onclick={() => (confirmOpen = false)}>{t.common.cancel}</Button>
			<Button variant="primary" type="submit">
				{confirm.self ? t.settings.signOut : t.settings.revoke}
			</Button>
		</form>
	</Dialog>
{/if}

<style>
	.row {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		width: 100%;
		min-height: var(--grouped-row-h);
		padding: var(--space-2) var(--space-3) var(--space-2) var(--grouped-inset);
		border: 0;
		background: transparent;
		color: var(--text);
		font-size: var(--fs-md);
		text-align: left;
		-webkit-tap-highlight-color: transparent;
		transition: background var(--dur) var(--ease);
	}
	@media (hover: hover) {
		.row:hover {
			background: var(--surface-hover);
		}
	}
	.row:active {
		background: var(--surface-2);
	}
	.text {
		flex: 1;
		min-width: 0;
		display: grid;
	}
	.name,
	.sub {
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	.sub {
		color: var(--text-muted);
		font-size: var(--fs-xs);
	}
	.row :global(.chev) {
		flex: none;
		color: var(--text-faint);
	}
	.add {
		color: var(--accent-text);
		font-weight: var(--fw-medium);
	}
	.plus {
		display: grid;
		place-items: center;
		flex: none;
		width: var(--row-check);
		height: var(--row-check);
		margin-inline: calc((var(--row-icon) - var(--row-check)) / 2);
		border-radius: 50%;
		background: var(--accent);
		color: var(--accent-ink);
	}
	.danger {
		color: var(--danger);
	}
	.sheet {
		--grouped-bg: var(--grouped-bg-raised);
		--grouped-separator: var(--grouped-separator-raised);
		display: grid;
		gap: var(--space-5);
	}
	.sheet form {
		display: grid;
		gap: var(--space-2);
	}
	.error {
		padding: 0 var(--grouped-inset);
		color: var(--danger);
		font-size: var(--fs-xs);
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
</style>
