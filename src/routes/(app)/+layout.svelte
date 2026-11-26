<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import { X } from '@lucide/svelte';
	import AppNav from '#lib/components/AppNav.svelte';
	import MiniPlayer from '#lib/components/MiniPlayer.svelte';
	import { useTimer } from '#lib/timer-store.svelte.ts';
	import { useI18n } from '#lib/i18n/context.svelte.ts';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();
	const t = useI18n();
	const timer = useTimer();

	// One-time welcome on the first page after pairing (`welcome` cookie, root layout load):
	// shown until dismissed or the next navigation.
	// svelte-ignore state_referenced_locally
	let welcome = $state(data.welcome);
	afterNavigate(({ type }) => {
		if (type !== 'enter') welcome = false;
	});
</script>

<AppNav />

<!-- Phones: the mini-player floats above the tab bar while a timer is active; main pads for it. -->
<main class:with-player={timer.timer !== null}>
	{#if welcome}
		<div class="welcome" role="status">
			<p>{t.welcome.paired(data.profile?.displayName ?? null)}</p>
			<button
				type="button"
				class="dismiss"
				aria-label={t.welcome.dismiss}
				onclick={() => (welcome = false)}
			>
				<X size={16} />
			</button>
		</div>
	{/if}
	{@render children()}
</main>

<MiniPlayer />

<style>
	main {
		max-width: var(--page-max);
		margin: 0 auto;
		padding: var(--space-16) calc(var(--page-gutter) + var(--safe-right))
			calc(var(--space-12) + var(--safe-bottom)) calc(var(--page-gutter) + var(--safe-left));
	}

	.welcome {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		margin: calc(-1 * var(--space-10)) 0 var(--space-6);
		padding: var(--space-3) var(--space-3) var(--space-3) var(--space-4);
		background: var(--surface);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-md);
		color: var(--text);
		font-size: var(--fs-sm);
	}
	.welcome p {
		flex: 1;
		min-width: 0;
	}
	.dismiss {
		flex: none;
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		padding: 0;
		background: transparent;
		border: none;
		border-radius: var(--radius-sm);
		color: var(--text-muted);
	}
	.dismiss:hover {
		color: var(--text);
		background: var(--surface-hover);
	}

	@media (max-width: 900px) {
		main {
			padding: var(--space-8) calc(var(--space-4) + var(--safe-right))
				calc(var(--space-8) + var(--safe-bottom)) calc(var(--space-4) + var(--safe-left));
		}
		.welcome {
			margin-top: 0;
		}
	}

	/* Phones: the content scrolls under the floating tab bar (AppNav) but can clear it. */
	@media (max-width: 720px) {
		main {
			padding-bottom: calc(var(--space-8) + var(--tabbar-h) + var(--tabbar-lift));
		}
		main.with-player {
			padding-bottom: calc(
				var(--space-8) + var(--tabbar-h) + var(--tabbar-lift) + var(--player-h) + var(--space-2)
			);
		}
	}
</style>
