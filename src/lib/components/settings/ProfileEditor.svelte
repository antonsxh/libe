<script lang="ts">
	import { tick } from 'svelte';
	import { enhance } from '$app/forms';
	import Avatar from '#lib/components/Avatar.svelte';
	import ColorSwatches from '#lib/components/ColorSwatches.svelte';
	import EmojiPicker from '#lib/components/EmojiPicker.svelte';
	import GroupedList from '#lib/components/GroupedList.svelte';
	import GroupedRow from '#lib/components/GroupedRow.svelte';
	import SegmentedControl from '#lib/components/SegmentedControl.svelte';
	import NoJsSave from './NoJsSave.svelte';
	import { createAutosave } from '#lib/autosave.svelte.ts';
	import { formAction } from '#lib/form-action.ts';
	import { AVATAR_EMOJIS, isSingleEmoji } from '#lib/emoji.ts';
	import { AVATAR_STYLES, type AvatarStyle, type Profile } from '#lib/profile.ts';
	import { useI18n } from '#lib/i18n/context.svelte.ts';

	/** Settings → Profile: name, initials or emoji, colour — each change saves itself. */
	type Failure = {
		values: { displayName: string; avatarColor: string; avatarStyle: string; avatarEmoji: string };
		errors: { displayName?: string; avatarColor?: string; avatarEmoji?: string };
	};
	type Props = { profile: Profile; failure: Failure | null };
	let { profile, failure }: Props = $props();
	const t = useI18n();
	const id = $props.id();

	// The fields follow the stored profile (after a save: the normalised name), or echo the
	// rejected input; typing overrides them locally.
	let displayName = $derived(failure?.values.displayName ?? profile.displayName ?? '');
	let avatarColor = $derived(failure?.values.avatarColor ?? profile.avatarColor);
	let avatarStyle = $derived<AvatarStyle>(
		failure
			? failure.values.avatarStyle === 'emoji'
				? 'emoji'
				: 'initials'
			: profile.avatarEmoji
				? 'emoji'
				: 'initials'
	);
	let avatarEmoji = $derived(failure?.values.avatarEmoji ?? profile.avatarEmoji ?? '');
	/** Live preview: a valid emoji while "Emoji" is chosen, else the initials. */
	const previewEmoji = $derived.by(() => {
		const e = avatarEmoji.trim();
		return avatarStyle === 'emoji' && e && isSingleEmoji(e) ? e : null;
	});

	const save = createAutosave({
		// "Emoji" without an emoji yet only reveals the picker: saving it would mean initials.
		skip: (target) =>
			target instanceof HTMLInputElement &&
			target.name === 'avatarStyle' &&
			target.value === 'emoji' &&
			!avatarEmoji.trim()
	});
	const styles = $derived(
		AVATAR_STYLES.map((s) => ({ value: s, label: t.settings.avatarStyles[s] }))
	);
</script>

<form
	class="editor"
	method="POST"
	action={formAction('profile')}
	novalidate
	use:enhance={save.enhance}
	{@attach save.form}
>
	<div class="avatar">
		<Avatar name={displayName} color={avatarColor} emoji={previewEmoji} size="lg" />
	</div>
	<GroupedList label={t.settings.profile} describedby="{id}-name-hint">
		<GroupedRow label={t.settings.displayName} for="{id}-name">
			<input
				id="{id}-name"
				name="displayName"
				value={displayName}
				oninput={(e) => (displayName = e.currentTarget.value)}
				placeholder={t.settings.displayNamePlaceholder}
				autocomplete="name"
				enterkeyhint="done"
				aria-invalid={failure?.errors.displayName ? 'true' : undefined}
				aria-describedby="{id}-name-hint"
			/>
		</GroupedRow>
		<GroupedRow label={t.settings.avatarStyle} labelId="{id}-style">
			<SegmentedControl
				name="avatarStyle"
				options={styles}
				labelledby="{id}-style"
				bind:value={() => avatarStyle, (v) => (avatarStyle = v === 'emoji' ? 'emoji' : 'initials')}
			/>
		</GroupedRow>
	</GroupedList>
	{#if failure?.errors.displayName}
		<p class="error" role="alert" id="{id}-name-hint">{failure.errors.displayName}</p>
	{:else}
		<p class="hint" id="{id}-name-hint">{t.settings.displayNameHint}</p>
	{/if}

	{#if avatarStyle === 'emoji'}
		<div class="block">
			<span class="head" id="{id}-emoji">{t.settings.avatarEmoji}</span>
			<div class="pad">
				<EmojiPicker
					name="avatarEmoji"
					bind:value={
						() => avatarEmoji,
						(v) => {
							avatarEmoji = v;
							void tick().then(save.now);
						}
					}
					labelledby="{id}-emoji"
					describedby="{id}-emoji-hint"
					suggestions={AVATAR_EMOJIS}
					groupLabel={t.settings.suggestedEmoji}
					pickLabel={t.settings.useAvatarEmoji}
					placeholder="🦊"
					invalid={Boolean(failure?.errors.avatarEmoji)}
				/>
			</div>
			{#if failure?.errors.avatarEmoji}
				<p class="error" role="alert" id="{id}-emoji-hint">{failure.errors.avatarEmoji}</p>
			{:else}
				<p class="hint" id="{id}-emoji-hint">{t.settings.avatarEmojiHint}</p>
			{/if}
		</div>
	{/if}

	<div class="block">
		<span class="head">{t.settings.avatarColour}</span>
		<div class="pad">
			<ColorSwatches name="avatarColor" bind:value={avatarColor} label={t.settings.avatarColour} />
		</div>
		{#if failure?.errors.avatarColor}
			<p class="error" role="alert">{failure.errors.avatarColor}</p>
		{/if}
	</div>
	<NoJsSave />
</form>

<style>
	.editor {
		display: grid;
		gap: var(--space-2);
	}
	.avatar {
		display: grid;
		place-items: center;
		padding-bottom: var(--space-3);
	}
	.block {
		display: grid;
		gap: var(--space-2);
		margin-top: var(--space-4);
	}
	.head {
		padding: 0 var(--grouped-inset);
		font-size: var(--fs-label);
		font-weight: var(--fw-semibold);
		color: var(--text-muted);
	}
	.pad {
		padding: var(--space-3) var(--grouped-inset);
		border-radius: var(--grouped-radius);
		background: var(--grouped-bg);
	}
	.hint,
	.error {
		padding: 0 var(--grouped-inset);
		font-size: var(--fs-xs);
	}
	.hint {
		color: var(--text-muted);
	}
	.error {
		color: var(--danger);
	}
</style>
