<script lang="ts">
	let {
		values,
		color = 'var(--quest-slate)',
		width = 110,
		height = 36,
		highlight
	}: {
		/** One value per period, oldest first, current period last. */
		values: number[];
		/** CSS colour, usually `questColorVar(quest.color)`. */
		color?: string;
		width?: number;
		height?: number;
		/** Index of a period to mark (thin guide line + ring), e.g. the week shown on the review. */
		highlight?: number;
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
	const marked = $derived(highlight === undefined ? undefined : points[highlight]);
</script>

<svg class="sparkline" {width} {height} viewBox="0 0 {width} {height}" aria-hidden="true">
	{#if marked}
		<line
			class="guide"
			x1={marked.x}
			x2={marked.x}
			y1="0"
			y2={height}
			stroke-width="1"
			stroke-dasharray="2 2"
		/>
	{/if}
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
	{#if marked && marked !== last}
		<circle class="ring" cx={marked.x} cy={marked.y} r="3" stroke={color} stroke-width="1.5" />
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
	.guide {
		stroke: var(--border-strong);
	}
	.ring {
		fill: var(--surface);
	}
</style>
