import { expect, test } from 'bun:test';
import {
	availableSections,
	isSettingsSection,
	requestedSection,
	restDaysSummary,
	sectionFromHash,
	settingsHref,
	weekdayName
} from './settings-sections.ts';
import { GOAL_HREF } from './daily-goal.ts';
import { PROFILE_HREF } from './profile.ts';
import { STREAK_HREF } from './streak.ts';

const ALL = availableSections({ desktopApp: true }).concat('notifications');
const url = (path: string) => new URL(path, 'http://libe.test');

test('availableSections: notifications outside the desktop app, the app section only inside', () => {
	expect(availableSections({ desktopApp: false })).toEqual([
		'profile',
		'goal',
		'focus',
		'notifications',
		'language',
		'devices'
	]);
	expect(availableSections({ desktopApp: true })).toEqual([
		'profile',
		'goal',
		'focus',
		'language',
		'devices',
		'desktop'
	]);
});

test('isSettingsSection only accepts known ids', () => {
	expect(isSettingsSection('goal')).toBe(true);
	expect(isSettingsSection('streak')).toBe(false);
	expect(isSettingsSection(null)).toBe(false);
});

test('old anchors map to their section', () => {
	expect(sectionFromHash('#profile')).toBe('profile');
	expect(sectionFromHash('#goal')).toBe('goal');
	expect(sectionFromHash('streak')).toBe('goal');
	expect(sectionFromHash('#devices')).toBeNull();
	expect(sectionFromHash('')).toBeNull();
});

test('requestedSection: ?section= first, then an old anchor, only available ones', () => {
	expect(requestedSection(url('/settings?section=focus'), ALL)).toBe('focus');
	expect(requestedSection(url('/settings?section=focus#profile'), ALL)).toBe('focus');
	expect(requestedSection(url('/settings?section=nope#streak'), ALL)).toBe('goal');
	expect(requestedSection(url('/settings'), ALL)).toBeNull();
	const browser = availableSections({ desktopApp: false });
	expect(requestedSection(url('/settings?section=desktop'), browser)).toBeNull();
});

test('the shared edit links land on their section', () => {
	const section = (href: string) => requestedSection(url(href), ALL);
	expect(section(PROFILE_HREF)).toBe('profile');
	expect(section(GOAL_HREF)).toBe('goal');
	expect(section(STREAK_HREF)).toBe('goal');
	expect(settingsHref('devices')).toBe('/settings?section=devices');
	expect(settingsHref(null)).toBe('/settings');
});

test('restDaysSummary: names Monday first up to three days, else a count', () => {
	const names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
	const text = { name: (i: number) => names[i], count: (n: number) => `${n} days`, none: 'None' };
	expect(restDaysSummary([], text)).toBe('None');
	expect(restDaysSummary([6, 5], text)).toBe('Sat, Sun');
	expect(restDaysSummary([0, 2, 4], text)).toBe('Mon, Wed, Fri');
	expect(restDaysSummary([0, 1, 2, 3], text)).toBe('4 days');
	expect(restDaysSummary([5, 5, 9], text)).toBe('Sat');
});

test('weekdayName: Monday first, in the given locale', () => {
	expect(weekdayName(0, 'long', 'en-US')).toBe('Monday');
	expect(weekdayName(6, 'short', 'en-US')).toBe('Sun');
	expect(weekdayName(5, 'long', 'de-DE')).toBe('Samstag');
});
