<script lang="ts">
	import { User } from '@lucide/svelte';
	import { questColorVar } from '#lib/quest-colors.ts';
	import { initials } from '#lib/profile.ts';
	import { useI18n } from '#lib/i18n/context.svelte.ts';

	type Props = {
		/** Display name; null/blank → a neutral person icon. */
		name: string | null | undefined;
		/** Avatar colour key (`QUEST_COLORS`); only used when there are initials. */
		color?: string | null;
		size?: 'sm' | 'md' | 'lg';
	};
	let { name, color = null, size = 'md' }: Props = $props();
	const t = useI18n();

	const letters = $derived(initials(name, t.intl));
	const ICON = { sm: 14, md: 18, lg: 28 } as const;
</script>

<!-- Decorative: the surrounding control/text names the person. -->
<span
	class="avatar {size}"
	class:named={letters !== null}
	style:--q={letters !== null ? questColorVar(color) : undefined}
	aria-hidden="true"
>
	{#if letters !== null}{letters}{:else}<User size={ICON[size]} strokeWidth={1.75} />{/if}
</span>

<style>
	.avatar {
		flex: none;
		display: grid;
		place-items: center;
		width: var(--avatar-size);
		height: var(--avatar-size);
		border-radius: 50%;
		background: var(--surface-2);
		border: 1px solid var(--border-strong);
		color: var(--text-muted);
		font-weight: var(--fw-semibold);
		line-height: 1;
		letter-spacing: 0.02em;
		white-space: nowrap;
		overflow: hidden;
		user-select: none;
		transition:
			border-color var(--dur) var(--ease),
			background var(--dur) var(--ease);
	}
	.named {
		background: color-mix(in srgb, var(--q) 22%, var(--surface-2));
		border-color: color-mix(in srgb, var(--q) 50%, transparent);
		color: color-mix(in srgb, var(--q) 70%, var(--text));
	}
	.sm {
		--avatar-size: var(--avatar-sm);
		font-size: var(--fs-tab);
	}
	.md {
		--avatar-size: var(--avatar-md);
		font-size: var(--fs-sm);
	}
	.lg {
		--avatar-size: var(--avatar-lg);
		font-size: var(--fs-lg);
	}
</style>
