<script lang="ts">
	import { refreshAll } from '$app/navigation';
	import { Trash2 } from '@lucide/svelte';
	import Button from '#lib/components/Button.svelte';
	import Dialog from '#lib/components/Dialog.svelte';
	import { addDays, formatMinutes, todayISO } from '#lib/dates.ts';
	import { durationBetween, endClock } from '#lib/manual-log.ts';
	import { parseClock } from '#lib/timeline.ts';
	import { formatClock } from '#lib/timer.ts';
	import { useTimer, type TaskRef } from '#lib/timer-store.svelte.ts';
	import type { LoggedSession } from '#lib/server/sessions.ts';
	import { useI18n } from '#lib/i18n/context.svelte.ts';

	type Props = { task: TaskRef };
	let { task }: Props = $props();

	const timer = useTimer();
	const t = useI18n();
	let open = $state(true);

	const today = todayISO();
	const DEFAULT_MIN = 30;
	/** Default start: `DEFAULT_MIN` before now, rounded down to 5 minutes. */
	function defaultStart(): number {
		const now = new Date();
		const min = now.getHours() * 60 + now.getMinutes() - DEFAULT_MIN;
		return Math.max(0, Math.floor(min / 5) * 5);
	}
	const start0 = defaultStart();

	let day = $state(today);
	let start = $state(formatMinutes(start0));
	let duration = $state(String(DEFAULT_MIN));
	let end = $state(endClock(start0, DEFAULT_MIN));
	let markDone = $state(false);
	/** Messages from `/api/sessions` (translated there) or the client. */
	type Errors = { day?: string; start?: string; duration?: string; task?: string; form?: string };
	let errors = $state<Errors>({});
	let saved = $state<string | null>(null);
	let saving = $state(false);

	// Keep duration ↔ end time in sync (an end at/before the start means the next day).
	function syncEnd() {
		const s = parseClock(start);
		const d = Number(duration);
		if (s !== null && Number.isInteger(d) && d > 0) end = endClock(s, d);
	}
	function syncDuration() {
		const s = parseClock(start);
		const e = parseClock(end);
		if (s !== null && e !== null) duration = String(durationBetween(s, e));
	}

	/* ── Sessions of this task on the chosen day ─────────────────────────────── */
	let sessions = $state<LoggedSession[] | null>(null);
	let listError = $state<string | null>(null);

	async function loadSessions(forDay: string) {
		listError = null;
		try {
			const res = await fetch(`/api/sessions?taskId=${task.id}&day=${forDay}`);
			if (!res.ok) throw new Error(String(res.status));
			const body = (await res.json()) as { sessions: LoggedSession[] };
			if (forDay === day) sessions = body.sessions;
		} catch {
			listError = t.focus.log.loadFailed;
		}
	}
	$effect(() => {
		void loadSessions(day);
	});

	const clock = (ms: number) => {
		const d = new Date(ms);
		return formatMinutes(d.getHours() * 60 + d.getMinutes());
	};

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		saving = true;
		saved = null;
		try {
			const res = await fetch('/api/sessions', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					taskId: task.id,
					day,
					start,
					durationMin: Number(duration),
					markDone
				})
			});
			const body = (await res.json().catch(() => null)) as {
				ok: boolean;
				errors?: typeof errors;
			} | null;
			if (!body?.ok) {
				errors = body?.errors ?? { form: t.common.couldNotSave(res.status) };
				return;
			}
			errors = {};
			saved = t.focus.log.logged(duration);
			await loadSessions(day);
			await refreshAll();
		} catch {
			errors = { form: t.common.networkError };
		} finally {
			saving = false;
		}
	}

	async function remove(id: string) {
		try {
			const res = await fetch(`/api/sessions/${id}`, { method: 'DELETE' });
			if (!res.ok) throw new Error(String(res.status));
			saved = null;
			await loadSessions(day);
			await refreshAll();
		} catch {
			listError = t.focus.log.deleteFailed;
		}
	}
</script>

