/**
 * English UI messages — the source of truth for every key (`Messages` = its type).
 * Plain strings, or functions for interpolation and plurals. `de.ts` mirrors this file.
 * Rich text with markup: `…Before` / `…After` pairs around the emphasised part.
 */
import { DEVICE_MODEL_NAMES, DEVICE_NAME_MAX } from '#lib/auth.ts';
import { MANUAL_LOG_MAX_AGE_DAYS } from '#lib/manual-log.ts';
import { DISPLAY_NAME_MAX } from '#lib/profile.ts';
import { DAILY_GOAL_MAX, DAILY_GOAL_MIN, DAILY_GOAL_STEP } from '#lib/daily-goal.ts';
import { MAX_REST_DAYS } from '#lib/streak.ts';
import { QUEST_BUDGET_MAX_H, QUEST_DESC_MAX, QUEST_NAME_MAX } from '#lib/quest-form.ts';
import { TASK_DURATION_MAX_MIN, TASK_TITLE_MAX } from '#lib/task-form.ts';
import { MAX_TIMER_MIN, POMODORO_LIMITS } from '#lib/timer.ts';
import { formatDurationMin } from '#lib/duration.ts';

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
const lim = POMODORO_LIMITS;

/** `2 h 10 min`, `45 min`, `4 h` — durations in sentences (avatar progress, goal choices). */
const duration = (h: number, m: number) => formatDurationMin(h * 60 + m, 'en-US');

