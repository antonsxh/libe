import { describe, expect, test } from 'bun:test';
import {
	DEFAULT_AVATAR_COLOR,
	DISPLAY_NAME_MAX,
	greetingPart,
	initials,
	normalizeDisplayName,
	parseAvatarColor,
	toProfile,
	parseAvatarEmoji
} from './profile.ts';

describe('initials', () => {
	test('first letters of the first and last word', () => {
		expect(initials('Anton Schmidt')).toBe('AS');
		expect(initials('Anna Maria von Berg')).toBe('AB');
		expect(initials('Jean-Luc Picard')).toBe('JP');
	});

	test('a single word gives one letter, upper-cased', () => {
		expect(initials('anton')).toBe('A');
		expect(initials('  anton  ')).toBe('A');
	});

	test('no name → null', () => {
		expect(initials(null)).toBeNull();
		expect(initials(undefined)).toBeNull();
		expect(initials('')).toBeNull();
		expect(initials('   ')).toBeNull();
		expect(initials('- & ...')).toBeNull();
	});

	test('umlauts, combining marks and emoji count as one grapheme', () => {
		expect(initials('ölaf ützel')).toBe('ÖÜ');
		// "e" + COMBINING ACUTE ACCENT → one grapheme (NFC turns it into "é").
		expect(initials('e\u0301mile zola')).toBe('\u00c9Z');
		expect(initials('🦊 fox')).toBe('🦊F');
		// Family emoji (ZWJ sequence) stays whole.
		expect(initials('👩‍👩‍👧 home')).toBe('👩‍👩‍👧H');
	});

	test('punctuation-only words and leading punctuation are skipped', () => {
		expect(initials('Anton & Co')).toBe('AC');
		expect(initials('Anton -')).toBe('A');
		expect(initials('(toni) "berg"')).toBe('TB');
	});

	test('locale-aware upper-casing', () => {
		expect(initials('ilker ışık', 'tr')).toBe('İI');
		expect(initials('ilker', 'en')).toBe('I');
	});
});

describe('normalizeDisplayName', () => {
	test('trims, collapses whitespace, drops control characters', () => {
		expect(normalizeDisplayName('  Anton \t\n Schmidt ')).toEqual({
			ok: true,
			value: 'Anton Schmidt'
		});
		expect(normalizeDisplayName('An\u0007ton')).toEqual({ ok: true, value: 'Anton' });
	});

	test('empty, whitespace-only or missing → null (no name)', () => {
		expect(normalizeDisplayName('')).toEqual({ ok: true, value: null });
		expect(normalizeDisplayName('   \n ')).toEqual({ ok: true, value: null });
		expect(normalizeDisplayName(null)).toEqual({ ok: true, value: null });
		expect(normalizeDisplayName(42)).toEqual({ ok: true, value: null });
	});

	test(`at most ${DISPLAY_NAME_MAX} code points after normalising`, () => {
		const max = 'a'.repeat(DISPLAY_NAME_MAX);
		expect(normalizeDisplayName(max)).toEqual({ ok: true, value: max });
		expect(normalizeDisplayName(`  ${max}  `)).toEqual({ ok: true, value: max });
		expect(normalizeDisplayName(`${max}b`)).toEqual({ ok: false, error: 'profileNameTooLong' });
		// Emoji are one code point each (UTF-16 would count two).
		const emoji = '🦊'.repeat(DISPLAY_NAME_MAX);
		expect(normalizeDisplayName(emoji)).toEqual({ ok: true, value: emoji });
	});

	test('NFC: a decomposed umlaut counts as one character', () => {
		const decomposed = 'u\u0308'.repeat(DISPLAY_NAME_MAX);
		const result = normalizeDisplayName(decomposed);
		expect(result).toEqual({ ok: true, value: '\u00fc'.repeat(DISPLAY_NAME_MAX) });
	});
});