<Dialog bind:open title={t.focus.log.title} onclosed={() => (timer.logTarget = null)}>
	<form class="log" onsubmit={submit} novalidate>
		<p class="muted task-name">{task.title}</p>

		{#if errors.form || errors.task}
			<p class="error" role="alert">{errors.form ?? errors.task}</p>
		{/if}

		<div class="fields">
			<label class="field">
				<span class="label">{t.focus.log.date}</span>
				<input
					type="date"
					name="day"
					required
					min={addDays(today, -365)}
					max={today}
					bind:value={day}
					aria-invalid={errors.day ? 'true' : undefined}
				/>
			</label>
			<label class="field">
				<span class="label">{t.common.start}</span>
				<input
					type="time"
					name="start"
					required
					bind:value={start}
					oninput={syncEnd}
					aria-invalid={errors.start ? 'true' : undefined}
				/>
			</label>
			<label class="field">
				<span class="label">{t.focus.log.minutes}</span>
				<input
					type="number"
					name="durationMin"
					min="1"
					max="1440"
					step="1"
					required
					bind:value={duration}
					oninput={syncEnd}
					aria-invalid={errors.duration ? 'true' : undefined}
				/>
			</label>
			<label class="field">
				<span class="label">{t.common.end}</span>
				<input type="time" name="end" bind:value={end} oninput={syncDuration} />
			</label>
		</div>
		{#each [errors.day, errors.start, errors.duration].filter(Boolean) as msg (msg)}
			<p class="error" role="alert">{msg}</p>
		{/each}

		<label class="done">
			<input type="checkbox" name="markDone" bind:checked={markDone} />
			{t.focus.log.markDone}
		</label>

		<section class="sessions" aria-label={t.focus.log.sessions}>
			<h3 class="label">{t.focus.log.loggedOnDay}</h3>
			{#if listError}
				<p class="error">{listError}</p>
			{:else if sessions === null}
				<p class="muted small">{t.common.loading}</p>
			{:else if sessions.length === 0}
				<p class="muted small">{t.focus.log.nothingLogged}</p>
			{:else}
				<ul>
					{#each sessions as s (s.id)}
						<li class="session">
							<span class="tabular span">
								{clock(s.startedAt)} – {s.endedAt ? clock(s.endedAt) : '…'}
							</span>
							<span class="tabular muted">{formatClock(s.minutes * 60)}</span>
							<span class="src muted">{t.timer.sources[s.source]}</span>
							<button
								type="button"
								class="del"
								aria-label={t.focus.log.deleteSession(clock(s.startedAt))}
								onclick={() => remove(s.id)}
							>
								<Trash2 size={14} />
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		{#if saved}<p class="saved" role="status">{saved}</p>{/if}

		<div class="actions dialog-actions">
			<Button variant="secondary" onclick={() => (open = false)}>
				{saved ? t.common.done : t.common.cancel}
			</Button>
			<Button variant="primary" type="submit" disabled={saving}>{t.focus.log.submit}</Button>
		</div>
	</form>
</Dialog>

<style>
	.task-name {
		margin: calc(-1 * var(--space-2)) 0 var(--space-4);
		font-size: var(--fs-sm);
	}
	.fields {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--space-3);
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		min-width: 0;
	}
	.field input {
		min-width: 0;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		color: var(--text);
		font-size: var(--fs-md);
		padding: var(--space-2) var(--space-3);
	}
	.field input:hover {
		border-color: var(--border-strong);
	}
	.field input[aria-invalid='true'] {
		border-color: var(--danger);
	}
	.error {
		margin-top: var(--space-2);
		color: var(--danger);
		font-size: var(--fs-sm);
	}
	.done {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-top: var(--space-4);
		color: var(--text-2);
		font-size: var(--fs-sm);
	}
	.done input {
		accent-color: var(--accent);
	}
	.sessions {
		margin-top: var(--space-5);
		padding-top: var(--space-4);
		border-top: 1px solid var(--border);
	}
	.sessions h3 {
		margin-bottom: var(--space-2);
	}
	.sessions ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: var(--space-1);
	}
	.session {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-1) var(--space-2);
		border-radius: var(--radius-sm);
		background: var(--bg);
		font-size: var(--fs-sm);
	}
	.span {
		color: var(--text-2);
	}
	.src {
		flex: 1;
		min-width: 0;
		font-size: var(--fs-xs);
	}
	.small {
		font-size: var(--fs-sm);
	}
	.del {
		display: grid;
		place-items: center;
		width: 26px;
		height: 26px;
		border: none;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text-faint);
	}
	.del:hover {
		color: var(--danger);
		background: var(--surface-hover);
	}
	.saved {
		margin-top: var(--space-3);
		color: var(--success);
		font-size: var(--fs-sm);
	}
	.actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-2);
		margin-top: var(--space-5);
	}
</style>
