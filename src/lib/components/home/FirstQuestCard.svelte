<script lang="ts">
	import { Plus } from '@lucide/svelte';
	import Button from '#lib/components/Button.svelte';
	import { useI18n } from '#lib/i18n/context.svelte.ts';

	type Props = {
		/** Opens the new-quest dialog. */
		oncreate: () => void;
	};
	let { oncreate }: Props = $props();
	const t = useI18n();
</script>

<!--
	Home's quest work without any open quest: instead of an add row that could only fail
	("Pick a quest."), one sentence and one (secondary) action. Next up stays the primary.
-->
<div class="first-quest" data-testid="first-quest">
	<p class="muted">{t.home.firstQuest.text}</p>
	<Button onclick={oncreate}>
		<Plus size={16} />
		{t.home.firstQuest.action}
	</Button>
</div>

<style>
	.first-quest {
		display: grid;
		justify-items: start;
		gap: var(--space-3);
		padding: var(--space-4);
		border: 1px dashed var(--border-dashed);
		border-radius: var(--radius-md);
		margin-bottom: var(--space-3);
	}
	.first-quest p {
		font-size: var(--fs-sm);
		max-width: 60ch;
	}
</style>
