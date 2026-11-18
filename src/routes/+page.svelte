<script lang="ts">
	import ComingSoon from '#lib/components/ComingSoon.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';

	const today = new Intl.DateTimeFormat('en-US', {
		weekday: 'long',
		month: 'long',
		day: 'numeric'
	}).format(new Date());
</script>

<svelte:head><title>Home · libe</title></svelte:head>

<PageHeader title={today} />
<ComingSoon milestone="M2 · Home / Today">
	Quest work, Other, backlog and today's timeline.
</ComingSoon>
