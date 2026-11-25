<script lang="ts">
	import { ChartColumn, Flag, Timer } from '@lucide/svelte';
	import Logo from '#lib/components/Logo.svelte';
	import WelcomeScreen from './WelcomeScreen.svelte';
	import { welcomeHref } from '#lib/onboarding.ts';
	import { useI18n } from '#lib/i18n/context.svelte.ts';

	/** Step 0: what libe is — three feature rows, "Get started", "Skip setup". */
	type Props = { busy: boolean };
	let { busy }: Props = $props();
	const t = useI18n();
	const intro = $derived(t.onboarding.intro);
	const features = $derived([
		{ icon: Flag, title: intro.questsTitle, text: intro.questsText },
		{ icon: Timer, title: intro.focusTitle, text: intro.focusText },
		{ icon: ChartColumn, title: intro.reviewTitle, text: intro.reviewText }
	]);
</script>

<WelcomeScreen step={0} title={intro.title}>
	{#snippet symbol()}<Logo size={64} />{/snippet}
	<ul class="features">
		{#each features as f (f.title)}
			<li>
				<f.icon size={28} strokeWidth={1.75} aria-hidden="true" />
				<div>
					<p class="name">{f.title}</p>
					<p class="text">{f.text}</p>
				</div>
			</li>
		{/each}
	</ul>
	{#snippet actions()}
		<a class="cta" href={welcomeHref(1)}>{intro.start}</a>
		<button class="plain" type="submit" name="then" value="home" disabled={busy}>
			{t.onboarding.skipSetup}
		</button>
	{/snippet}
</WelcomeScreen>

<style>
	.features {
		display: grid;
		gap: var(--space-5);
		margin: 0;
		padding: 0 var(--space-2);
		list-style: none;
	}
	li {
		display: grid;
		grid-template-columns: var(--space-10) 1fr;
		gap: var(--space-3);
		align-items: start;
	}
	li :global(svg) {
		margin-top: 2px;
		color: var(--accent);
	}
	.name {
		font-weight: var(--fw-semibold);
	}
	.text {
		color: var(--text-muted);
		font-size: var(--fs-sm);
	}
</style>
