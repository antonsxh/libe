import { describe, expect, test } from 'bun:test';
import { isUuid } from './ids.ts';

describe('isUuid', () => {
	test('accepts UUIDs', () => {
		expect(isUuid('9f1c6f37-3a4b-4c8d-9e0f-1a2b3c4d5e6f')).toBe(true);
		expect(isUuid('00000000-0000-4000-8000-000000000000')).toBe(true);
	});

	test('rejects junk that would make Postgres throw', () => {
		expect(isUuid('')).toBe(false);
		expect(isUuid('123')).toBe(false);
		expect(isUuid('not-a-uuid')).toBe(false);
		expect(isUuid('9f1c6f37-3a4b-4c8d-9e0f-1a2b3c4d5e6')).toBe(false);
		expect(isUuid('9f1c6f37-3a4b-4c8d-9e0f-1a2b3c4d5e6fg')).toBe(false);
		expect(isUuid(null)).toBe(false);
		expect(isUuid(undefined)).toBe(false);
	});
});
