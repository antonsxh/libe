<script lang="ts">
	import { Check, Filter, Pause, Play, Plus } from '@lucide/svelte';
	import Avatar from '#lib/components/Avatar.svelte';
	import Button from '#lib/components/Button.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import QuestPill from '#lib/components/QuestPill.svelte';
	import { QUEST_COLORS, questColorVar } from '#lib/quest-colors.ts';

	const surfaces = [
		'--bg',
		'--bg-nav',
		'--surface',
		'--surface-2',
		'--surface-hover',
		'--track',
		'--bar-muted',
		'--border',
		'--border-strong'
	];
	const texts = ['--text', '--text-2', '--text-muted', '--text-faint', '--accent'];
</script>

<svelte:head><title>Styleguide · libe</title></svelte:head>

<PageHeader title="Styleguide" subtitle="Design tokens and shared primitives. Internal page.">
	{#snippet actions()}
		<Button variant="primary"><Plus size={18} /> New quest</Button>
	{/snippet}
</PageHeader>

<section>
	<h2 class="label">Surfaces & lines</h2>
	<div class="swatches">
		{#each surfaces as token (token)}
			<div class="swatch">
				<div class="chip" style:background="var({token})"></div>
				<code>{token}</code>
			</div>
		{/each}
	</div>
</section>

<section>
	<h2 class="label">Text</h2>
	<div class="row">
		{#each texts as token (token)}
			<span style:color="var({token})">{token}</span>
		{/each}
	</div>
</section>

<section>
	<h2 class="label">Quest colours</h2>
	<div class="row">
		{#each QUEST_COLORS as color (color)}
			<QuestPill {color} label={color} />
		{/each}
	</div>
	<div class="row">
		<QuestPill color="red" label="Launch my idea" outlined />
		<QuestPill color="green" label="Keep learning" icon="📚" />
	</div>
</section>

<section>
	<h2 class="label">Hatching</h2>
	<div class="blocks">
		{#each QUEST_COLORS as color (color)}
			<div class="hatch block" style:--q={questColorVar(color)}>
				<strong>{color}</strong>
				<span class="tabular">09:00 – 10:30</span>
			</div>
		{/each}
	</div>
</section>

<section>
	<h2 class="label">Buttons</h2>
	<div class="row">
		<Button variant="primary"><Plus size={18} /> New quest</Button>
		<Button><Pause size={16} /> Pause</Button>
		<Button><Check size={16} /> Complete</Button>
		<Button variant="ghost"><Play size={16} /> Start</Button>
		<Button icon aria-label="Filter"><Filter size={16} /></Button>
		<Button size="sm">Today</Button>
		<Button disabled>Disabled</Button>
	</div>
</section>

<section>
	<h2 class="label">Avatar</h2>
	<div class="row">
		<Avatar name={null} size="sm" />
		<Avatar name={null} />
		<Avatar name={null} size="lg" />
		<Avatar name="Anton Schmidt" color="amber" size="sm" />
		<Avatar name="Anton Schmidt" color="amber" />
		<Avatar name="Anton Schmidt" color="amber" size="lg" />
		<Avatar name="ölaf" color="teal" />
		<Avatar name="🦊 Fox" color="purple" />
		<Avatar name="Mia Lee" color="pink" />
		<Avatar name="Sam" color="slate" />
		<Avatar name="Anton" color="teal" emoji="🦊" size="sm" />
		<Avatar name="Anton" color="teal" emoji="🦊" />
		<Avatar name={null} color="blue" emoji="🐙" size="lg" />
	</div>
	<p class="muted caption">Daily-goal ring: 0 %, 35 %, 80 %, reached</p>
	<div class="row">
		<Avatar name="Anton Schmidt" color="amber" ring={{ fraction: 0, done: false }} />
		<Avatar name="Anton Schmidt" color="amber" ring={{ fraction: 0.35, done: false }} />
		<Avatar name="Anton" color="teal" emoji="🦊" ring={{ fraction: 0.8, done: false }} />
		<Avatar name="Anton" color="teal" emoji="🦊" ring={{ fraction: 1, done: true }} />
		<Avatar name="Anton" color="teal" size="lg" ring={{ fraction: 0.6, done: false }} />
	</div>
</section>

<section>
	<h2 class="label">Typography</h2>
	<div class="type">
		<h1>Thursday, October 15</h1>
		<p class="stat tabular">17.4h <span class="muted">/ 20h</span></p>
		<p style:font-size="var(--fs-lg)">Design the next chapter</p>
		<p>Body text — The few things that actually matter.</p>
		<p class="muted" style:font-size="var(--fs-sm)">Secondary meta text</p>
		<p class="label">Quest work</p>
	</div>
</section>

<style>
	section {
		display: grid;
		gap: var(--space-4);
		margin-bottom: var(--space-12);
	}
	.swatches {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
		gap: var(--space-4);
	}
	.swatch {
		display: grid;
		gap: var(--space-2);
	}
	.chip {
		height: 56px;
		border-radius: var(--radius-md);
		border: 1px solid var(--border-strong);
	}
	code {
		font-family: var(--font-mono);
		font-size: var(--fs-xs);
		color: var(--text-muted);
	}
	.caption {
		margin: var(--space-4) 0 var(--space-2);
		font-size: var(--fs-sm);
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-3);
	}
	.blocks {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
		gap: var(--space-3);
	}
	.block {
		display: grid;
		gap: 2px;
		padding: var(--space-2) var(--space-3);
		min-height: 64px;
		font-size: var(--fs-sm);
	}
	.block span {
		color: var(--text-muted);
		font-size: var(--fs-xs);
	}
	.type {
		display: grid;
		gap: var(--space-4);
	}
	.stat {
		font-size: var(--fs-stat);
		color: var(--accent);
		line-height: 1;
	}
	.stat span {
		font-size: var(--fs-lg);
	}
</style>
