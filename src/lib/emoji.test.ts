import { describe, expect, test } from 'bun:test';
import { isSingleEmoji } from './emoji.ts';

describe('isSingleEmoji', () => {
	test('accepts a plain emoji', () => {
		expect(isSingleEmoji('🚀')).toBe(true);
		expect(isSingleEmoji('✨')).toBe(true);
		expect(isSingleEmoji('❤️')).toBe(true); // emoji + variation selector
	});

	test('accepts ZWJ sequences and flags as one grapheme', () => {
		expect(isSingleEmoji('👨‍👩‍👧')).toBe(true);
		expect(isSingleEmoji('🇩🇪')).toBe(true);
	});

	test('rejects text, multiple graphemes and empty input', () => {
		expect(isSingleEmoji('a')).toBe(false);
		expect(isSingleEmoji('🚀🚀')).toBe(false);
		expect(isSingleEmoji('🚀 ')).toBe(false);
		expect(isSingleEmoji('')).toBe(false);
	});
});
