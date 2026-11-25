<script lang="ts">
	import { LOGO, LOGO_TOKENS } from '#lib/logo.ts';

	let { size = 26 }: { size?: number } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 {LOGO.viewBox} {LOGO.viewBox}" aria-hidden="true">
	<path
		d={LOGO.stroke.d}
		fill="none"
		stroke="var({LOGO_TOKENS.stroke})"
		stroke-width={LOGO.stroke.width}
		stroke-linecap="round"
	/>
	<circle cx={LOGO.dot.cx} cy={LOGO.dot.cy} r={LOGO.dot.r} fill="var({LOGO_TOKENS.dot})" />
</svg>
