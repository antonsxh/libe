<script lang="ts">
	let { size = 26 }: { size?: number } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
	<path
		d="M11 7v14.5a3.5 3.5 0 0 0 3.5 3.5H22"
		fill="none"
		stroke="var(--accent)"
		stroke-width="3.2"
		stroke-linecap="round"
	/>
	<circle cx="21.5" cy="10.5" r="2.6" fill="var(--text)" />
</svg>
