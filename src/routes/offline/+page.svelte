<script lang="ts">
	import { page } from '$app/state';
	import AuthShell from '#lib/components/auth/AuthShell.svelte';
	import { LOCALES, i18n, isLocale, type Locale } from '#lib/i18n/index.ts';

	/**
	 * The service worker caches this page once and serves it whenever the network is gone, so
	 * the server's language guess may be stale: every language is rendered and a tiny inline
	 * script shows the one matching `navigator.languages` (same rule as `localeFromLanguages`).
	 * Without JavaScript the server's choice stays visible.
	 */
	const initial: Locale = isLocale(page.data.locale) ? page.data.locale : 'en';
	const supported = JSON.stringify(LOCALES);
	const pick = `(function () {
	var supported = ${supported};
	var langs = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || ''];
	var pick = 'en';
	for (var i = 0; i < langs.length; i++) {
		var primary = String(langs[i]).toLowerCase().split('-')[0];
		if (supported.indexOf(primary) >= 0) { pick = primary; break; }
	}
	document.documentElement.lang = pick;
	var blocks = document.querySelectorAll('[data-locale]');
	for (var j = 0; j < blocks.length; j++) {
		var on = blocks[j].getAttribute('data-locale') === pick;
		blocks[j].hidden = !on;
		if (on) document.title = blocks[j].getAttribute('data-title');
	}
})();`;
</script>

<svelte:head><title>{i18n(initial).offline.pageTitle}</title></svelte:head>

{#each LOCALES as locale (locale)}
	{@const t = i18n(locale)}
	<div
		data-locale={locale}
		data-title={t.offline.pageTitle}
		lang={locale}
		hidden={locale !== initial}
	>
		<AuthShell title={t.offline.title} subtitle={t.offline.subtitle}>
			<p class="retry"><a href="/">{t.offline.retry}</a></p>
		</AuthShell>
	</div>
{/each}

<!-- Static script built above from constants only. -->
{@html `<script>${pick}</script>`}

<style>
	.retry {
		margin-top: var(--space-6);
	}
	.retry a {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 48px;
		border-radius: var(--radius-md);
		background: var(--accent);
		color: var(--accent-ink);
		font-weight: var(--fw-medium);
	}
	.retry a:hover {
		background: var(--accent-hover);
	}
</style>
