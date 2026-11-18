<script lang="ts">
	import { onMount } from 'svelte';
	import AuthShell from '#lib/components/auth/AuthShell.svelte';
	import { safeNext } from '#lib/auth.ts';

	/**
	 * Session bootstrap for the Tauri shell: the shell opens
	 * `/pair/session#token=<device token>&next=/` in its webview. The fragment never reaches
	 * the server or logs; this page exchanges the token for the httpOnly cookie with a
	 * same-origin request and replaces itself (so the token doesn't stay in history).
	 */
	let error = $state<string | null>(null);

	onMount(async () => {
		const params = new URLSearchParams(location.hash.slice(1));
		const token = params.get('token');
		const next = safeNext(params.get('next'));
		history.replaceState(null, '', location.pathname);
		if (!token) {
			error = 'No device token was provided.';
			return;
		}
		try {
			const res = await fetch('/api/pair/session', {
				method: 'POST',
				// JSON (not a bodyless POST, which Kit's CSRF check treats as a form submission).
				headers: {
					authorization: `Bearer ${token}`,
					accept: 'application/json',
					'content-type': 'application/json'
				},
				body: '{}'
			});
			if (res.ok) {
				location.replace(next);
				return;
			}
			error =
				res.status === 401
					? 'This device was signed out. Pair it again.'
					: `Could not start the session (${res.status}).`;
		} catch {
			error = 'Could not reach the server.';
		}
	});
</script>

<svelte:head><title>Signing in · libe</title></svelte:head>

<AuthShell title={error ? 'Could not sign in' : 'Signing in…'}>
	{#if error}
		<p class="notice" role="alert">{error} <a href="/pair">Pair this device</a></p>
	{/if}
</AuthShell>
