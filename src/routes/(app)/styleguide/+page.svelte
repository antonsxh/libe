<script lang="ts">
	import {
		ChartColumn,
		Check,
		Filter,
		Flame,
		House,
		Pause,
		Play,
		Plus,
		Target
	} from '@lucide/svelte';
	import Avatar from '#lib/components/Avatar.svelte';
	import Button from '#lib/components/Button.svelte';
	import Dialog from '#lib/components/Dialog.svelte';
	import EmptyState from '#lib/components/EmptyState.svelte';
	import GoalRing from '#lib/components/GoalRing.svelte';
	import GroupedList from '#lib/components/GroupedList.svelte';
	import GroupedNavRow from '#lib/components/GroupedNavRow.svelte';
	import GroupedRow from '#lib/components/GroupedRow.svelte';
	import Switch from '#lib/components/Switch.svelte';
	import SegmentedControl from '#lib/components/SegmentedControl.svelte';
	import MiniPlayer from '#lib/components/MiniPlayer.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import QuestPill from '#lib/components/QuestPill.svelte';
	import { QUEST_COLORS, questColorVar } from '#lib/quest-colors.ts';

	// The palette by role, as components use it (see tokens.css).
	const surfaces = [
		'--bg',
		'--bg-nav',
		'--surface',
		'--surface-2',
		'--surface-hover',
		'--track',
		'--bar-muted'
	];
	const lines = ['--border', '--border-dashed', '--border-strong'];
	const texts = ['--text', '--text-2', '--text-muted', '--text-faint'];
	const accents = [
		'--accent',
		'--accent-hover',
		'--accent-text',
		'--accent-soft',
		'--today-tint',
		'--running-border'
	];
	const states = ['--control-on', '--selected-bg', '--selected-border', '--focus-ring'];
	const semantic = ['--danger', '--success', '--overdue', '--streak', '--backdrop'];
	let sheetOpen = $state(false);
	let sampleChoice = $state('60');
	let sampleSegment = $state('25');
	let sampleSwitch = $state(true);
	let sampleDays = $state(['5', '6']);
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
	<h2 class="label">Surfaces</h2>
	{@render swatches(surfaces)}
</section>

<section>
	<h2 class="label">Text & lines</h2>
	<div class="row">
		{#each texts as token (token)}
			<span style:color="var({token})">{token}</span>
		{/each}
	</div>
	{@render swatches(lines)}
</section>

<section>
	<h2 class="label">Accent, states & semantic</h2>
	{@render swatches(accents)}
	<p class="muted caption">
		<code>--accent</code> is for fills, lines, rings and dots; as a text or icon colour use
		<code>--accent-text</code> (the accent is too dark for text on black). Components use the role
		names, never the accent mixed by hand: checked controls
		<code>--control-on</code>, selections <code>--selected-bg</code> /
		<code>--selected-border</code> / <code>--selected-text</code>, focus <code>--focus-ring</code>
		(via <code>--ring</code>), modal backdrops <code>--backdrop</code>.
	</p>
	{@render swatches(states)}
	{@render swatches(semantic)}
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
	<h2 class="label">Grouped list & segmented control (Apple-style)</h2>
	<div class="grouped-demo">
		<GroupedList
			header="Choice"
			footer="Native radios: arrow keys, screen readers, submits without JS."
			name="sg-choice"
			options={[
				{ value: '30', label: '30 min' },
				{ value: '60', label: '1 h' },
				{ value: 'off', label: 'No daily goal' }
			]}
			bind:value={sampleChoice}
		/>
		<GroupedList header="Rows">
			<GroupedRow>
				<input type="text" aria-label="Sample field" placeholder="Text field filling the row" />
			</GroupedRow>
			<GroupedRow label="Label" for="sg-value">
				<input id="sg-value" type="text" value="Value on the right" />
			</GroupedRow>
			<GroupedRow label="Duration" labelId="sg-duration">
				<SegmentedControl
					name="sg-segment"
					labelledby="sg-duration"
					options={[
						{ value: '25', label: '25 min' },
						{ value: '45', label: '45 min' },
						{ value: '60', label: '1 h' }
					]}
					bind:value={sampleSegment}
				/>
			</GroupedRow>
		</GroupedList>
		<GroupedList
			header="Settings rows (iOS symbol tiles, --tile-*)"
			footer="Switches save on change."
		>
			<GroupedNavRow label="Daily goal" value="2 h" tile="var(--tile-goal)" onclick={() => {}}>
				{#snippet icon()}<Target size={16} strokeWidth={2} />{/snippet}
			</GroupedNavRow>
			<GroupedNavRow
				label="Rest days"
				value="Sat, Sun"
				tile="var(--tile-streak)"
				onclick={() => {}}
			>
				{#snippet icon()}<Flame size={16} strokeWidth={2} />{/snippet}
			</GroupedNavRow>
			<GroupedRow label="Switch" for="sg-switch">
				<Switch id="sg-switch" bind:checked={sampleSwitch} />
			</GroupedRow>
		</GroupedList>
		<GroupedList
			header="Checklist"
			name="sg-days"
			multiple
			options={[
				{ value: '5', label: 'Saturday' },
				{ value: '6', label: 'Sunday' }
			]}
			bind:values={sampleDays}
		/>
	</div>
</section>

<section>
	<h2 class="label">Empty state</h2>
	<p class="muted">
		One symbol, one sentence, one action — instead of a page full of zeros (Review, Quests,
		Calendar, Plan). The action is a link or a button; leave it out when nothing fits.
	</p>
	<div class="card empty-demo">
		<EmptyState
			icon={ChartColumn}
			title="Nothing logged yet"
			text="Once you finish a focus, your week shows up here."
			action="Start focus"
			actionIcon={Play}
			href="/focus"
		/>
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
	<p class="muted caption">
		Daily-goal ring (<code>GoalRing</code>, at Home in the nav): 0 %, 35 %, 80 %, reached — small
		(desktop, before the word) and around the tab bar's icon (phones)
	</p>
	<div class="row">
		<GoalRing progress={{ fraction: 0, done: false }} />
		<GoalRing progress={{ fraction: 0.35, done: false }} />
		<GoalRing progress={{ fraction: 0.8, done: false }} />
		<GoalRing progress={{ fraction: 1, done: true }} />
		<GoalRing progress={{ fraction: 0.6, done: false }} size="tab"><House size={22} /></GoalRing>
		<GoalRing progress={{ fraction: 1, done: true }} size="tab"><House size={22} /></GoalRing>
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
		<h1>Thursday, October 15</h1>
		<p class="stat tabular">17.4h <span class="muted">/ 20h</span></p>
		<p class="timer tabular">1:17:56</p>
		<p style:font-size="var(--fs-lg)">Design the next chapter</p>
		<p>Body text — The few things that actually matter.</p>
		<p class="muted" style:font-size="var(--fs-sm)">Secondary meta text</p>
		<p class="label">Section label (sentence case)</p>
	</div>
</section>

<style>
	.empty-demo {
		max-width: 560px;
	}
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
	.grouped-demo {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(340px, 100%), 1fr));
		gap: var(--space-6);
		max-width: 760px;
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
		font-size: var(--fs-stat);
		font-weight: var(--fw-figure);
		color: var(--text);
		line-height: 1;
	}
	.stat span {
		font-size: var(--fs-lg);
	}
	.timer {
		font-size: var(--fs-2xl);
		font-weight: var(--fw-figure);
		letter-spacing: -0.03em;
		line-height: 1;
	}
</style>
