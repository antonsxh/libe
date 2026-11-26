/**
 * Autosave (Settings, AB1) — the pure part. A form saves itself on every change (switches,
 * choice rows) and when a text field is committed (blur / Enter). Saves of one form never
 * overlap: a change while a save is in flight waits, and once the save answers the form is
 * sent again with its current values instead of applying the stale answer — so a quick second
 * change is neither lost nor overwritten by the first answer's page data.
 */
export class SaveQueue {
	#inFlight = false;
	#again = false;

	/** A save is being sent (or a resubmission waits for one). */
	get busy(): boolean {
		return this.#inFlight;
	}

	/** A change wants saving: true → submit now; false → it is sent once the current save answers. */
	request(): boolean {
		if (this.#inFlight) {
			this.#again = true;
			return false;
		}
		return true;
	}

	/** A submission starts (also one the browser started itself, e.g. a no-JS button). */
	started(): void {
		this.#inFlight = true;
	}

	/**
	 * The submission answered: `resubmit` → send the form again with its current values (a
	 * newer change waited; skip this answer), `apply` → apply this answer (refresh the data).
	 */
	settle(): 'resubmit' | 'apply' {
		if (this.#again) {
			this.#again = false;
			return 'resubmit';
		}
		this.#inFlight = false;
		return 'apply';
	}
}

/** Text-like fields save when committed (blur / Enter), everything else on change. */
export function isCommitField(el: EventTarget | null): el is HTMLInputElement {
	if (!el || typeof (el as HTMLInputElement).type !== 'string') return false;
	const input = el as HTMLInputElement;
	return (
		input.tagName === 'INPUT' &&
		['text', 'number', 'search', 'email', 'url', 'tel'].includes(input.type)
	);
}

/** A form's values as one comparable string (unchanged text → no second save). */
export function formSignature(data: FormData): string {
	const pairs: string[] = [];
	for (const [key, value] of data) pairs.push(`${key}=${typeof value === 'string' ? value : ''}`);
	return pairs.join('&');
}
