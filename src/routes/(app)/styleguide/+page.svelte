<script lang="ts">
	import { Check, Filter, Pause, Play, Plus } from '@lucide/svelte';
	import Avatar from '#lib/components/Avatar.svelte';
	import Button from '#lib/components/Button.svelte';
	import Dialog from '#lib/components/Dialog.svelte';
	import MiniPlayer from '#lib/components/MiniPlayer.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import QuestPill from '#lib/components/QuestPill.svelte';
	import { QUEST_COLORS, questColorVar } from '#lib/quest-colors.ts';

	// "Hain" palette, 60-30-10: surfaces, then text and lines, then the one accent.
	const surfaces = [
		'--bg',
		'--bg-nav',
		'--surface',
		'--surface-2',
		'--surface-hover',
		'--surface-sunken',
		'--track',
		'--bar-muted'
	];
	const lines = ['--border-soft', '--border', '--border-dashed', '--border-strong'];
	const texts = ['--text', '--text-2', '--text-muted', '--text-faint'];
	const accents = ['--accent', '--accent-hover', '--accent-soft', '--today-tint', '--danger'];
	const radii = ['--radius-xs', '--radius-sm', '--radius-md', '--radius-lg', '--radius-xl'];
	const easings = ['--ease-out', '--ease-in', '--ease-spring'];
	let sheetOpen = $state(false);
	let moved = $state(false);
</script>

<svelte:head><title>Styleguide · libe</title></svelte:head>