describe('parseAvatarColor', () => {
	test('accepts quest colour keys only', () => {
		expect(parseAvatarColor('teal')).toEqual({ ok: true, value: 'teal' });
		expect(parseAvatarColor('magenta')).toEqual({ ok: false, error: 'profileColorInvalid' });
		expect(parseAvatarColor(null)).toEqual({ ok: false, error: 'profileColorInvalid' });
	});
});

describe('toProfile', () => {
	test('defaults without a row, slate for an unknown colour', () => {
		expect(toProfile(undefined)).toEqual({
			displayName: null,
			avatarColor: DEFAULT_AVATAR_COLOR,
			avatarEmoji: null
		});
		expect(toProfile({ displayName: 'Anton', avatarColor: 'nope' })).toEqual({
			displayName: 'Anton',
			avatarColor: 'slate',
			avatarEmoji: null
		});
		expect(toProfile({ displayName: '  ', avatarColor: 'blue' })).toEqual({
			displayName: null,
			avatarColor: 'blue',
			avatarEmoji: null
		});
	});

	test('keeps a stored single emoji, drops anything else', () => {
		const row = { displayName: 'Anton', avatarColor: 'teal' };
		expect(toProfile({ ...row, avatarEmoji: '🦊' }).avatarEmoji).toBe('🦊');
		expect(toProfile({ ...row, avatarEmoji: '👩‍💻' }).avatarEmoji).toBe('👩‍💻');
		expect(toProfile({ ...row, avatarEmoji: 'ab' }).avatarEmoji).toBeNull();
		expect(toProfile({ ...row, avatarEmoji: '🦊🐻' }).avatarEmoji).toBeNull();
		expect(toProfile({ ...row, avatarEmoji: null }).avatarEmoji).toBeNull();
	});
});

describe('parseAvatarEmoji', () => {
	test('style "emoji" with exactly one emoji (trimmed, ZWJ sequences and flags whole)', () => {
		expect(parseAvatarEmoji('emoji', ' 🦊 ')).toEqual({ ok: true, value: '🦊' });
		expect(parseAvatarEmoji('emoji', '👨‍👩‍👧')).toEqual({ ok: true, value: '👨‍👩‍👧' });
		expect(parseAvatarEmoji('emoji', '🇩🇪')).toEqual({ ok: true, value: '🇩🇪' });
	});

	test('a blank emoji or the initials style means initials (null)', () => {
		expect(parseAvatarEmoji('emoji', '   ')).toEqual({ ok: true, value: null });
		expect(parseAvatarEmoji('initials', '🦊')).toEqual({ ok: true, value: null });
		expect(parseAvatarEmoji(undefined, '🦊')).toEqual({ ok: true, value: null });
		expect(parseAvatarEmoji('emoji', null)).toEqual({ ok: true, value: null });
	});

	test('rejects text and more than one emoji', () => {
		const invalid = { ok: false, error: 'profileEmojiInvalid' } as const;
		expect(parseAvatarEmoji('emoji', 'A')).toEqual(invalid);
		expect(parseAvatarEmoji('emoji', '🦊🐻')).toEqual(invalid);
		expect(parseAvatarEmoji('emoji', '🦊 x')).toEqual(invalid);
	});
});

describe('greetingPart', () => {
	test.each([
		[4, 'night'],
		[5, 'morning'],
		[11, 'morning'],
		[12, 'afternoon'],
		[17, 'afternoon'],
		[18, 'evening'],
		[22, 'evening'],
		[23, 'night'],
		[0, 'night']
	] as const)('%i h → %s', (hour, part) => {
		expect(greetingPart(hour)).toBe(part);
	});

	test('fractions and out-of-range hours wrap', () => {
		expect(greetingPart(11.99)).toBe('morning');
		expect(greetingPart(24)).toBe('night');
		expect(greetingPart(-1)).toBe('night');
		expect(greetingPart(29)).toBe('morning');
	});
});
