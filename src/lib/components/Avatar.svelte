<script lang="ts">
	import { User } from '@lucide/svelte';
	import { questColorVar } from '#lib/quest-colors.ts';
	import { initials } from '#lib/profile.ts';
	import { useI18n } from '#lib/i18n/context.svelte.ts';

	type Props = {
		/** Display name; null/blank (and no emoji) → a neutral person icon. */
		name: string | null | undefined;
		/** Avatar colour key (`QUEST_COLORS`); tints the circle behind initials or the emoji. */
		color?: string | null;
		/** A single emoji shown instead of the initials. */
		emoji?: string | null;
		size?: 'sm' | 'md' | 'lg';
		/**
		 * Daily-goal ring around the circle: `fraction` 0‥1 of the goal, `done` = reached.
		 * Omitted/null → no ring. Decorative like the avatar — the control names the progress.
		 */
		ring?: { fraction: number; done: boolean } | null;
	};
	let { name, color = null, emoji = null, size = 'md', ring = null }: Props = $props();
	const t = useI18n();

	const letters = $derived(emoji ? null : initials(name, t.intl));
	const tinted = $derived(Boolean(emoji) || letters !== null);
	const ICON = { sm: 14, md: 18, lg: 28 } as const;
	/** Filled share in percent of the ring (`pathLength` 100 makes the dash a percentage). */
	const pct = $derived(ring ? Math.round(Math.min(1, Math.max(0, ring.fraction)) * 1000) / 10 : 0);
</script>

<!-- Decorative: the surrounding control/text names the person (and the goal progress). -->
<span class="wrap {size}" class:ringed={ring !== null} aria-hidden="true">
	{#if ring}
		<svg class="ring" class:done={ring.done} data-progress={pct}>
			<circle class="track" cx="50%" cy="50%" r="45%" pathLength="100" />
			{#if pct > 0}
				<circle
					class="fill"
					cx="50%"
					cy="50%"
					r="45%"
					pathLength="100"
					stroke-dasharray={`${pct} 100`}
				/>
			{/if}
		</svg>
	{/if}
	<span
		class="avatar"
		class:named={tinted}
		class:emoji={Boolean(emoji)}
		style:--q={tinted ? questColorVar(color) : undefined}
	>
		{#if emoji}{emoji}{:else if letters !== null}{letters}{:else}<User
				size={ICON[size]}
				strokeWidth={1.75}
			/>{/if}
	</span>
</span>

<style>
	.wrap {
		position: relative;
		flex: none;
		display: inline-grid;
		place-items: center;
	}
	/* The ring sits outside the circle: the wrapper grows by gap + stroke on each side. */
	.ringed {
		padding: calc(var(--avatar-ring-gap) + var(--avatar-ring-stroke));
	}
	.ring {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		transform: rotate(-90deg);
		overflow: visible;
		fill: none;
	}
	/* Centred on the padding band, in CSS px at every avatar size. */
	.ring circle {
		r: calc(50% - var(--avatar-ring-stroke) / 2);
		stroke-width: var(--avatar-ring-stroke);
	}
	.track {
		stroke: var(--goal-track);
	}
	.fill {
		stroke: var(--goal-ring);
		stroke-linecap: round;
		transition: stroke-dasharray var(--dur-slow) var(--ease);
	}
	.done .fill {
		stroke: var(--goal-done);
		filter: drop-shadow(var(--goal-done-glow));
	}

	.avatar {
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
	.emoji {
		letter-spacing: 0;
		font-weight: var(--fw-regular);
	}
	.sm {
		--avatar-size: var(--avatar-sm);
		font-size: var(--fs-tab);
	}
	.sm .emoji {
		font-size: var(--fs-sm);
	}
	.md {
		--avatar-size: var(--avatar-md);
		font-size: var(--fs-sm);
	}
	.md .emoji {
		font-size: var(--fs-lg);
	}
	.lg {
		--avatar-size: var(--avatar-lg);
		font-size: var(--fs-lg);
	}
	.lg .emoji {
		font-size: var(--fs-avatar-emoji-lg);
	}
</style>
