import { expect, test } from 'bun:test';
import { SaveQueue, formSignature } from './autosave.ts';

test('SaveQueue: one save at a time; a change during a save resubmits once, then applies', () => {
	const q = new SaveQueue();
	expect(q.request()).toBe(true);
	q.started();
	expect(q.busy).toBe(true);
	// Two quick changes while the first save is in flight → one resubmission.
	expect(q.request()).toBe(false);
	expect(q.request()).toBe(false);
	expect(q.settle()).toBe('resubmit');
	q.started();
	expect(q.busy).toBe(true);
	expect(q.settle()).toBe('apply');
	expect(q.busy).toBe(false);
	expect(q.request()).toBe(true);
});

test('SaveQueue: a save without a waiting change applies its answer', () => {
	const q = new SaveQueue();
	q.started();
	expect(q.settle()).toBe('apply');
	expect(q.busy).toBe(false);
});

test('formSignature keeps order and repeated keys', () => {
	const a = new FormData();
	a.append('restDay', '5');
	a.append('restDay', '6');
	const b = new FormData();
	b.append('restDay', '5');
	expect(formSignature(a)).toBe('restDay=5&restDay=6');
	expect(formSignature(a)).not.toBe(formSignature(b));
});
