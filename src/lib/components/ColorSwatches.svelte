<script lang="ts">
	import { QUEST_COLORS, questColorVar, type QuestColor } from '#lib/quest-colors.ts';
	import { useI18n } from '#lib/i18n/context.svelte.ts';

	/**
	 * Radio group of the quest colour family (quest form, profile avatar colour). Native
	 * radios (form field `name`), so it submits without JS; `value` is bindable.
	 */
	type Props = {
		/** Form field name. */
		name: string;
		value: QuestColor | string;
		/** Accessible name of the group. */
		label: string;
	};
	let { name, value = $bindable(), label }: Props = $props();
	const t = useI18n();
</script>

<div class="swatches" role="radiogroup" aria-label={label}>
	{#each QUEST_COLORS as c (c)}
		<label class="swatch" style:--q={questColorVar(c)} title={t.colors[c]}>
			<input type="radio" {name} value={c} bind:group={value} aria-label={t.colors[c]} />
			<span class="dot" aria-hidden="true"></span>
		</label>
	{/each}
</div>

<style>
	.swatches {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	.swatch {
		position: relative;
		display: inline-flex;
	}
	.swatch input {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		margin: 0;
		opacity: 0;
		cursor: pointer;
	}
	.swatch .dot {
		width: 26px;
		height: 26px;
		border-radius: 50%;
		background: var(--q);
		transition: box-shadow var(--dur) var(--ease);
	}
	.swatch:hover .dot {
		box-shadow:
			0 0 0 2px var(--surface),
			0 0 0 3px var(--q);
	}
	.swatch input:checked + .dot {
		box-shadow:
			0 0 0 2px var(--surface),
			0 0 0 4px var(--q);
	}
	.swatch input:focus-visible + .dot {
		box-shadow:
			0 0 0 2px var(--surface),
			0 0 0 4px var(--q),
			0 0 0 7px color-mix(in srgb, var(--accent) 55%, transparent);
	}
</style>
