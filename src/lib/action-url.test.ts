import { describe, expect, test } from 'bun:test';
import { actionWithQuery } from './action-url.ts';

describe('actionWithQuery', () => {
	test('no params → plain ?/name', () => {
		expect(actionWithQuery('', 'add')).toBe('?/add');
		expect(actionWithQuery('?', 'add')).toBe('?/add');
	});

	test('keeps the page params and appends the action', () => {
		expect(actionWithQuery('?week=2026-11-23&hideDone=1', 'toggle')).toBe(
			'?week=2026-11-23&hideDone=1&/toggle'
		);
		expect(actionWithQuery('?q=a%2Cb', 'add')).toBe('?q=a%2Cb&/add');
	});

	test('drops a previous action param (page rendered from a native POST)', () => {
		expect(actionWithQuery('?week=2026-11-23&/add', 'moveUp')).toBe('?week=2026-11-23&/moveUp');
		expect(actionWithQuery('?/add', 'moveUp')).toBe('?/moveUp');
	});
});
