<script lang="ts" module>
	import type { PickTask } from '#lib/calendar.ts';

	/** What the calendar's session dialog edits: a new log or an existing session. */
	export interface SessionEditor {
		/** Set when editing an existing (completed) session. */
		sessionId?: string;
		taskId: string | null;
		/** The edited session's task when the picker list lacks it. */
		task?: PickTask | null;
		/** Start/end as wall time in the server timezone. */
		day: string;
		start: string;
		endDay: string;
		end: string;
	}
</script>

<script lang="ts">
	import { untrack } from 'svelte';
	import { refreshAll } from '$app/navigation';
	import { Trash2 } from '@lucide/svelte';
	import Button from '#lib/components/Button.svelte';
	import Dialog from '#lib/components/Dialog.svelte';
	import TaskPicker from '#lib/components/calendar/TaskPicker.svelte';
	import { formatDurationMs } from '#lib/duration.ts';
	import { addDays, parseDay } from '#lib/dates.ts';
	import { parseClock } from '#lib/timeline.ts';
	import { useI18n } from '#lib/i18n/context.svelte.ts';

	type Props = {
		editor: SessionEditor;
		tasks: PickTask[];
		weekDays: string[];
		onclose: () => void;
	};
	let { editor, tasks, weekDays, onclose }: Props = $props();
	const t = useI18n();

	type Errors = { task?: string; day?: string; start?: string; end?: string; form?: string };

	// The dialog is keyed per editor by the page, so the props seed the form once.
	const initial = untrack(() => $state.snapshot(editor));
	const editing = initial.sessionId !== undefined;
	let open = $state(true);
	let taskId = $state(initial.taskId);
	let day = $state(initial.day);
	let start = $state(initial.start);
	let endDay = $state(initial.endDay);
	let end = $state(initial.end);
	let errors = $state<Errors>({});
	let busy = $state(false);

	/** Minutes from start to end, by wall clock (display only — the server decides). */
	function spanMinutes(d1: string, t1: string, d2: string, t2: string): number | null {
		const a = parseClock(t1);
		const b = parseClock(t2);
		if (a === null || b === null || !d1 || !d2) return null;
		return (parseDay(d2).getTime() - parseDay(d1).getTime()) / 60_000 + b - a;
	}
	const span = $derived(spanMinutes(day, start, endDay, end));

	/** New logs keep their duration when the start moves (edits change one edge at a time). */
	let lastSpan = spanMinutes(initial.day, initial.start, initial.endDay, initial.end);
	function onStartChange() {
		if (editing || lastSpan === null || lastSpan <= 0) return;
		const s = parseClock(start);
		if (s === null || !day) return;
		const total = s + lastSpan;
		const dayOffset = Math.floor(total / 1440);
		const m = total - dayOffset * 1440;
		endDay = addDays(day, dayOffset);
		end = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
	}
	function onEndChange() {
		lastSpan = span;
	}

	async function send(method: 'POST' | 'PATCH' | 'DELETE', url: string, body?: unknown) {
		busy = true;
		try {
			const res = await fetch(url, {
				method,
				headers: body ? { 'content-type': 'application/json' } : undefined,
				body: body ? JSON.stringify(body) : undefined
			});
			const data = (await res.json().catch(() => null)) as {
				ok?: boolean;
				errors?: Errors;
				message?: string;
			} | null;
			if (!res.ok || !data?.ok) {
				errors = data?.errors ?? { form: data?.message ?? t.common.couldNotSave(res.status) };
				return;
			}
			errors = {};
			// Reload the week before closing so the grid and totals are fresh when it disappears.
			await refreshAll();
			open = false;
		} catch {
			errors = { form: t.common.networkError };
		} finally {
			busy = false;
		}
	}

	function submit(e: SubmitEvent) {
		e.preventDefault();
		if (!taskId) {
			errors = { task: t.errors.pickTask };
			return;
		}
		const body = { taskId, day, start, endDay, end };
		if (editing) void send('PATCH', `/api/sessions/${initial.sessionId}`, body);
		else void send('POST', '/api/sessions', body);
	}

	function remove() {
		if (editing) void send('DELETE', `/api/sessions/${initial.sessionId}`);
	}

	const fieldErrors = $derived(
		[errors.task, errors.day, errors.start, errors.end].filter((m): m is string => !!m)
	);