<PageHeader title="Styleguide" subtitle="Design tokens and shared primitives. Internal page.">
	{#snippet actions()}
		<Button variant="primary"><Plus size={18} /> New quest</Button>
	{/snippet}
</PageHeader>

{#snippet swatches(tokens: string[])}
	<div class="swatches">
		{#each tokens as token (token)}
			<div class="swatch">
				<div class="chip" style:background="var({token})"></div>
				<code>{token}</code>
			</div>
		{/each}
	</div>
{/snippet}

<section>
	<h2 class="label">Surfaces (60 %)</h2>
	{@render swatches(surfaces)}
</section>

<section>
	<h2 class="label">Text & lines (30 %)</h2>
	<div class="row">
		{#each texts as token (token)}
			<span style:color="var({token})">{token}</span>
		{/each}
	</div>
	{@render swatches(lines)}
</section>

<section>
	<h2 class="label">Accent (10 %) & semantic</h2>
	{@render swatches(accents)}
	<p class="muted caption">
		Mint is only for the primary action, the "now" (running timer, now line, today marker), the
		focus ring and the daily-goal ring. KPI numbers, the wordmark and selections stay neutral (<code>
			--text
		</code>, <code>--control-on</code>, <code>--selected-bg</code>). Success uses the accent;
		<code>--danger</code> is for errors and the overdue marker.
	</p>
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
	<h2 class="label">Dot grid (planned blocks, calendar entries)</h2>
	<div class="blocks">
		{#each QUEST_COLORS as color (color)}
			<div class="dot-grid block" style:--q={questColorVar(color)}>
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
	<h2 class="label">Dialog / bottom sheet</h2>
	<p class="muted caption">
		Centred modal on wider screens; on phones (≤ 720px) a bottom sheet: slides up, drag the header
		down to dismiss, the <code>.dialog-actions</code> row sticks to the bottom with a full-width
		primary button. Motion uses <code>--dur-sheet</code> / <code>--ease-out</code>
		and stops under reduced motion.
	</p>
	<div class="row">
		<Button onclick={() => (sheetOpen = true)}>Open a dialog</Button>
	</div>
	<Dialog bind:open={sheetOpen} title="Example sheet">
		<p class="muted">Content scrolls inside the sheet, never the page behind it.</p>
		<div class="row actions dialog-actions">
			<Button variant="ghost" onclick={() => (sheetOpen = false)}>Cancel</Button>
			<Button variant="primary" onclick={() => (sheetOpen = false)}>Save</Button>
		</div>
	</Dialog>
</section>

<section>
	<h2 class="label">Mini-player (phones, above the tab bar)</h2>
	<div class="players">
		<MiniPlayer
			demo={{
				title: 'Design the next chapter',
				color: 'red',
				display: '18:42',
				paused: false,
				progress: 0.25
			}}
		/>
		<MiniPlayer
			demo={{
				title: 'Long run at an easy pace',
				color: 'lime',
				display: '41:05',
				paused: true,
				progress: 0.45
			}}
		/>
	</div>
</section>

<section>
	<h2 class="label">Typography</h2>
	<div class="type">
		<p class="muted caption">
			Display: Bricolage Grotesque (<code>--font-display</code>) — page titles, big numbers, the
			timer. UI and body: Figtree (<code>--font-sans</code>). Times use tabular figures.
		</p>
		<h1>Thursday, October 15</h1>
		<p class="stat tabular">17.4h <span class="muted">/ 20h</span></p>
		<p class="timer tabular">24:59</p>
		<p style:font-size="var(--fs-lg)">Design the next chapter</p>
		<p>Body text — The few things that actually matter.</p>
		<p class="muted" style:font-size="var(--fs-sm)">Secondary meta text</p>
		<p class="label">Quest work</p>
	</div>
</section>

<section>
	<h2 class="label">Radii (8 / 12 / 18 / 24 + pill)</h2>
	<div class="row">
		{#each radii as token (token)}
			<div class="swatch">
				<div class="radius" style:border-radius="var({token})"></div>
				<code>{token}</code>
			</div>
		{/each}
	</div>
	<p class="muted caption">
		Nested radius: a box inside a box uses outer − padding (<code>--radius-inner</code> =
		<code>--radius-lg</code> − <code>--space-2</code>).
	</p>
	<div class="nest">
		<div class="nest-inner">--radius-inner</div>
		<Button size="sm">Inside</Button>
	</div>
</section>

<section>
	<h2 class="label">Motion</h2>
	<p class="muted caption">
		Ease-out by default (<code>--ease</code> = <code>--ease-out</code>), short durations, buttons
		press to 0.97 (touch and mouse). Everything stops under reduced motion.
	</p>
	<div class="row">
		<Button onclick={() => (moved = !moved)}>Play</Button>
	</div>
	<div class="tracks">
		{#each easings as token (token)}
			<div class="motion-track">
				<span class="mover" class:moved style:transition-timing-function="var({token})"></span>
				<code>{token}</code>
			</div>
		{/each}
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
	.players {
		display: grid;
		gap: var(--space-3);
		max-width: 420px;
	}
	.actions {
		justify-content: flex-end;
		margin-top: var(--space-5);
	}
	.type {
		display: grid;
		gap: var(--space-4);
	}
	.stat {
		font-family: var(--font-display);
		font-size: var(--fs-stat);
		font-weight: var(--fw-medium);
		letter-spacing: var(--tracking-display);
		line-height: 1;
	}
	.stat span {
		font-family: var(--font-sans);
		font-size: var(--fs-lg);
		letter-spacing: normal;
	}
	.timer {
		font-family: var(--font-display);
		font-size: var(--fs-2xl);
		font-weight: var(--fw-medium);
		letter-spacing: var(--tracking-display);
		line-height: 1;
	}
	.radius {
		width: 96px;
		height: 64px;
		background: var(--surface-2);
		border: 1px solid var(--border-strong);
	}
	.nest {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		max-width: 420px;
		padding: var(--space-2);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
	}
	.nest-inner {
		flex: 1;
		padding: var(--space-3);
		background: var(--surface-2);
		border-radius: var(--radius-inner);
		color: var(--text-muted);
		font-size: var(--fs-sm);
	}
	.nest > :global(.btn) {
		border-radius: var(--radius-inner);
	}
	.tracks {
		display: grid;
		gap: var(--space-2);
		max-width: 420px;
	}
	.motion-track {
		display: grid;
		grid-template-columns: 1fr auto;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-1);
		background: var(--surface-sunken);
		border-radius: var(--radius-sm);
		overflow: hidden;
	}
	.mover {
		width: 24px;
		height: 24px;
		border-radius: calc(var(--radius-sm) - var(--space-1));
		background: var(--text-2);
		transition: translate var(--dur-sheet);
	}
	.mover.moved {
		translate: 200px 0;
	}
</style>
