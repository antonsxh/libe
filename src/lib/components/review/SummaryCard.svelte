<script lang="ts">
	/**
	 * Review on phones: the period's key figures side by side in one card (Apple Health style)
	 * — the number large, what it is in small muted text below.
	 */
	type Figure = {
		value: string;
		label: string;
		/** A second label line (e.g. "of 19h"). */
		sub?: string;
		testid: string;
	};
	type Props = { figures: Figure[]; label: string; testid?: string };
	let { figures, label, testid }: Props = $props();
</script>

<section class="card summary" aria-label={label} data-testid={testid}>
	<dl class="figures" style:--n={figures.length}>
		{#each figures as f (f.testid)}
			<div class="figure">
				<dt class="what">
					{f.label}{#if f.sub}<span class="sub tabular">{f.sub}</span>{/if}
				</dt>
				<dd class="value tabular" data-testid={f.testid}>{f.value}</dd>
			</div>
		{/each}
	</dl>
</section>

<style>
	.summary {
		padding: var(--space-4) 0;
		border-radius: var(--radius-lg);
	}
	.figures {
		display: grid;
		grid-template-columns: repeat(var(--n), minmax(0, 1fr));
		margin: 0;
	}
	/* Number above its label; a hairline between the figures. */
	.figure {
		display: flex;
		flex-direction: column-reverse;
		justify-content: flex-end;
		gap: var(--space-1);
		min-width: 0;
		padding: 0 var(--space-4);
	}
	.figure + .figure {
		border-left: 1px solid var(--border);
	}
	.value {
		margin: 0;
		font-size: var(--fs-xl);
		font-weight: var(--fw-figure);
		letter-spacing: -0.02em;
		line-height: 1.1;
		white-space: nowrap;
	}
	.what {
		display: grid;
		font-size: var(--fs-xs);
		line-height: 1.35;
		color: var(--text-muted);
		text-wrap: balance; /* "vs last / Mon–Thu", not "vs last Mon– / Thu" */
	}
	.sub {
		color: var(--text-faint);
	}
</style>