</script>

<Dialog
	bind:open
	onclosed={onclose}
	title={editing ? t.calendar.dialog.titleEdit : t.calendar.dialog.titleNew}
>
	<form class="session-form" onsubmit={submit} novalidate>
		{#if errors.form}<p class="error" role="alert">{errors.form}</p>{/if}

		<div class="field">
			<span class="label">{t.common.task}</span>
			<TaskPicker
				{tasks}
				bind:value={taskId}
				day={initial.day}
				{weekDays}
				extra={initial.task ?? null}
				invalid={!!errors.task}
			/>
		</div>

		<div class="when">
			<span class="label">{t.common.start}</span>
			<input
				type="date"
				name="day"
				aria-label={t.calendar.dialog.startDate}
				bind:value={day}
				onchange={onStartChange}
				aria-invalid={errors.day ? 'true' : undefined}
			/>
			<input
				type="time"
				name="start"
				aria-label={t.calendar.dialog.startTime}
				bind:value={start}
				oninput={onStartChange}
				aria-invalid={errors.start ? 'true' : undefined}
			/>
			<span class="label">{t.common.end}</span>
			<input
				type="date"
				name="endDay"
				aria-label={t.calendar.dialog.endDate}
				bind:value={endDay}
				oninput={onEndChange}
				aria-invalid={errors.end ? 'true' : undefined}
			/>
			<input
				type="time"
				name="end"
				aria-label={t.calendar.dialog.endTime}
				bind:value={end}
				oninput={onEndChange}
				aria-invalid={errors.end ? 'true' : undefined}
			/>
		</div>
		<p class="span muted tabular" aria-live="polite">
			{#if span !== null && span > 0}{formatDurationMs(span * 60_000, t.intl)}{:else}—{/if}
		</p>

		{#each fieldErrors as msg (msg)}
			<p class="error" role="alert">{msg}</p>
		{/each}

		<div class="actions dialog-actions">
			{#if editing}
				<button type="button" class="delete" disabled={busy} onclick={remove}>
					<Trash2 size={15} />
					{t.common.delete}
				</button>
			{/if}
			<span class="spacer"></span>
			<Button variant="secondary" onclick={() => (open = false)}>{t.common.cancel}</Button>
			<Button variant="primary" type="submit" disabled={busy}>
				{editing ? t.common.save : t.calendar.dialog.submit}
			</Button>
		</div>
	</form>
</Dialog>

<style>
	.field {
		display: grid;
		gap: var(--space-1);
	}
	.when {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) minmax(0, 1fr);
		align-items: center;
		gap: var(--space-2) var(--space-3);
		margin-top: var(--space-5);
	}
	.when input {
		min-width: 0;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		color: var(--text);
		font-size: var(--fs-md);
		padding: var(--space-2) var(--space-3);
	}
	.when input:hover {
		border-color: var(--border-strong);
	}
	.when input[aria-invalid='true'] {
		border-color: var(--danger);
	}
	.span {
		margin-top: var(--space-2);
		text-align: right;
		font-size: var(--fs-sm);
	}
	.error {
		margin-top: var(--space-2);
		color: var(--danger);
		font-size: var(--fs-sm);
	}
	.actions {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-top: var(--space-5);
	}
	.spacer {
		flex: 1;
	}
	.delete {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		height: 44px;
		padding: 0 var(--space-3);
		border: none;
		border-radius: var(--radius-md);
		background: transparent;
		color: var(--danger);
		font-weight: var(--fw-medium);
	}
	.delete:hover {
		background: var(--surface-hover);
	}
</style>
