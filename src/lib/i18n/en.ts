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

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
const lim = POMODORO_LIMITS;

/** `2 h 10 min`, `45 min`, `4 h` — durations in sentences (avatar progress, goal choices). */
const duration = (h: number, m: number) =>
	h === 0 ? `${m} min` : m === 0 ? `${h} h` : `${h} h ${m} min`;

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
		minutes: (n: number | string) => `${n} min`,
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
		brandHome: 'libe home',
		timerChip: (display: string, state: string, title: string) =>
			`Timer ${display} (${state}): ${title} — open focus`,
		search: 'Search or jump…',
		account: 'Account and devices',
		accountOf: (name: string) => `Account and devices (${name})`,
		/** Avatar button with a daily goal: `account` label + `goal.progress`. */
		withProgress: (account: string, progress: string) => `${account}, ${progress}`,
		signedInAs: 'Signed in as',
		thisDevice: 'This device',
		thisDeviceIs: (device: string) => `This device: ${device}`,
		editProfile: 'Edit profile',
		settings: 'Settings',
		pairNewDevice: 'Pair new device',
		signOut: 'Sign out this device'
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
	menu: { open: 'Open menu' },
	week: {
		nav: 'Week',
		previous: 'Previous week',
		next: 'Next week',
		thisWeek: 'This week'
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
		filter: 'Filter quest work by quest',
		filterDialog: 'Quest filter',
		filterHint: 'Show tasks of',
		noOpenQuests: 'No open quests.',
		pickerCompact: (name: string) => `Quest: ${name} (change)`,
		chooseQuest: 'Choose quest',
		addBottom: 'Add at the bottom',
		addTop: 'Add at the top',
		bottom: 'Bottom',
		top: 'Top',
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
		budgetBar: "Share of this week's quest budget used",
		blockFailed:
			'That time block could not be saved — start before end, and keep it within 00:00–24:00.',
		questWork: 'Quest work',
		addQuestWork: 'Add quest work…',
		timeline: 'Timeline',
		openTasks: (n: number) => `${n} open ${plural(n, 'task', 'tasks')}`,
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
		title: 'Plan the week',
		addOther: 'Add an other task…',
		todayMarker: '(today)',
		openBacklog: 'Open backlog tasks',
		collapseBacklog: 'Collapse backlog',
		expandBacklog: 'Expand backlog'
	},
	calendar: {
		title: 'Calendar',
		showPlan: 'Show plan',
		hidePlan: 'Hide plan',
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
		pickTitle: 'What are you focusing on?',
		timerMode: 'Timer mode',
		modeFocus: 'Focus',
		modePomodoro: 'Pomodoro',
		noTasks: 'No open tasks for today or in the backlog.',
		addOnHome: 'Add one on Home',
		plannedMinutes: 'Planned minutes',
		openEnded: 'Open-ended',
		plannedHint: 'Counts down, then into overtime. Empty = stopwatch.',
		pomodoroSummary: (focus: number, short: number, long: number, every: number) =>
			`${focus} min focus · ${short} min break · ${long} min long break every ${every}`,
		change: 'Change',
		start: 'Start',
		logAfterwards: 'Log time afterwards…',
		groups: {
			selected: 'Selected',
			todayQuest: 'Today · Quest work',
			todayOther: 'Today · Other',
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
		allQuests: 'All quests',
		perWeek: (hours: string) => `${hours} / week`,
		backlogEmpty: 'Nothing in the backlog yet — everything scheduled lives under “Scheduled”.',
		scheduled: 'Scheduled',
		scheduledEmpty: 'Nothing scheduled for this quest yet.',
		notFound: 'Quest not found',
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
			description: 'Description',
			descriptionPlaceholder: 'The few things that actually matter…',
			icon: 'Icon',
			suggested: 'Suggested emoji',
			useIcon: (emoji: string) => `Use ${emoji} as icon`,
			budget: 'Weekly budget · h',
			budgetPlaceholder: 'none',
			colour: 'Colour',
			colourGroup: 'Quest colour',
			changeLater: 'You can change everything later.',
			create: 'Create quest',
			saveChanges: 'Save changes'
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
		questVsOther: 'Quest work vs other',
		ofLogged: (hours: string) => `of ${hours} logged`,
		noTimeLogged: 'No time logged',
		points: (signed: string) => `${signed} pts`,
		vsLastWeek: 'vs last week',
		vsLastDays: (range: string) => `vs last ${range}`,
		perDay: 'Quest hours · per day',
		dayAria: (day: string, hm: string) => `${day}: ${hm} quest work`,
		dayAriaOther: (hm: string) => `, other ${hm}`,
		noQuestWork: 'No quest work',
		thisQuarter: 'This quarter',
		questWork: 'quest work',
		quarterTarget: (hours: string, weeks: string) => ` / ${hours} target (${weeks})`,
		weeks: (n: string, count: number) => `${n} ${plural(count, 'week', 'weeks')}`,
		otherWork: 'other work',
		closed: 'Closed',
		weeklyHours: 'Weekly hours:',
		quarterVsTarget: (name: string) => `${name}: quarter hours vs. target`,
		hoursByQuest: 'Hours by quest',
		noQuests: 'No quests yet.',
		closedSr: '(closed)',
		split: (quest: string, pct: number | null, other: string) =>
			`Quest work ${quest} (${pct}%), other ${other}`,
		noTimeThisWeek: 'No time logged this week',
		questWorkLegend: 'Quest work',
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
		subtitle: 'Profile, daily goal, streak, paired devices, focus timer and language.',
		profile: 'Profile',
		profileDesc: 'Your name and avatar — the same on all your devices.',
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
			'How much time you want to log each day. A ring around your avatar fills up as you go.',
		goal: 'Goal',
		goalOff: 'No daily goal',
		goalCustom: 'Custom…',
		goalHours: 'Hours',
		goalMinutes: 'Minutes',
		goalHint: `From ${duration(0, DAILY_GOAL_MIN)} to ${duration(DAILY_GOAL_MAX / 60, 0)}, in ${DAILY_GOAL_STEP}-minute steps.`,
		saveGoal: 'Save goal',
		goalSaved: 'Daily goal saved.',
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
		restDayToggle: (weekday: string) => `${weekday} is a rest day`,
		saveRestDays: 'Save rest days',
		restDaysSaved: 'Rest days saved.',
		saveProfile: 'Save profile',
		profileSaved: 'Profile saved.',
		devices: 'Devices',
		devicesDesc:
			'Every browser, home-screen app and desktop app that can open libe. Revoke one to sign it out everywhere at once.',
		pairNew: 'Pair new device',
		deviceName: 'Device name',
		thisDevice: 'This device',
		paired: (date: string) => `Paired ${date}`,
		activeNow: 'Active now',
		lastSeen: (ago: string) => `Last seen ${ago}`,
		neverSeen: 'Never seen',
		rename: 'Rename…',
		signOut: 'Sign out',
		revokeMenu: 'Revoke…',
		revoke: 'Revoke',
		signOutDevice: 'Sign out this device',
		kinds: { browser: 'Browser', pwa: 'Home-screen app', tauri: 'Desktop app' },
		focusTimer: 'Focus timer',
		pomodoroSummary: (focus: number, short: number, long: number, every: number) =>
			`Pomodoro: ${focus} min focus · ${short} min break · ${long} min long break every ${every} rounds`,
		autoStart: ' · auto-start',
		pomodoroSettings: 'Pomodoro settings',
		confirmSignOutTitle: 'Sign out this device?',
		confirmRevokeTitle: 'Revoke device?',
		confirmSignOut:
			' will be signed out. To use libe here again you’ll need a pairing code from another device (or the setup secret).',
		confirmRevoke: ' will be signed out immediately and can’t open libe until it is paired again.',
		language: 'Language',
		languageDesc:
			'For libe on all your devices. “System default” follows each browser’s language settings.',
		languageOptions: { auto: 'System default', en: 'English', de: 'Deutsch' },
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
		setup: {
			pageTitle: 'Set up libe',
			title: 'Set up libe',
			titleRecovery: 'Pair with the setup secret',
			subtitle: 'Pair your first device with the setup secret from the server configuration.',
			subtitleRecovery: 'Recovery: pair this device with the server’s setup secret.',
			notSet: 'LIBE_SETUP_SECRET is not set.',
			/** Trusted static markup (`{@html}`). */
			notSetHelpHtml:
				'Set it in the server environment (<code>.env</code> for development, the <code>environment</code> of the <code>app</code> service in <code>compose.yaml</code>) to a long random value, e.g. <code>openssl rand -base64 24</code>, restart the server and reload this page.',
			secret: 'Setup secret',
			secretHintHtml: 'The value of <code>LIBE_SETUP_SECRET</code> on the server.',
			submit: 'Pair this device',
			yourName: 'Your name',
			yourNameHint: 'Optional — shown in libe. You can change it later in Settings.',
			haveDevice: 'Have a paired device nearby?',
			withCode: 'Pair with a code instead'
		},
		pair: {
			pageTitle: 'Pair this device · libe',
			title: 'Pair this device',
			subtitle: 'Enter the code shown on a device that is already paired.',
			code: 'Pairing code',
			codeHintHtml:
				'On a paired device: avatar menu → <strong>Pair new device</strong>. Codes are valid for 10 minutes.',
			submit: 'Pair device',
			standalone:
				'The home-screen app keeps its own sign-in, separate from Safari — pair it here once.',
			nothingPaired: 'Nothing is paired yet.',
			setUpFirst: 'Set up the first device',
			withSecret: 'with the setup secret.',
			lostAll: 'Lost all your devices?',
			useSecret: 'Use the setup secret'
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
		pickQuest: 'Pick a quest.',
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
		wrongSetupSecret: 'Wrong setup secret.',
		pairCodeFormat: 'Enter the 6-digit code shown on your other device.',
		pairCodeExpired: 'This code has expired. Generate a new one on your other device.',
		pairCodeUsed: 'This code was already used. Generate a new one on your other device.',
		pairCodeLocked:
			'Too many wrong attempts for this code. Generate a new one on your other device.',
		pairCodeWrong: 'Wrong code. Check the code on your other device and try again.',
		// settings
		languageInvalid: 'Pick one of the languages.',
		profileNameTooLong: `Keep the name to at most ${DISPLAY_NAME_MAX} characters.`,
		profileColorInvalid: 'Pick one of the colours.',
		profileEmojiInvalid: 'Use exactly one emoji.',
		dailyGoalInvalid: `Pick a goal from ${duration(0, DAILY_GOAL_MIN)} to ${duration(DAILY_GOAL_MAX / 60, 0)}, in ${DAILY_GOAL_STEP}-minute steps.`,
		streakRestDayInvalid: 'Pick rest days from Monday to Sunday.',
		streakRestDaysTooMany: `Pick at most ${MAX_REST_DAYS} rest days — at least one day a week has to count.`
	},
	/** Daily goal (avatar ring, Home, Settings). */
	goal: {
		duration,
		/** Accessible progress of the avatar ring: "2 h 10 min of 4 h today". */
		progress: (logged: string, goal: string) => `${logged} of ${goal} today`
	},
	/** Streaks (Home, account menu, Review, Settings). Durations come from `goal.duration`. */
	streak: {
		/** "12-day streak" (chip, account menu). */
		count: (n: number) => `${n}-day streak`,
		/** Visually hidden after the chip when today already counts. */
		todayDone: 'today counts',
		/** Hint under the chip while today hasn't counted yet (`remaining`: "20 min"). */
		pending: (remaining: string) => `Log ${remaining} more today to keep it`,
		startHint: (remaining: string) => `Log ${remaining} today to start one`,
		rest: 'Rest day — your streak is safe',
		/** Shown on Home on the day a milestone is reached; name in the vocative only. */
		milestone: (n: number, name: string | null) =>
			`${n}-day streak — nice${name ? `, ${name}` : ''}!`,
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
	}
};

export type Messages = typeof en;
