/**
 * Autosave for Settings forms (AB1): `createAutosave()` in a component, then
 * `<form method="POST" action=… use:enhance={save.enhance} {@attach save.form}>`.
 *
 * - Every `change` saves (radios, checkboxes, switches, selects); text and number fields fire
 *   `change` on blur, and Enter commits them too (no implicit submit, no second save of the
 *   same values). `save.now()` saves after a programmatic change (an emoji suggestion).
 * - Saves go through the form action (server rules, progressive enhancement); a rejected value
 *   comes back as the action's `form` and the field shows the inline error — nothing is saved.
 * - The page-wide {@link SaveIndicator} (context) shows "Saving…" / "Saved" quietly.
 */
import { getContext, setContext, tick } from 'svelte';
import type { SubmitFunction } from '$app/forms';
import { SaveQueue, formSignature, isCommitField } from '#lib/autosave.ts';

export type SaveState = 'idle' | 'saving' | 'saved' | 'failed';

/** "Saving…" / "Saved" for a page (the Settings pane title, the sheets). */
export class SaveIndicator {
	state = $state<SaveState>('idle');
	#pending = 0;
	#timer: ReturnType<typeof setTimeout> | undefined;

	start() {
		this.#pending++;
		clearTimeout(this.#timer);
		this.state = 'saving';
	}

	finish(ok: boolean) {
		this.#pending = Math.max(0, this.#pending - 1);
		if (this.#pending > 0) return;
		this.state = ok ? 'saved' : 'failed';
		clearTimeout(this.#timer);
		// "Saved" fades after a moment; an error stays with its field.
		if (ok) this.#timer = setTimeout(() => (this.state = 'idle'), 2000);
	}
}

const KEY = Symbol('save-indicator');

export function provideSaveIndicator(): SaveIndicator {
	return setContext(KEY, new SaveIndicator());
}

export function useSaveIndicator(): SaveIndicator | undefined {
	return getContext<SaveIndicator | undefined>(KEY);
}

type Options = {
	/** A change that should not save yet (e.g. "Custom duration…" before a duration). */
	skip?: (target: EventTarget | null) => boolean;
	/** After the answer was applied (the page data is fresh). */
	onresult?: (ok: boolean) => void;
};

export function createAutosave(options: Options = {}) {
	const indicator = useSaveIndicator();
	const queue = new SaveQueue();
	let el: HTMLFormElement | null = null;
	/** Values of the last save (or of the form as loaded): Enter + blur save once. */
	let last = '';

	function now() {
		if (!el) return;
		if (formSignature(new FormData(el)) === last) return;
		if (queue.request()) el.requestSubmit();
	}

	const enhance: SubmitFunction = ({ formData }) => {
		queue.started();
		last = formSignature(formData);
		indicator?.start();
		return async ({ result, update }) => {
			if (queue.settle() === 'resubmit' && el) {
				indicator?.finish(true);
				last = '';
				el.requestSubmit();
				return;
			}
			if (result.type === 'redirect') {
				indicator?.finish(true);
				await update();
				return;
			}
			await update({ reset: false });
			await tick();
			if (el) last = formSignature(new FormData(el));
			const ok = result.type === 'success';
			indicator?.finish(ok);
			options.onresult?.(ok);
		};
	};

	/** Attachment for the `<form>`. */
	const form = (node: HTMLFormElement) => {
		el = node;
		last = formSignature(new FormData(node));
		const onchange = (e: Event) => {
			if (!options.skip?.(e.target)) now();
		};
		const onkeydown = (e: KeyboardEvent) => {
			if (e.key !== 'Enter' || !isCommitField(e.target)) return;
			e.preventDefault();
			now();
		};
		node.addEventListener('change', onchange);
		node.addEventListener('keydown', onkeydown);
		return () => {
			node.removeEventListener('change', onchange);
			node.removeEventListener('keydown', onkeydown);
			if (el === node) el = null;
		};
	};

	return {
		enhance,
		form,
		now,
		get busy() {
			return queue.busy;
		}
	};
}
