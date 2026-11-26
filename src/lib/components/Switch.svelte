<script lang="ts">
	/**
	 * iOS switch: a native checkbox with `role="switch"` (form field `name`, submits without JS,
	 * Space toggles it, screen readers announce on/off). `checked` is bindable. Name it with
	 * `label` or `labelledby`.
	 */
	type Props = {
		name?: string;
		checked?: boolean;
		disabled?: boolean;
		label?: string;
		labelledby?: string;
		describedby?: string;
		id?: string;
		testid?: string;
		onchange?: (checked: boolean) => void;
	};
	let {
		name,
		checked = $bindable(false),
		disabled = false,
		label,
		labelledby,
		describedby,
		id,
		testid,
		onchange
	}: Props = $props();
</script>

<input
	{id}
	type="checkbox"
	role="switch"
	class="switch"
	{name}
	bind:checked
	{disabled}
	aria-label={labelledby ? undefined : label}
	aria-labelledby={labelledby}
	aria-describedby={describedby}
	data-testid={testid}
	onchange={(e) => onchange?.(e.currentTarget.checked)}
/>

<style>
	.switch {
		appearance: none;
		position: relative;
		flex: none;
		width: var(--switch-w);
		height: var(--switch-h);
		margin: 0;
		border-radius: var(--radius-pill);
		background: var(--switch-off);
		cursor: pointer;
		transition: background var(--dur) var(--ease);
	}
	.switch::after {
		content: '';
		position: absolute;
		top: 2px;
		left: 2px;
		width: calc(var(--switch-h) - 4px);
		height: calc(var(--switch-h) - 4px);
		border-radius: 50%;
		background: var(--switch-knob);
		box-shadow: var(--switch-knob-shadow);
		transition: translate var(--dur-pop) var(--ease-spring);
	}
	.switch:checked {
		background: var(--switch-on);
	}
	.switch:checked::after {
		translate: calc(var(--switch-w) - var(--switch-h)) 0;
	}
	.switch:disabled {
		cursor: default;
		opacity: 0.45;
	}
	.switch:focus-visible {
		outline: none;
		box-shadow: var(--ring);
	}
</style>
