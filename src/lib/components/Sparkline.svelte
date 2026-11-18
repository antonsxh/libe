<script lang="ts">
	let {
		values,
		color = 'var(--quest-slate)',
		width = 110,
		height = 36
	}: {
		/** One value per period, oldest first, current period last. */
		values: number[];
		/** CSS colour, usually `questColorVar(quest.color)`. */
		color?: string;
		width?: number;
		height?: number;
	} = $props();

	const pad = 4;

	const points = $derived.by(() => {
		const n = values.length;
		if (n === 0) return [];
		const max = Math.max(...values, 0.0001);
		const innerW = width - pad * 2;
		const innerH = height - pad * 2;
		return values.map((v, i) => ({
			x: n === 1 ? width / 2 : pad + (innerW * i) / (n - 1),
			y: pad + innerH - (Math.max(0, v) / max) * innerH
		}));
	});

	const polyline = $derived(points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '));
	const last = $derived(points.at(-1));
</script>

<svg class="sparkline" {width} {height} viewBox="0 0 {width} {height}" aria-hidden="true">
	{#if points.length > 1}
		<polyline
			points={polyline}
			fill="none"
			stroke={color}
			stroke-width="1.75"
			stroke-linecap="round"
			stroke-linejoin="round"
		/>
	{/if}
	{#if last}
		<circle cx={last.x} cy={last.y} r="2.5" fill={color} />
	{/if}
</svg>

<style>
	.sparkline {
		display: block;
		overflow: visible;
	}
</style>
