import { describe, expect, test } from 'bun:test';
import { qrShape } from './qr.ts';

describe('qrShape', () => {
	test('pairing URL → version-3/4 symbol with finder patterns in three corners', () => {
		const { size, path } = qrShape('https://libe.example.com/pair?code=482913');
		expect(size).toBeGreaterThanOrEqual(25);
		expect((size - 17) % 4).toBe(0); // 21, 25, 29, … modules
		// Top rows of the top-left and top-right finders are 7-module runs.
		expect(path.startsWith('M0 0h7v1h-7z')).toBe(true);
		expect(path).toContain(`M${size - 7} 0h7v1h-7z`);
		expect(path).toContain(`M0 ${size - 7}h7v1h-7z`);
	});

	test('longer content grows the symbol', () => {
		expect(qrShape('x'.repeat(200)).size).toBeGreaterThan(qrShape('x').size);
	});
});
