import { describe, expect, test } from 'bun:test';
import { DAILY_GOAL_PRESETS, GOAL_OFF, parseDailyGoal } from './daily-goal.ts';
import { parseTaskDuration } from './task-form.ts';
import {
	FIRST_STEP_DEFAULT_MIN,
	FIRST_STEP_DURATIONS,
	WELCOME_GOALS,
	WELCOME_GOAL_VALUES,
	firstStepDurationChoice,
	initialGoalChoice,
	parseFirstStepDuration,
	parseStep,
	postSetupTarget,
	previousStep,
	welcomeHref
} from './onboarding.ts';

const TASK = '0b6f1d2e-3c4a-4b5c-8d6e-7f8091a2b3c4';

describe('parseStep', () => {
	test('1…3 are steps, anything else is the welcome screen', () => {
		expect(parseStep('1')).toBe(1);
		expect(parseStep('2')).toBe(2);
		expect(parseStep('3')).toBe(3);
		for (const raw of [null, undefined, '', '0', '4', '-1', '01', ' 2', '2.0', 'two'])
			expect(parseStep(raw)).toBe(0);
	});
});

describe('welcomeHref / previousStep', () => {
	test('step 0 is the bare path; the task travels along', () => {
		expect(welcomeHref(0)).toBe('/welcome');
		expect(welcomeHref(1)).toBe('/welcome?step=1');
		expect(welcomeHref(3, TASK)).toBe(`/welcome?step=3&task=${TASK}`);
		expect(welcomeHref(0, TASK)).toBe(`/welcome?task=${TASK}`);
		expect(welcomeHref(2, null)).toBe('/welcome?step=2');
	});
	test('round trip through parseStep', () => {
		for (const step of [0, 1, 2, 3] as const) {
			const url = new URL(welcomeHref(step, TASK), 'http://x');
			expect(parseStep(url.searchParams.get('step'))).toBe(step);
			expect(url.searchParams.get('task')).toBe(TASK);
		}
	});
	test('Back goes one step down, never below the welcome screen', () => {
		expect(previousStep(0)).toBeNull();
		expect(previousStep(1)).toBe(0);
		expect(previousStep(3)).toBe(2);
	});
});

describe('goal choices', () => {
	test('are presets of Settings and valid for parseDailyGoal', () => {
		for (const min of WELCOME_GOALS) {
			expect(DAILY_GOAL_PRESETS as readonly number[]).toContain(min);
			expect(parseDailyGoal({ preset: String(min) })).toEqual({ ok: true, value: min });
		}
		expect(WELCOME_GOAL_VALUES.at(-1)).toBe(GOAL_OFF);
		expect(parseDailyGoal({ preset: GOAL_OFF })).toEqual({ ok: true, value: null });
	});
	test('preselect the stored goal when listed, else 1 h', () => {
		expect(initialGoalChoice(120)).toBe('120');
		expect(initialGoalChoice(null)).toBe('60');
		expect(initialGoalChoice(240)).toBe('60');
		expect(initialGoalChoice(45)).toBe('60');
	});
});

describe('first step duration', () => {
	test('only the segmented choices pass', () => {
		for (const min of FIRST_STEP_DURATIONS) {
			expect(parseFirstStepDuration(String(min))).toEqual({ ok: true, minutes: min });
			// …and they are valid task durations everywhere else too.
			expect(parseTaskDuration(String(min))).toEqual({ ok: true, minutes: min });
		}
		for (const raw of ['', '0', '30', '25.0', '-25', 'abc', null, undefined, 25])
			expect(parseFirstStepDuration(raw)).toEqual({ ok: false, error: 'taskDurationInvalid' });
		expect(parseFirstStepDuration(' 45 ')).toEqual({ ok: true, minutes: 45 });
	});
	test('a stored duration selects its segment, else the default', () => {
		expect(firstStepDurationChoice(45)).toBe(45);
		expect(firstStepDurationChoice(null)).toBe(FIRST_STEP_DEFAULT_MIN);
		expect(firstStepDurationChoice(90)).toBe(FIRST_STEP_DEFAULT_MIN);
	});
});

describe('postSetupTarget', () => {
	test('only the first device of a not yet onboarded install goes to /welcome', () => {
		expect(postSetupTarget({ firstDevice: true, onboarded: false, next: '/plan' })).toBe(
			'/welcome'
		);
		expect(postSetupTarget({ firstDevice: true, onboarded: true, next: '/plan' })).toBe('/plan');
		expect(postSetupTarget({ firstDevice: false, onboarded: false, next: '/' })).toBe('/');
	});
});
