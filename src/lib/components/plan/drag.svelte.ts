/**
 * The task currently dragged on the Plan board. Shared by all columns (and the backlog
 * rail) so a drop target can place its indicator in the list the task will really land
 * in: a task keeps its kind, so a quest task always goes to the quest list of a day (or
 * its quest's backlog group), an "other" task to the Other list / Other backlog group.
 * `dataTransfer` data is not readable during `dragover`, hence this module state.
 */
export interface DraggedTask {
	id: string;
	kind: 'quest' | 'other';
	questId: string | null;
}

export const drag = $state<{ task: DraggedTask | null }>({ task: null });

/** Start a drag: fill the DataTransfer (needed for Firefox) and remember the task. */
export function startDrag(e: DragEvent, task: DraggedTask) {
	if (e.dataTransfer) {
		e.dataTransfer.setData('text/plain', task.id);
		e.dataTransfer.effectAllowed = 'move';
	}
	drag.task = { id: task.id, kind: task.kind, questId: task.questId };
}

export function endDrag() {
	drag.task = null;
}

/**
 * Id of the first row in `container` (matching `selector`, excluding the dragged one) whose
 * vertical midpoint lies below the pointer — the drop goes *before* it; null = append.
 */
export function rowBefore(container: HTMLElement, selector: string, y: number): string | null {
	for (const el of container.querySelectorAll<HTMLElement>(selector)) {
		if (el.dataset.task === drag.task?.id) continue;
		const box = el.getBoundingClientRect();
		if (y < box.top + box.height / 2) return el.dataset.task ?? null;
	}
	return null;
}

/** Submit a hidden `?/moveTo` form (enhanced by the caller) for the dragged task. */
export function submitMove(form: HTMLFormElement, day: string, beforeId: string | null) {
	const task = drag.task;
	endDrag();
	if (!task || task.id === beforeId) return;
	const field = (name: string) => form.elements.namedItem(name) as HTMLInputElement;
	field('taskId').value = task.id;
	field('day').value = day;
	field('beforeId').value = beforeId ?? '';
	form.requestSubmit();
}
