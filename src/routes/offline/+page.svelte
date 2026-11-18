<script lang="ts">
	import AuthShell from '#lib/components/auth/AuthShell.svelte';
</script>

<svelte:head><title>Offline · libe</title></svelte:head>

<AuthShell
	title="You’re offline"
	subtitle="libe needs a connection to your server. Your plans and timers live there, so nothing is lost — reconnect and carry on."
>
	<p class="retry"><a href="/">Try again</a></p>
</AuthShell>

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