export const en = {
	common: {
		other: 'Other',
		today: 'Today',
		backlog: 'Backlog',
		cancel: 'Cancel',
		save: 'Save',
		delete: 'Delete',
		done: 'Done',
		close: 'Close',
		add: 'Add',
		edit: 'Edit',
		quest: 'Quest',
		start: 'Start',
		end: 'End',
		task: 'Task',
		thisWeek: 'This week',
		loading: 'Loading…',
		actionsFor: (name: string) => `Actions for ${name}`,
		markDone: 'Mark as done',
		markNotDone: 'Mark as not done',
		moveUp: 'Move up',
		moveDown: 'Move down',
		deleteTask: 'Delete task',
		logTimeMenu: 'Log time…',
		durationOptional: 'Duration in minutes (optional)',
		durationPlaceholder: 'min',
		showDone: 'Show done tasks',
		hideDone: 'Hide done tasks',
		networkError: 'Network error — try again.',
		couldNotSave: (status: number) => `Could not save (${status}).`,
		requestFailed: (status: number) => `Request failed (${status}).`,
		pctOfTarget: (pct: number) => `${pct}% of target`,
		closedQuest: 'Closed quest',
		noWeeklyBudget: 'No weekly budget'
	},
	nav: {
		home: 'Home',
		plan: 'Plan',
		calendar: 'Calendar',
		focus: 'Focus',
		quests: 'Quests',
		review: 'Review',
		main: 'Main',
		/** Phones: the tab bar's account avatar (a link to Settings). */
		me: 'Me',
		brandHome: 'libe home',
		timerChip: (display: string, state: string, title: string) =>
			`Timer ${display} (${state}): ${title} — open focus`,
		search: 'Search or jump…',
		account: 'Account and devices',
		accountOf: (name: string) => `Account and devices (${name})`,
		/** Home with a daily goal (its ring): the item's label + `goal.progress` / `progressDone`. */
		withProgress: (label: string, progress: string) => `${label}, ${progress}`,
		signedInAs: 'Signed in as',
		thisDevice: 'This device',
		thisDeviceIs: (device: string) => `This device: ${device}`,
		editProfile: 'Edit profile',
		settings: 'Settings',
		pairNewDevice: 'Pair new device'
	},
	palette: {
		title: 'Command palette',
		inputLabel: 'Search pages, actions, quests and tasks',
		placeholder: 'Search or jump to…',
		results: 'Results',
		pages: 'Pages',
		actions: 'Actions',
		quests: 'Quests',
		tasks: 'Tasks',
		pauseTimer: 'Pause timer',
		resumeTimer: 'Resume timer',
		stopTimer: 'Stop timer',
		editProfile: 'Edit profile',
		searching: 'Searching…',
		noResults: 'No results',
		failed: 'Search failed — try again.',
		startFocus: (title: string) => `Start focus timer for ${title}`,
		keys: { move: 'move', open: 'open', focus: 'start focus', close: 'close' }
	},
	dialog: { close: 'Close dialog' },
	/** Phones: the bar above the tab bar while a timer is active. */
	miniPlayer: {
		label: 'Active timer',
		/** The bar's link to Focus: task, clock and state (lower case). */
		open: (title: string, display: string, state: string) =>
			`${title}, ${display}, ${state} — open focus`,
		pause: 'Pause timer',
		resume: 'Resume timer',
		startPhase: 'Start the next phase',
		skip: 'Skip break'
	},
	menu: { open: 'Open menu' },
	week: {
		nav: 'Week',
		previous: 'Previous week',
		next: 'Next week',
		thisWeek: 'This week',
		/** Phones: the day strip under the header of Plan and Calendar. */
		days: 'Days',
		dayAria: (date: string, today: boolean, mark: string | null) =>
			`${date}${today ? ' (today)' : ''}${mark ? `, ${mark}` : ''}`
	},
	tasks: {
		startFocus: 'Start focus timer for this task',
		timerLive: (display: string, state: string) => `Timer ${display}, ${state} — open focus`,
		resumeTimer: 'Resume timer',
		pauseTimer: 'Pause timer',
		timeBlock: 'Time-block…',
		movePrevDay: 'Move to previous day',
		moveNextDay: 'Move to next day',
		moveToDay: 'Move to day',
		moveToDate: (date: string) => `Move to ${date}`,
		moveToBacklog: 'Move to backlog',
		moveToTomorrow: 'Move to tomorrow',
		moveToToday: 'Move to today',
		filter: 'Filter tasks by quest',
		filterDialog: 'Quest filter',
		filterHint: 'Show tasks of',
		noOpenQuests: 'No open quests.',
		pickerCompact: (name: string) => `Quest: ${name} (change)`,
		chooseQuest: 'Choose quest',
		/** After a task's duration on its card: which number it is. */
		logged: 'logged',
		planned: 'planned',
		/** A duration with its kind, e.g. "45 min planned" (focus setup, quest detail). */
		plannedDuration: (duration: string) => `${duration} planned`,
		loggedDuration: (duration: string) => `${duration} logged`,
		addToBacklog: 'Add to backlog…',
		addTask: 'Add a task…',
		backlogEmpty: 'Nothing waiting in the backlog.'
	},
	home: {
		/** Greeting above the date (hour from the server's `TZ`); `name` = display name or null. */
		greeting: {
			morning: (name: string | null) => (name ? `Good morning, ${name}` : 'Good morning'),
			afternoon: (name: string | null) => (name ? `Good afternoon, ${name}` : 'Good afternoon'),
			evening: (name: string | null) => (name ? `Good evening, ${name}` : 'Good evening'),
			night: (name: string | null) => (name ? `Still up, ${name}?` : 'Still up?')
		},
		today: 'today',
		/** After today's hours when a daily goal is set: "2.2h / 4h today". */
		ofGoalToday: (goal: string) => `/ ${goal} today`,
		thisWeek: (hours: string) => `${hours} this week`,
		/** Phones: the "what now?" card above the lists while no timer runs. */
		nextUp: {
			label: 'Next up',
			start: 'Start focus',
			startAria: (title: string) => `Start focus: ${title}`,
			emptyTitle: 'Nothing planned for today',
			/** Today's list is done but overdue tasks are still open (not "All done"). */
			todayDoneTitle: 'Today’s list is done',
			overdueLeft: (n: number) =>
				n === 1 ? 'One overdue task is still open.' : `${n} overdue tasks are still open.`,
			emptyHint: 'Add a task below, or pick one from the backlog.',
			addTask: 'Add a task'
		},
		/** Replaces Next up once nothing is open today (`isAllDone`). */
		allDone: {
			title: 'All done',
			tasks: (n: number) => (n === 1 ? '1 task' : `${n} tasks`),
			logged: (duration: string) => `${duration} logged`,
			goalReached: 'daily goal reached',
			planTomorrow: 'Plan tomorrow'
		},
		blockFailed:
			'That time block could not be saved — start before end, and keep it within 00:00–24:00.',
		/** Quest work without any open quest: one sentence + one action. */
		firstQuest: {
			text: 'Quests are your bigger goals — a language, a side project. Create one to plan work for it here; everything else goes under Other.',
			action: 'Create your first quest'
		},
		scheduleToday: 'Schedule for today',
		dayTimeline: 'Day timeline',
		editBlockAria: (title: string, from: string, to: string) =>
			`Edit time block: ${title}, ${from} to ${to}`,
		block: {
			titleNew: 'Time-block',
			titleEdit: 'Edit time block',
			fallbackError: 'That time does not work.',
			duration: 'Duration (minutes)',
			invalidSpan: 'Must be a positive span ending by 24:00',
			add: 'Add block'
		}
	},
	plan: {
		title: 'Plan',
		todayMarker: '(today)',
		openBacklog: 'Open backlog tasks',
		collapseBacklog: 'Collapse backlog',
		expandBacklog: 'Expand backlog',
		/** Phones: under an empty day's list. */
		emptyDayHint: 'Add a task, or pull one from the backlog.',
		hasOpenTasks: 'open tasks',
		/** A week without any planned task: one sentence + one action. */
		emptyWeek: {
			title: 'Nothing planned',
			text: 'Add a task to a day — or pull one in from the backlog.',
			action: 'Add a task'
		}
	},
	/** Overdue tasks (planned before today, not done): Home's Overdue group, Plan, nav, palette. */
	overdue: {
		label: 'Overdue',
		/** Card head: "Overdue · 3". */
		heading: (n: number) => `Overdue · ${n}`,
		/** Age of a row: "yesterday" / "since Wed, Nov 18". */
		yesterday: 'yesterday',
		since: (day: string) => `since ${day}`,
		allToToday: 'All to today',
		showAll: (n: number) => `Show all ${n}`,
		showLess: 'Show less',
		todayAria: (title: string) => `Move to today: ${title}`,
		/** The nav's Home item while it shows the dot (screen readers): "Home, 3 overdue". */
		navLabel: (home: string, n: number) => `${home}, ${n} overdue`,
		/** Plan: marker on an open card of a past day. */
		marker: 'Overdue',
		/** Plan's day strip (phones): a past day that still has open tasks. */
		stripMark: 'overdue tasks',
		paletteAction: 'Move overdue tasks to today',
		paletteDetail: (n: number) => `${n} ${plural(n, 'task', 'tasks')}`
	},
	calendar: {
		title: 'Calendar',
		showPlan: 'Show plan',
		/** Phones: the day strip's dot. */
		hasLogged: 'time logged',
		questTotal: (hours: string) => `/ ${hours} quest`,
		budgetBar: 'Quest hours vs. weekly quest budget',
		grid: 'Week calendar',
		logTimeOn: (day: string) => `Log time on ${day}`,
		planned: (title: string) => `Planned: ${title}`,
		activeAria: (paused: boolean, title: string, since: string) =>
			`${paused ? 'Paused' : 'Running'}: ${title}, since ${since}`,
		paused: 'paused',
		now: 'now',
		editAria: (title: string, span: string) => `Edit ${title}, ${span}`,
		done: 'Done',
		/** A week without any logged time: one sentence + one action (Log time). */
		empty: {
			title: 'This week is empty',
			text: 'Time you focus or log shows up here.',
			action: 'Log time'
		},
		dialog: {
			titleEdit: 'Edit session',
			titleNew: 'Log time',
			startDate: 'Start date',
			startTime: 'Start time',
			endDate: 'End date',
			endTime: 'End time',
			submit: 'Log time'
		},
		picker: {
			loggedTask: 'Logged task',
			otherDays: 'Other days',
			search: 'Search tasks',
			searchPlaceholder: 'Search tasks…',
			noMatches: 'No matching tasks.'
		}
	},
	focus: {
		title: 'Focus',
		pomodoroSettings: 'Pomodoro settings',
		back: 'Back',
		activeTimer: 'Active timer',
		cycle: 'Pomodoro cycle',
		roundDot: (n: number, state: string) => `Round ${n}: ${state}`,
		dots: { done: 'done', current: 'current', todo: 'todo' },
		startFocus: 'Start focus',
		startBreak: 'Start break',
		skip: 'Skip',
		resume: 'Resume',
		pause: 'Pause',
		skipBreak: 'Skip break',
		complete: 'Complete',
		moreActions: 'More timer actions',
		stopKeepOpen: 'Stop (keep task open)',
		discard: 'Discard session',
		switchBefore: 'Start ',
		switchAfter: ' instead?',
		stopAndStart: 'Stop current and start',
		pickTitle: 'What are you working on?',
		timerMode: 'Timer mode',
		modeFocus: 'Focus',
		modePomodoro: 'Pomodoro',
		noTasks: 'No open tasks for today or in the backlog.',
		addOnHome: 'Add one on Home',
		/** The duration choice before a focus starts: 25 · 45 · 60 · 90 · Open · Other…. */
		duration: 'Duration',
		durationOpen: 'Open',
		durationOther: 'Other…',
		customMinutes: 'Minutes',
		durationHint: 'Counts down, then into overtime. “Open” is a stopwatch.',
		pomodoroSummary: (focus: number, short: number, long: number, every: number) =>
			`${focus} min focus · ${short} min break · ${long} min long break every ${every}`,
		change: 'Change',
		logAfterwards: 'Log time afterwards…',
		groups: {
			selected: 'Selected',
			today: 'Today',
			backlog: 'Backlog'
		},
		log: {
			title: 'Log time',
			loadFailed: 'Could not load sessions.',
			deleteFailed: 'Could not delete that session.',
			date: 'Date',
			minutes: 'Minutes',
			markDone: 'Mark task as done',
			sessions: 'Sessions on this day',
			loggedOnDay: 'Logged on this day',
			nothingLogged: 'Nothing logged yet.',
			deleteSession: (time: string) => `Delete session ${time}`,
			logged: (min: string) => `Logged ${min} min.`,
			submit: 'Log time'
		},
		settings: {
			focus: 'Focus',
			shortBreak: 'Short break',
			longBreak: 'Long break',
			longBreakEvery: 'Long break every',
			unitMin: 'min',
			unitRounds: 'rounds',
			autoStart: 'Start breaks and the next round automatically',
			hint: 'Changes apply from the next phase. After a long break the next round always waits for you.'
		},
		/** Short line under the state when a target is reached or a break starts (`name` or null). */
		cheer: {
			targetReached: (name: string | null, min: number) =>
				`Nice work${name ? `, ${name}` : ''} — ${min} ${plural(min, 'minute', 'minutes')} done.`,
			shortBreak: (name: string | null) => (name ? `Take a breath, ${name}.` : 'Take a breath.'),
			longBreak: (name: string | null) =>
				name ? `Long break — well earned, ${name}.` : 'Long break — well earned.'
		},
		switchDialog: {
			title: 'Switch timer?',
			isRunning: ' is running',
			anotherActive: 'Another timer is active.',
			promptBefore: 'Stop it — its time is kept — and start ',
			promptAfter: '?'
		}
	},
	timer: {
		/** Upper-case state line of the focus screen (`TimerView.label`). */
		states: {
			ready: 'READY',
			running: 'RUNNING',
			paused: 'PAUSED',
			overtime: 'OVERTIME',
			focus: 'FOCUS',
			breakTime: 'BREAK TIME',
			shortBreak: 'SHORT BREAK',
			longBreak: 'LONG BREAK'
		},
		round: (n: number, of: number) => `ROUND ${n}/${of}`,
		sources: { focus: 'Focus', pomodoro: 'Pomodoro', manual: 'Manual' }
	},
	quests: {
		title: 'Quests',
		subtitle: 'The few things that actually matter. Every hour you log is tagged to one of these.',
		newQuest: 'New quest',
		editQuest: 'Edit quest',
		summary: (n: number) => `logged this quarter across ${n} ${plural(n, 'quest', 'quests')}`,
		closedCount: (n: number) => `Closed (${n})`,
		/** The quest detail's back link (to the Quests page). */
		backToQuests: 'Quests',
		/** The quest detail's summary: this week's hours (and budget), this quarter's. */
		weekOfBudget: (budget: string) => `/ ${budget} this week`,
		thisWeek: 'this week',
		timeSummary: 'Time logged',
		perWeek: (hours: string) => `${hours} / week`,
		backlogEmpty: 'Nothing in the backlog yet — everything scheduled lives under “Scheduled”.',
		scheduled: 'Scheduled',
		scheduledEmpty: 'Nothing scheduled for this quest yet.',
		notFound: 'Quest not found',
		/** No quest at all: one sentence + one action. */
		empty: {
			title: 'No quest yet',
			text: 'A quest is a bigger goal, like a language or a project.',
			action: 'Create quest'
		},
		card: {
			deleteConfirm: (name: string) =>
				`Delete “${name}”? Its tasks and all logged time are deleted too.`,
			reopen: 'Reopen quest',
			close: 'Close quest',
			delete: 'Delete quest',
			thisQuarter: (hours: string) => `${hours} this quarter`
		},
		form: {
			name: 'Name',
			namePlaceholder: 'Launch my idea',
			/** The disclosure row with icon, description and weekly budget. */
			more: 'More options',
			/** After "More options" while it is folded. */
			moreHint: 'Icon, budget…',
			description: 'Description',
			descriptionPlaceholder: 'Description (optional)',
			icon: 'Icon',
			suggested: 'Suggested emoji',
			useIcon: (emoji: string) => `Use ${emoji} as icon`,
			budget: 'Weekly budget',
			budgetPlaceholder: 'None',
			/** After the budget's number (hours). */
			budgetUnit: 'h',
			/** Screen readers: the unit of the budget field. */
			budgetHours: 'hours',
			colour: 'Colour',
			colourGroup: 'Quest colour',
			create: 'Create quest'
		}
	},
	/** Quest colour keys (`QUEST_COLORS`) as shown in tooltips / labels. */
	colors: {
		red: 'red',
		orange: 'orange',
		amber: 'amber',
		lime: 'lime',
		green: 'green',
		teal: 'teal',
		blue: 'blue',
		purple: 'purple',
		pink: 'pink',
		olive: 'olive',
		slate: 'slate'
	},
	review: {
		title: 'Weekly review',
		keyFigures: 'Key figures',
		questHours: 'Quest hours',
		noBudget: 'No weekly budget set',
		dailyAverage: 'Daily average',
		notStarted: 'This week hasn’t started yet',
		loggedOver: (hours: string, days: number) =>
			`${hours} logged over ${days} ${plural(days, 'day', 'days')}`,
		questVsOther: 'Quest work vs Other',
		ofLogged: (hours: string) => `of ${hours} logged`,
		noTimeLogged: 'No time logged',
		points: (signed: string) => `${signed} pts`,
		vsLastWeek: 'vs last week',
		vsLastDays: (range: string) => `vs last ${range}`,
		perDay: 'Quest hours · per day',
		dayAria: (day: string, hm: string) => `${day}: ${hm} quest work`,
		dayAriaOther: (hm: string) => `, Other ${hm}`,
		noQuestWork: 'No quest work',
		thisQuarter: 'This quarter',
		questWork: 'quest work',
		quarterTarget: (hours: string, weeks: string) => ` / ${hours} target (${weeks})`,
		weeks: (n: string, count: number) => `${n} ${plural(count, 'week', 'weeks')}`,
		otherWork: 'Other',
		closed: 'Closed',
		weeklyHours: 'Weekly hours:',
		quarterVsTarget: (name: string) => `${name}: quarter hours vs. target`,
		hoursByQuest: 'Hours by quest',
		noQuests: 'No quests yet.',
		closedSr: '(closed)',
		split: (quest: string, pct: number | null, other: string) =>
			`Quest work ${quest} (${pct}%), Other ${other}`,
		noTimeThisWeek: 'No time logged this week',
		questWorkLegend: 'Quest work',
		/** A week without logged time: one sentence + (this week) one action. */
		empty: {
			title: 'Nothing logged yet',
			text: 'Once you finish a focus, your week shows up here.',
			action: 'Start focus',
			pastTitle: 'Nothing logged',
			pastText: 'No time was logged in this week.',
			futureText: 'Its review fills in as you log time.'
		},
		/** Phones: Week | Quarter (`?view=`), one summary card, a list of quests. */
		phone: {
			view: 'Show',
			week: 'Week',
			quarter: 'Quarter',
			/** Second line under the quest hours: "of 19h". */
			ofTarget: (hours: string) => `of ${hours}`,
			perDay: 'per day',
			perWeek: 'per week',
			perWeekChart: 'Quest hours · per week',
			weekAria: (monday: string, hm: string) => `Week of ${monday}: ${hm} quest work`,
			vsQuarter: (label: string) => `vs ${label}`,
			vsQuarterSoFar: (label: string) => `vs this point in ${label}`,
			quarterEmpty: {
				text: 'Once you finish a focus, your quarter shows up here.',
				pastText: 'No time was logged in this quarter.',
				futureTitle: 'This quarter hasn’t started yet'
			}
		},
		/** Personal headline under the title (vocative only). */
		yourWeek: (name: string | null) => (name ? `Your week, ${name}.` : 'Your week.'),
		/** One-sentence summary after `yourWeek` (`#lib/review.ts` → `weekSummary`). */
		summary: {
			future: 'It hasn’t started yet.',
			emptyCurrent: 'Nothing logged yet.',
			empty: 'Nothing logged.',
			logged: (total: string) => `${total} logged.`,
			more: (total: string, delta: string, partial: boolean) =>
				`${total} logged — ${delta} more than ${partial ? 'the same days last week' : 'last week'}.`,
			less: (total: string, delta: string, partial: boolean) =>
				`${total} logged — ${delta} less than ${partial ? 'the same days last week' : 'last week'}.`,
			same: (total: string, partial: boolean) =>
				`${total} logged — about the same as ${partial ? 'the same days last week' : 'last week'}.`
		}
	},
	settings: {
		title: 'Settings',
		profile: 'Profile',
		displayName: 'Name',
		displayNamePlaceholder: 'Your name',
		displayNameHint: `Optional, up to ${DISPLAY_NAME_MAX} characters. Leave it empty for no name.`,
		avatarColour: 'Avatar colour',
		avatarStyle: 'Avatar shows',
		avatarStyles: { initials: 'Initials', emoji: 'Emoji' },
		avatarEmoji: 'Avatar emoji',
		avatarEmojiHint: 'One emoji instead of your initials. Leave it empty to use your initials.',
		suggestedEmoji: 'Suggested emoji',
		useAvatarEmoji: (emoji: string) => `Use ${emoji} as avatar`,
		dailyGoal: 'Daily goal',
		dailyGoalDesc:
			'How much time you want to log each day. A ring at Home in the navigation fills up as you go.',
		goal: 'Goal',
		goalOff: 'No daily goal',
		goalHours: 'Hours',
		goalMinutes: 'Minutes',
		goalHint: `From ${duration(0, DAILY_GOAL_MIN)} to ${duration(DAILY_GOAL_MAX / 60, 0)}, in ${DAILY_GOAL_STEP}-minute steps.`,
		streak: 'Streak',
		/** `threshold`: "1 h" — the daily goal, or the fallback while none is set. */
		streakRuleGoal: (threshold: string) =>
			`A day counts toward your streak once you reach your daily goal (${threshold}).`,
		streakRuleFallback: (threshold: string) =>
			`A day counts toward your streak once you log at least ${threshold} — or your daily goal, once you set one.`,
		streakRuleHistory:
			'Past days are judged with the current goal, so changing it recounts your streak.',
		restDays: 'Rest days',
		restDaysHint: `Rest days never break a streak: without enough time they are skipped, with enough time they still count. Up to ${MAX_REST_DAYS} a week.`,
		devices: 'Devices',
		devicesDesc:
			'Every browser, home-screen app and desktop app that can open libe. Revoke one to sign it out everywhere at once.',
		deviceName: 'Device name',
		thisDevice: 'This device',
		paired: (date: string) => `Paired ${date}`,
		activeNow: 'Active now',
		lastSeen: (ago: string) => `Last seen ${ago}`,
		neverSeen: 'Never seen',
		signOut: 'Sign out',
		revokeMenu: 'Revoke…',
		revoke: 'Revoke',
		kinds: { browser: 'Browser', pwa: 'Home-screen app', tauri: 'Desktop app' },
		confirmSignOutTitle: 'Sign out this device?',
		confirmRevokeTitle: 'Revoke device?',
		confirmSignOut:
			' will be signed out. To use libe here again you’ll need a pairing code from another device (or the server password).',
		confirmRevoke: ' will be signed out immediately and can’t open libe until it is paired again.',
		notifications: {
			title: 'Notifications',
			desc: 'A short note on this device when a timer phase ends, and today’s open tasks on the app icon.',
			sendTest: 'Send test',
			sent: 'Sent',
			install:
				'Add libe to your Home Screen to get notifications: tap Share, then “Add to Home Screen”.',
			unsupported: 'This browser can’t receive notifications from libe.',
			deniedApple: 'Notifications are blocked. Allow them in Settings → Notifications → libe.',
			deniedBrowser:
				'Notifications are blocked. Allow them for this site in your browser’s settings.',
			failed: 'Couldn’t turn on notifications. Try again.',
			testFailed: 'The test notification couldn’t be sent.'
		},
		language: 'Language',
		languageDesc:
			'For libe on all your devices. “System default” follows each browser’s language settings.',
		/** R3: per-device light/dark choice (the `libe_theme` cookie). */
		appearance: 'Appearance',
		appearanceDesc: 'For this device only. “Automatic” follows your system’s light or dark look.',
		/** AB1: the grouped list (phones) and the sidebar (wider screens). */
		sections: {
			profile: 'Profile',
			goal: 'Daily goal and streak',
			focus: 'Focus',
			notifications: 'Notifications',
			appearance: 'Appearance',
			language: 'Language',
			devices: 'Devices',
			desktop: 'Desktop app'
		},
		sectionsLabel: 'Settings sections',
		profileRowHint: 'Name, avatar',
		yourDay: 'Your day',
		goalCustomRow: 'Custom duration…',
		/** Daily goal row's value while there is no goal. */
		goalOffValue: 'Off',
		restNone: 'None',
		restDaysCount: (n: number) => `${n} days`,
		focusGroup: 'Focus',
		pomodoro: 'Pomodoro',
		/** Pomodoro row's value: focus · short break · long break. */
		pomodoroValue: (focus: number, short: number, long: number) =>
			`${focus} · ${short} · ${long} min`,
		autoStartRow: 'Auto-start',
		autoStartDesc: 'Breaks and the next round start by themselves.',
		pairRow: 'Pair a device',
		deviceKind: 'Type',
		devicePaired: 'Paired',
		deviceLastSeen: 'Last seen',
		/** Autosave status (no Save buttons in Settings). */
		saving: 'Saving…',
		saved: 'Saved',
		languageOptions: { auto: 'System default', en: 'English', de: 'Deutsch' },
		appearanceOptions: { auto: 'Automatic', light: 'Light', dark: 'Dark' },
		pair: {
			title: 'Pair a new device',
			isPaired: ' is paired.',
			pairAnother: 'Pair another',
			introBefore: 'On the new device open ',
			introAfter:
				' (in the browser, the home-screen app or the desktop app) and enter this code — or scan the QR code with its camera.',
			codeAria: (digits: string) => `Pairing code ${digits}`,
			validFor: (countdown: string) => `Valid for ${countdown}`,
			generatingAria: 'Generating code',
			generating: 'Generating…',
			expired: 'Code expired.',
			noCode: 'No code.',
			qrAria: 'QR code that opens the pairing page with this code',
			opens: 'Opens',
			newCode: 'New code',
			createFailed: 'Could not create a code. Check the connection and try again.',
			locked: 'Too many wrong attempts — this code is no longer valid.',
			newDevice: 'The new device'
		}
	},
	/** Web Push notifications (title = state, body = the task's title). Keep them short. */
	push: {
		countdownDone: 'Time’s up',
		breakStarted: (min: number) => `Break time · ${min} min`,
		longBreakStarted: (min: number) => `Long break · ${min} min`,
		breakWaiting: 'Round done — start your break',
		focusStarted: 'Break over — back to focus',
		focusWaiting: 'Break over — start the next round',
		testTitle: 'Notifications are on',
		testBody: 'This is how libe tells you a timer phase has ended.'
	},
	desktop: {
		title: 'Desktop app',
		desc: '· updates download in the background and install when you restart the app.',
		check: 'Check for updates',
		track: 'Update track',
		trackDesc:
			'Stable gets tested releases, Nightly the newest build of libe. Switching installs the newest build of that track, even when it is older than this one.',
		tracks: { stable: 'Stable', nightly: 'Nightly' },
		checked: (ago: string) => `Checked ${ago}.`,
		downloadProgress: 'Download progress',
		installRestart: 'Install and restart',
		restartToUpdate: 'Restart to update',
		serverRuns: (version: string, track: string) => `Your server runs libe ${version} (${track}).`,
		otherTrackBefore: 'It updates separately, with its Docker image: use the ',
		otherTrackAfter: (track: string) => ` tag to put it on ${track} too.`,
		sameTrackBefore: 'It updates separately, with its Docker image (',
		sameTrackAfter: ').',
		devServer: (version: string) => `Your server runs a development build of libe (${version}).`,
		unpairTitle: 'Change server / Unpair',
		unpairDesc:
			'Signs this app out and forgets the server. It then shows its pairing screen, where you can pair it again — with this server or another one.',
		unpair: 'Change server / Unpair…',
		unpairConfirm: 'Sign this app out now?',
		unpairConfirmButton: 'Unpair',
		unpairing: 'Unpairing…',
		unpairUnsupported:
			'This version of the app can’t do that from here. Use its menu (libe → Change server / Unpair…) or update the app first.',
		unpairFailed: (detail: string) => `Unpairing failed: ${detail}`,
		/** Builds of the Nix flake (`managedBy: 'nix'`): no self-updates, no tracks. */
		nix: {
			desc: '· installed with Nix.',
			title: 'Updates come with Nix',
			body: 'This app was installed with Nix, so it doesn’t update itself. It changes when you update its flake input and rebuild.',
			update: 'Update',
			rebuild: 'then rebuild (or let system.autoUpgrade do it)',
			track: 'Track',
			or: 'or',
			trackNote: '— the branch of the libe input'
		},
		phases: {
			idle: 'Not checked yet.',
			checking: 'Checking for updates…',
			upToDate: 'Up to date.',
			downloading: (version: string, pct: number | null) =>
				`Downloading libe ${version}…${pct === null ? '' : ` ${pct} %`}`,
			readyPassword: (version: string) =>
				`libe ${version} is ready to install (asks for your password).`,
			ready: (version: string) =>
				`libe ${version} is ready. It installs when you restart or quit the app.`,
			installing: (version: string) => `Installing libe ${version}…`
		},
		/** `Phase.failed.code` / `Phase.unavailable.code` and command errors of the app. */
		codes: {
			devBuild: 'Development builds don’t update themselves.',
			unsupportedInstall:
				'There are no automatic updates for this kind of install. Download new versions from the GitHub releases.',
			nixManaged:
				'This app was installed with Nix and doesn’t update itself. Update the flake input (nix flake update libe) and rebuild.',
			managedByNix: 'Updates of this app are managed by Nix.',
			noRelease: (track: string) => `No ${track} release is published yet.`,
			checkFailed: (detail: string) => `Couldn’t check for updates: ${detail}`,
			downloadFailed: (version: string, detail: string) =>
				`Downloading libe ${version} failed: ${detail}`,
			installFailed: (detail: string) => `Installing the update failed: ${detail}`,
			saveTrackFailed: (detail: string) => `Could not save the update track: ${detail}`,
			installing: 'An update is being installed.',
			nothingDownloaded: 'No update has been downloaded yet.'
		}
	},
	auth: {
		alreadyPairedBefore: 'This device is already paired as ',
		alreadyPairedAfter: '.',
		continue: 'Continue to libe →',
		deviceName: 'Device name',
		pairing: 'Pairing…',
		tooManyAttempts: (seconds: number) => `Too many attempts. Try again in ${seconds} s.`,
		/** Under the logo on /setup and /pair: what libe is, for someone who has never seen it. */
		intro: 'libe is a personal planner: set goals, plan your days and track the time you focus.',
		setup: {
			pageTitle: 'Set up libe',
			title: 'Set up libe',
			titleRecovery: 'Pair with the server password',
			subtitle:
				'Pair your first device. You need the server password — it was chosen when this libe server was installed.',
			subtitleRecovery: 'Recovery: pair this device with the server password.',
			notSet: 'LIBE_SETUP_SECRET is not set.',
			/** Trusted static markup (`{@html}`). */
			notSetHelpHtml:
				'Set it in the server environment (<code>.env</code> for development, the <code>environment</code> of the <code>app</code> service in <code>compose.yaml</code>) to a long random value, e.g. <code>openssl rand -base64 24</code>, restart the server and reload this page.',
			secret: 'Server password',
			secretHintHtml: 'For the admin: the value of <code>LIBE_SETUP_SECRET</code> on the server.',
			submit: 'Pair this device',
			yourName: 'Your name',
			yourNameHint: 'Optional — shown in libe. You can change it later in Settings.',
			haveDevice: 'Have a paired device nearby?',
			withCode: 'Pair with a code instead'
		},
		pair: {
			pageTitle: 'Pair this device · libe',
			title: 'Pair this device',
			subtitle:
				'Connect this device to an existing libe. It shares everything with the devices already paired — libe is for one person, so pair only your own devices.',
			code: 'Pairing code',
			codeHintHtml:
				'Get a code on a device that already uses this libe: Settings → <strong>Pair new device</strong>. Codes are valid for 10 minutes.',
			submit: 'Pair device',
			standalone:
				'The home-screen app keeps its own sign-in, separate from Safari — pair it here once.',
			nothingPaired: 'Nothing is paired yet.',
			setUpFirst: 'Set up the first device',
			withSecret: 'with the server password.',
			lostAll: 'Lost all your devices?',
			useSecret: 'Use the server password'
		},
		session: {
			pageTitle: 'Signing in · libe',
			signingIn: 'Signing in…',
			failed: 'Could not sign in',
			noToken: 'No device token was provided.',
			signedOut: 'This device was signed out. Pair it again.',
			startFailed: (status: number) => `Could not start the session (${status}).`,
			unreachable: 'Could not reach the server.',
			pairAgain: 'Pair this device'
		}
	},
	/** First-run flow (`/welcome`) after the first pairing. */
	onboarding: {
		pageTitle: 'Welcome · libe',
		back: 'Back',
		/** Page dots (screen readers). */
		progress: (step: number, total: number) => `Step ${step} of ${total}`,
		skipSetup: 'Skip setup',
		continue: 'Continue',
		intro: {
			title: 'Welcome to libe',
			questsTitle: 'Quests',
			questsText: 'Plan what matters to you in small steps.',
			focusTitle: 'Focus',
			focusText: 'Start a timer and libe logs the time for you.',
			reviewTitle: 'Review',
			reviewText: 'See at the end of the week where your time went.',
			start: 'Get started'
		},
		goal: {
			title: 'How much time a day?',
			lead: 'Your daily goal. You can change it any time in Settings.',
			label: 'Daily goal',
			none: 'No daily goal',
			later: 'Set later'
		},
		quest: {
			title: 'What do you want to work on?',
			lead: 'A quest is a bigger goal: a language, a project, running.',
			section: 'Quest',
			name: 'Quest name',
			namePlaceholder: 'Learn Spanish',
			color: 'Colour',
			stepSection: 'First step',
			stepTitle: 'First step',
			stepPlaceholder: 'Work through lesson 1',
			duration: 'Duration',
			stepFooter: 'It goes on today’s list.',
			skip: 'Skip'
		},
		focus: {
			title: 'Ready for your first focus?',
			lead: 'A timer runs, you work, libe logs the time. You can pause any time.',
			start: 'Start focus',
			later: 'Later — go to Home',
			noTaskTitle: 'You’re all set',
			noTaskLead: 'Add a first step on Home whenever you like, then start a focus from there.',
			home: 'Go to Home'
		}
	},
	/** One-time notice on the first page after pairing a device. */
	welcome: {
		paired: (name: string | null) =>
			name
				? `Welcome, ${name} — this device is now paired.`
				: 'Welcome — this device is now paired.',
		dismiss: 'Dismiss'
	},
	offline: {
		pageTitle: 'Offline · libe',
		title: 'You’re offline',
		subtitle:
			'libe needs a connection to your server. Your plans and timers live there, so nothing is lost — reconnect and carry on.',
		retry: 'Try again'
	},
	/** Default device names from the user agent (`deviceNameFromUA`). */
	deviceNames: DEVICE_MODEL_NAMES,
	/** `formatAgo` */
	ago: {
		justNow: 'just now',
		minutes: (n: number) => `${n} min ago`,
		hours: (n: number) => `${n} h ago`,
		yesterday: 'yesterday',
		days: (n: number) => `${n} days ago`
	},
	/** Validation and API errors (`ErrorCode`). */
	errors: {
		// quests
		questNameRequired: 'Give the quest a name.',
		questNameTooLong: `Keep the name to at most ${QUEST_NAME_MAX} characters.`,
		questDescriptionTooLong: `Keep the description to at most ${QUEST_DESC_MAX} characters.`,
		questIconInvalid: 'Use exactly one emoji.',
		questColorInvalid: 'Pick one of the colours.',
		questBudgetInvalid: `Budget must be more than 0 and at most ${QUEST_BUDGET_MAX_H} hours.`,
		questUnknown: 'Unknown quest.',
		questGone: 'That quest no longer exists.',
		pickQuest: 'Pick a quest — or create your first one on the Quests page.',
		questNotFound: 'Quest not found.',
		// tasks
		taskTitleRequired: 'Write what needs to be done.',
		taskTitleTooLong: `Keep the title to at most ${TASK_TITLE_MAX} characters.`,
		taskDurationInvalid: `Duration must be a whole number of minutes between 1 and ${TASK_DURATION_MAX_MIN}.`,
		unknownDay: 'Unknown day.',
		taskGone: 'Task no longer exists.',
		taskNotFound: 'Task not found.',
		pickTask: 'Pick a task.',
		// time blocks
		blockStartInvalid: 'Pick a start time between 00:00 and 23:59.',
		blockDurationInvalid: 'Duration must be a positive whole number of minutes.',
		blockPastMidnight: 'The block must end by midnight (24:00).',
		blockGone: 'This block no longer exists.',
		// logged time
		logInFuture: 'That time is in the future.',
		logTooOld: `Logs can reach back at most ${MANUAL_LOG_MAX_AGE_DAYS} days.`,
		logOverlapsTimer: 'This overlaps the running timer — stop it first or pick another time.',
		pickDate: 'Pick a date.',
		pickStartDate: 'Pick a start date.',
		pickStartTime: 'Pick a start time.',
		pickEnd: 'Pick an end date and time.',
		logDurationInvalid: `Duration must be a whole number from 1 to ${MAX_TIMER_MIN} minutes.`,
		endBeforeStart: 'End must be after the start.',
		sessionTooLong: 'A session can be at most 24 hours long.',
		sessionNotFound: 'Session not found.',
		// timer
		timerNotRunning: 'The timer is not running.',
		timerNotPaused: 'The timer is not paused.',
		phaseRunning: 'This phase is already running.',
		noBreakToSkip: 'There is no break to skip.',
		plannedMinInvalid: `Planned minutes must be a whole number from 1 to ${MAX_TIMER_MIN}.`,
		unknownMode: 'Unknown mode.',
		unknownTimerAction: 'Unknown timer action.',
		timerConflict: 'Another timer is already active.',
		nothingToPause: 'Nothing to pause.',
		nothingToResume: 'Nothing to resume.',
		noActiveTimer: 'No active timer.',
		noPomodoro: 'No pomodoro is running.',
		pomodoroFocusMin: `Focus length: a whole number from ${lim.focusMin[0]} to ${lim.focusMin[1]}.`,
		pomodoroShortBreakMin: `Short break: a whole number from ${lim.shortBreakMin[0]} to ${lim.shortBreakMin[1]}.`,
		pomodoroLongBreakMin: `Long break: a whole number from ${lim.longBreakMin[0]} to ${lim.longBreakMin[1]}.`,
		pomodoroLongBreakEvery: `Long break every: a whole number from ${lim.longBreakEvery[0]} to ${lim.longBreakEvery[1]}.`,
		// requests
		invalidBody: 'Invalid request body.',
		invalidJson: 'Invalid JSON.',
		expectedJson: 'Expected a JSON body.',
		invalidId: 'Invalid id.',
		taskAndDayRequired: 'taskId and day are required.',
		// devices & pairing
		notPaired: 'This device is not paired.',
		unknownDevice: 'Unknown device.',
		unknownCode: 'Unknown code.',
		deviceNameRequired: 'Give this device a name.',
		deviceNameTooLong: `Keep the name under ${DEVICE_NAME_MAX} characters.`,
		setupDisabled: 'Setup is disabled: LIBE_SETUP_SECRET is not set.',
		wrongSetupSecret: 'Wrong server password.',
		pairCodeFormat: 'Enter the 6-digit code shown on your other device.',
		pairCodeExpired: 'This code has expired. Generate a new one on your other device.',
		pairCodeUsed: 'This code was already used. Generate a new one on your other device.',
		pairCodeLocked:
			'Too many wrong attempts for this code. Generate a new one on your other device.',
		pairCodeWrong: 'Wrong code. Check the code on your other device and try again.',
		// settings
		languageInvalid: 'Pick one of the languages.',
		themeInvalid: 'Pick one of the appearances.',
		profileNameTooLong: `Keep the name to at most ${DISPLAY_NAME_MAX} characters.`,
		profileColorInvalid: 'Pick one of the colours.',
		profileEmojiInvalid: 'Use exactly one emoji.',
		dailyGoalInvalid: `Pick a goal from ${duration(0, DAILY_GOAL_MIN)} to ${duration(DAILY_GOAL_MAX / 60, 0)}, in ${DAILY_GOAL_STEP}-minute steps.`,
		streakRestDayInvalid: 'Pick rest days from Monday to Sunday.',
		streakRestDaysTooMany: `Pick at most ${MAX_REST_DAYS} rest days — at least one day a week has to count.`,
		// notifications
		pushEndpointInvalid: 'This push service is not supported.',
		pushKeysInvalid: 'Invalid push subscription keys.',
		pushNotSubscribed: 'Notifications are not turned on for this device.',
		pushSendFailed: 'The push service did not accept the notification.'
	},
	/** Daily goal (the ring at Home in the nav, Home, Settings). */
	goal: {
		duration,
		/** Accessible progress of the ring at Home: "2 h 10 min of 4 h today". */
		progress: (logged: string, goal: string) => `${logged} of ${goal} today`,
		/** … once the goal is reached: "4 h 5 min of 4 h today, daily goal reached". */
		progressDone: (logged: string, goal: string) => `${logged} of ${goal} today, daily goal reached`
	},
	/** Streaks (Home, account menu, Review, Settings). Durations come from `goal.duration`. */
	streak: {
		/** "12 days in a row" (chip, account menu). */
		count: (n: number) => `${n} ${plural(n, 'day', 'days')} in a row`,
		/** Visually hidden after the chip when today already counts. */
		todayDone: 'today counts',
		/** Hint under the chip while today hasn't counted yet (`remaining`: "20 min"). */
		pending: (remaining: string) => `Log ${remaining} more today to keep it`,
		startHint: (remaining: string) => `Log ${remaining} today to start one`,
		rest: 'Rest day — your streak is safe',
		/** Shown on Home on the day a milestone is reached; name in the vocative only. */
		milestone: (n: number, name: string | null) =>
			`${n} days in a row — nice${name ? `, ${name}` : ''}!`,
		none: 'No streak yet',
		/** Account menu: "Longest: 20 days". */
		longestShort: (n: number) => `Longest: ${n} ${plural(n, 'day', 'days')}`,
		/** Review: "Longest streak: 20 days". */
		longest: (n: number) => `Longest streak: ${n} ${plural(n, 'day', 'days')}`,
		/** Review per-day markers (text alternative, appended to the day). */
		marks: {
			done: 'streak day',
			rest: 'rest day',
			missed: 'missed',
			today: 'not counted yet',
			future: 'upcoming'
		}
	},
	/** Home as one list (O3a): the "Today" list, the Overdue group, Backlog / Daily plan rows. */
	homeList: {
		/** After "Today": "3 open". */
		open: (n: number) => `${n} open`,
		/** Overdue group: the row that unfolds the rest in place. */
		showMore: (n: number) => `Show ${n} more`,
		/** Backlog row (opens the sheet): "Backlog, 7 tasks". */
		backlogRow: (n: number) => `Backlog, ${n} ${plural(n, 'task', 'tasks')}`,
		dailyPlan: 'Daily plan',
		/** Desktop: the compact timeline's toggle. */
		wholeDay: 'Whole day',
		nextHours: 'Next hours',
		/** The Daily plan row's summary (phones). */
		planEmpty: 'Nothing planned',
		planNow: (title: string) => `Now: ${title}`,
		planNext: (time: string, title: string) => `${time} ${title}`,
		planPast: (n: number) => `${n} ${plural(n, 'block', 'blocks')} earlier today`,
		/** Under an empty timeline: where blocks come from. */
		planHint: 'Time-block a task from its ⋯ menu.'
	}
};

export type Messages = typeof en;
