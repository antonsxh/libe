/**
 * Deutsche UI-Texte — gleiche Schlüssel wie `en.ts` (Typ `Messages`; fehlende oder
 * zusätzliche Schlüssel brechen `bun run check`). Informelles „du“, typografische
 * Anführungszeichen „…“, Gedankenstrich –, Auslassungspunkte nach geschütztem Leerzeichen (U+00A0, „Speichern …“ – bricht nicht um),
 * schmales geschütztes Leerzeichen vor Einheiten (` `).
 */
import { DEVICE_NAME_MAX } from '#lib/auth.ts';
import { MANUAL_LOG_MAX_AGE_DAYS } from '#lib/manual-log.ts';
import { DISPLAY_NAME_MAX } from '#lib/profile.ts';
import { DAILY_GOAL_MAX, DAILY_GOAL_MIN, DAILY_GOAL_STEP } from '#lib/daily-goal.ts';
import { MAX_REST_DAYS } from '#lib/streak.ts';
import { QUEST_BUDGET_MAX_H, QUEST_DESC_MAX, QUEST_NAME_MAX } from '#lib/quest-form.ts';
import { TASK_DURATION_MAX_MIN, TASK_TITLE_MAX } from '#lib/task-form.ts';
import { MAX_TIMER_MIN, POMODORO_LIMITS } from '#lib/timer.ts';
import { formatDurationMin } from '#lib/duration.ts';
import type { Messages } from './en.ts';

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
const lim = POMODORO_LIMITS;
/** Schmales geschütztes Leerzeichen (zwischen Zahl und Einheit). */
const nb = ' ';
/** `2 h 10 min`, `45 min`, `4 h` (Dauer im Satz: Avatar-Fortschritt, Zielauswahl). */
const duration = (h: number, m: number) => formatDurationMin(h * 60 + m, 'de-DE');

export const de: Messages = {
	common: {
		other: 'Sonstiges',
		today: 'Heute',
		backlog: 'Backlog',
		cancel: 'Abbrechen',
		save: 'Speichern',
		delete: 'Löschen',
		done: 'Fertig',
		close: 'Schließen',
		add: 'Hinzufügen',
		edit: 'Bearbeiten',
		quest: 'Quest',
		start: 'Beginn',
		end: 'Ende',
		task: 'Aufgabe',
		thisWeek: 'Diese Woche',
		loading: 'Wird geladen …',
		actionsFor: (name) => `Aktionen für ${name}`,
		markDone: 'Als erledigt markieren',
		markNotDone: 'Als offen markieren',
		moveUp: 'Nach oben',
		moveDown: 'Nach unten',
		deleteTask: 'Aufgabe löschen',
		logTimeMenu: 'Zeit erfassen …',
		durationOptional: 'Dauer in Minuten (optional)',
		durationPlaceholder: 'min',
		showDone: 'Erledigte Aufgaben einblenden',
		hideDone: 'Erledigte Aufgaben ausblenden',
		networkError: 'Netzwerkfehler – bitte versuche es erneut.',
		couldNotSave: (status) => `Speichern fehlgeschlagen (${status}).`,
		requestFailed: (status) => `Anfrage fehlgeschlagen (${status}).`,
		pctOfTarget: (pct) => `${pct}${nb}% des Ziels`,
		closedQuest: 'Abgeschlossene Quest',
		noWeeklyBudget: 'Kein Wochenbudget'
	},
	nav: {
		home: 'Start',
		plan: 'Planen',
		calendar: 'Kalender',
		focus: 'Fokus',
		quests: 'Quests',
		review: 'Rückblick',
		main: 'Hauptnavigation',
		me: 'Ich',
		brandHome: 'libe – Start',
		timerChip: (display, state, title) => `Timer ${display} (${state}): ${title} – Fokus öffnen`,
		search: 'Suchen …',
		account: 'Konto und Geräte',
		accountOf: (name) => `Konto und Geräte (${name})`,
		withProgress: (label, progress) => `${label}, ${progress}`,
		signedInAs: 'Angemeldet als',
		thisDevice: 'Dieses Gerät',
		thisDeviceIs: (device) => `Dieses Gerät: ${device}`,
		editProfile: 'Profil bearbeiten',
		settings: 'Einstellungen',
		pairNewDevice: 'Neues Gerät koppeln'
	},
	palette: {
		title: 'Befehlspalette',
		inputLabel: 'Seiten, Aktionen, Quests und Aufgaben durchsuchen',
		placeholder: 'Suchen oder springen …',
		results: 'Ergebnisse',
		pages: 'Seiten',
		actions: 'Aktionen',
		quests: 'Quests',
		tasks: 'Aufgaben',
		pauseTimer: 'Timer pausieren',
		resumeTimer: 'Timer fortsetzen',
		stopTimer: 'Timer stoppen',
		editProfile: 'Profil bearbeiten',
		searching: 'Suche läuft …',
		noResults: 'Keine Treffer',
		failed: 'Suche fehlgeschlagen – versuch es noch mal.',
		startFocus: (title) => `Fokus-Timer für ${title} starten`,
		keys: { move: 'auswählen', open: 'öffnen', focus: 'Fokus starten', close: 'schließen' }
	},
	dialog: { close: 'Dialog schließen' },
	miniPlayer: {
		label: 'Aktiver Timer',
		open: (title, display, state) => `${title}, ${display}, ${state} – Fokus öffnen`,
		pause: 'Timer pausieren',
		resume: 'Timer fortsetzen',
		startPhase: 'Nächste Phase starten',
		skip: 'Pause überspringen'
	},
	menu: { open: 'Menü öffnen' },
	week: {
		nav: 'Woche',
		previous: 'Vorherige Woche',
		next: 'Nächste Woche',
		thisWeek: 'Diese Woche',
		days: 'Tage',
		dayAria: (date, today, mark) => `${date}${today ? ' (heute)' : ''}${mark ? `, ${mark}` : ''}`
	},
	tasks: {
		startFocus: 'Fokus-Timer für diese Aufgabe starten',
		timerLive: (display, state) => `Timer ${display}, ${state} – Fokus öffnen`,
		resumeTimer: 'Timer fortsetzen',
		pauseTimer: 'Timer pausieren',
		timeBlock: 'Zeitblock …',
		movePrevDay: 'Auf den Vortag verschieben',
		moveNextDay: 'Auf den nächsten Tag verschieben',
		moveToDay: 'Auf Tag verschieben',
		moveToDate: (date) => `Auf ${date} verschieben`,
		moveToBacklog: 'Ins Backlog verschieben',
		moveToTomorrow: 'Auf morgen verschieben',
		moveToToday: 'Auf heute verschieben',
		filter: 'Aufgaben nach Quest filtern',
		filterDialog: 'Quest-Filter',
		filterHint: 'Aufgaben anzeigen von',
		noOpenQuests: 'Keine offenen Quests.',
		pickerCompact: (name) => `Quest: ${name} (ändern)`,
		chooseQuest: 'Quest wählen',
		logged: 'erfasst',
		planned: 'geplant',
		plannedDuration: (duration) => `${duration} geplant`,
		loggedDuration: (duration) => `${duration} erfasst`,
		addToBacklog: 'Ins Backlog …',
		addTask: 'Neue Aufgabe …',
		backlogEmpty: 'Im Backlog wartet nichts.'
	},
	home: {
		// Name nur im Vokativ („…, Anton“), nie als Genitiv.
		greeting: {
			morning: (name) => (name ? `Guten Morgen, ${name}` : 'Guten Morgen'),
			afternoon: (name) => (name ? `Hallo, ${name}` : 'Hallo'),
			evening: (name) => (name ? `Guten Abend, ${name}` : 'Guten Abend'),
			night: (name) => (name ? `Noch wach, ${name}?` : 'Noch wach?')
		},
		today: 'heute',
		ofGoalToday: (goal) => `/ ${goal} heute`,
		thisWeek: (hours) => `${hours} diese Woche`,
		nextUp: {
			label: 'Als Nächstes',
			start: 'Fokus starten',
			startAria: (title) => `Fokus starten: ${title}`,
			emptyTitle: 'Für heute nichts geplant',
			todayDoneTitle: 'Die Liste für heute ist erledigt',
			overdueLeft: (n) =>
				n === 1
					? 'Eine überfällige Aufgabe ist noch offen.'
					: `${n} überfällige Aufgaben sind noch offen.`,
			emptyHint: 'Füge unten eine Aufgabe hinzu oder hol dir eine aus dem Backlog.',
			addTask: 'Aufgabe hinzufügen'
		},
		allDone: {
			title: 'Alles erledigt',
			tasks: (n) => (n === 1 ? '1 Aufgabe' : `${n} Aufgaben`),
			logged: (duration) => `${duration} erfasst`,
			goalReached: 'Tagesziel erreicht',
			planTomorrow: 'Morgen planen'
		},
		blockFailed:
			'Der Zeitblock konnte nicht gespeichert werden – der Beginn muss vor dem Ende liegen, beides zwischen 00:00 und 24:00.',
		firstQuest: {
			text: 'Quests sind deine größeren Ziele – eine Sprache, ein Nebenprojekt. Leg eine an, um hier Arbeit dafür zu planen; alles andere kommt unter Sonstiges.',
			action: 'Erste Quest anlegen'
		},
		scheduleToday: 'Für heute einplanen',
		dayTimeline: 'Tageszeitleiste',
		editBlockAria: (title, from, to) => `Zeitblock bearbeiten: ${title}, ${from} bis ${to}`,
		block: {
			titleNew: 'Zeitblock',
			titleEdit: 'Zeitblock bearbeiten',
			fallbackError: 'Diese Zeit passt nicht.',
			duration: 'Dauer (Minuten)',
			invalidSpan: 'Muss eine positive Dauer haben und bis 24:00 enden',
			add: 'Block hinzufügen'
		}
	},
	plan: {
		title: 'Plan',
		todayMarker: '(heute)',
		openBacklog: 'Offene Aufgaben im Backlog',
		collapseBacklog: 'Backlog einklappen',
		expandBacklog: 'Backlog ausklappen',
		emptyDayHint: 'Füge eine Aufgabe hinzu oder hol dir eine aus dem Backlog.',
		hasOpenTasks: 'offene Aufgaben',
		emptyWeek: {
			title: 'Nichts geplant',
			text: 'Füge einem Tag eine Aufgabe hinzu – oder hol dir eine aus dem Backlog.',
			action: 'Aufgabe hinzufügen'
		}
	},
	overdue: {
		label: 'Überfällig',
		heading: (n) => `Überfällig · ${n}`,
		yesterday: 'gestern',
		since: (day) => `seit ${day}`,
		allToToday: 'Alle auf heute',
		showAll: (n) => `Alle ${n} anzeigen`,
		showLess: 'Weniger anzeigen',
		todayAria: (title) => `Auf heute verschieben: ${title}`,
		navLabel: (home, n) => `${home}, ${n} überfällig`,
		marker: 'Überfällig',
		stripMark: 'überfällige Aufgaben',
		paletteAction: 'Überfällige Aufgaben auf heute verschieben',
		paletteDetail: (n) => `${n} ${plural(n, 'Aufgabe', 'Aufgaben')}`
	},
	calendar: {
		title: 'Kalender',
		showPlan: 'Plan einblenden',
		hasLogged: 'Zeit erfasst',
		questTotal: (hours) => `/ ${hours} Quest`,
		budgetBar: 'Quest-Stunden im Verhältnis zum Quest-Wochenbudget',
		grid: 'Wochenkalender',
		logTimeOn: (day) => `Zeit erfassen am ${day}`,
		planned: (title) => `Geplant: ${title}`,
		activeAria: (paused, title, since) =>
			`${paused ? 'Pausiert' : 'Läuft'}: ${title}, seit ${since}`,
		paused: 'pausiert',
		now: 'jetzt',
		editAria: (title, span) => `${title} bearbeiten, ${span}`,
		done: 'Erledigt',
		empty: {
			title: 'Diese Woche ist leer',
			text: 'Hier erscheint die Zeit, die du fokussierst oder erfasst.',
			action: 'Zeit erfassen'
		},
		dialog: {
			titleEdit: 'Sitzung bearbeiten',
			titleNew: 'Zeit erfassen',
			startDate: 'Startdatum',
			startTime: 'Startzeit',
			endDate: 'Enddatum',
			endTime: 'Endzeit',
			submit: 'Zeit erfassen'
		},
		picker: {
			loggedTask: 'Erfasste Aufgabe',
			otherDays: 'Andere Tage',
			search: 'Aufgaben durchsuchen',
			searchPlaceholder: 'Aufgaben suchen …',
			noMatches: 'Keine passenden Aufgaben.'
		}
	},
	focus: {
		title: 'Fokus',
		pomodoroSettings: 'Pomodoro-Einstellungen',
		back: 'Zurück',
		activeTimer: 'Aktiver Timer',
		cycle: 'Pomodoro-Zyklus',
		roundDot: (n, state) => `Runde ${n}: ${state}`,
		dots: { done: 'erledigt', current: 'aktuell', todo: 'offen' },
		startFocus: 'Fokus starten',
		startBreak: 'Pause starten',
		skip: 'Überspringen',
		resume: 'Fortsetzen',
		pause: 'Pausieren',
		skipBreak: 'Pause überspringen',
		complete: 'Abschließen',
		moreActions: 'Weitere Timer-Aktionen',
		stopKeepOpen: 'Stoppen (Aufgabe bleibt offen)',
		discard: 'Sitzung verwerfen',
		switchBefore: 'Stattdessen ',
		switchAfter: ' starten?',
		stopAndStart: 'Aktuellen stoppen und starten',
		pickTitle: 'Woran arbeitest du?',
		timerMode: 'Timer-Modus',
		modeFocus: 'Fokus',
		modePomodoro: 'Pomodoro',
		noTasks: 'Keine offenen Aufgaben für heute oder im Backlog.',
		addOnHome: 'Auf der Startseite eine hinzufügen',
		duration: 'Dauer',
		durationOpen: 'Offen',
		durationOther: 'Andere …',
		customMinutes: 'Minuten',
		durationHint: 'Zählt herunter, danach in die Überzeit. „Offen“ ist eine Stoppuhr.',
		pomodoroSummary: (focus, short, long, every) =>
			`${focus}${nb}min Fokus · ${short}${nb}min Pause · ${long}${nb}min lange Pause alle ${every}`,
		change: 'Ändern',
		logAfterwards: 'Zeit nachtragen …',
		groups: {
			selected: 'Ausgewählt',
			today: 'Heute',
			backlog: 'Backlog'
		},
		log: {
			title: 'Zeit erfassen',
			loadFailed: 'Die Sitzungen konnten nicht geladen werden.',
			deleteFailed: 'Die Sitzung konnte nicht gelöscht werden.',
			date: 'Datum',
			minutes: 'Minuten',
			markDone: 'Aufgabe als erledigt markieren',
			sessions: 'Sitzungen an diesem Tag',
			loggedOnDay: 'An diesem Tag erfasst',
			nothingLogged: 'Noch nichts erfasst.',
			deleteSession: (time) => `Sitzung ${time} löschen`,
			logged: (min) => `${min}${nb}min erfasst.`,
			submit: 'Zeit erfassen'
		},
		settings: {
			focus: 'Fokus',
			shortBreak: 'Kurze Pause',
			longBreak: 'Lange Pause',
			longBreakEvery: 'Lange Pause alle',
			unitMin: 'min',
			unitRounds: 'Runden',
			autoStart: 'Pausen und die nächste Runde automatisch starten',
			hint: 'Änderungen gelten ab der nächsten Phase. Nach einer langen Pause wartet die nächste Runde immer auf dich.'
		},
		cheer: {
			targetReached: (name, min) =>
				`Stark${name ? `, ${name}` : ''} – ${min} ${plural(min, 'Minute', 'Minuten')} geschafft.`,
			shortBreak: (name) => (name ? `Kurz durchatmen, ${name}.` : 'Kurz durchatmen.'),
			longBreak: (name) =>
				name
					? `Lange Pause – hast du dir verdient, ${name}.`
					: 'Lange Pause – hast du dir verdient.'
		},
		switchDialog: {
			title: 'Timer wechseln?',
			isRunning: ' läuft',
			anotherActive: 'Ein anderer Timer ist aktiv.',
			promptBefore: 'Stoppen – die Zeit bleibt erfasst – und ',
			promptAfter: ' starten?'
		}
	},
	timer: {
		states: {
			ready: 'BEREIT',
			running: 'LÄUFT',
			paused: 'PAUSIERT',
			overtime: 'ÜBERZEIT',
			focus: 'FOKUS',
			breakTime: 'PAUSENZEIT',
			shortBreak: 'KURZE PAUSE',
			longBreak: 'LANGE PAUSE'
		},
		round: (n, of) => `RUNDE ${n}/${of}`,
		sources: { focus: 'Fokus', pomodoro: 'Pomodoro', manual: 'Manuell' }
	},
	quests: {
		title: 'Quests',
		subtitle:
			'Die wenigen Dinge, die wirklich zählen. Jede Stunde, die du erfasst, gehört zu einer davon.',
		newQuest: 'Neue Quest',
		editQuest: 'Quest bearbeiten',
		summary: (n) => `in diesem Quartal erfasst – verteilt auf ${n} ${plural(n, 'Quest', 'Quests')}`,
		closedCount: (n) => `Abgeschlossen (${n})`,
		backToQuests: 'Quests',
		weekOfBudget: (budget) => `/ ${budget} diese Woche`,
		thisWeek: 'diese Woche',
		timeSummary: 'Erfasste Zeit',
		perWeek: (hours) => `${hours} / Woche`,
		backlogEmpty: 'Noch nichts im Backlog – alles Eingeplante steht unter „Eingeplant“.',
		scheduled: 'Eingeplant',
		scheduledEmpty: 'Für diese Quest ist noch nichts eingeplant.',
		notFound: 'Quest nicht gefunden',
		empty: {
			title: 'Noch keine Quest',
			text: 'Eine Quest ist ein größeres Ziel, zum Beispiel eine Sprache oder ein Projekt.',
			action: 'Quest erstellen'
		},
		card: {
			deleteConfirm: (name) =>
				`„${name}“ löschen? Ihre Aufgaben und alle erfassten Zeiten werden ebenfalls gelöscht.`,
			reopen: 'Quest wieder öffnen',
			close: 'Quest abschließen',
			delete: 'Quest löschen',
			thisQuarter: (hours) => `${hours} in diesem Quartal`
		},
		form: {
			name: 'Name',
			namePlaceholder: 'Meine Idee umsetzen',
			more: 'Weitere Optionen',
			moreHint: 'Symbol, Budget …',
			description: 'Beschreibung',
			descriptionPlaceholder: 'Beschreibung (optional)',
			icon: 'Symbol',
			suggested: 'Vorgeschlagene Emojis',
			useIcon: (emoji) => `${emoji} als Symbol verwenden`,
			budget: 'Wochenbudget',
			budgetPlaceholder: 'Keins',
			budgetUnit: 'h',
			budgetHours: 'Stunden',
			colour: 'Farbe',
			colourGroup: 'Quest-Farbe',
			create: 'Quest erstellen'
		}
	},
	colors: {
		red: 'Rot',
		orange: 'Orange',
		amber: 'Bernstein',
		lime: 'Limette',
		green: 'Grün',
		teal: 'Petrol',
		blue: 'Blau',
		purple: 'Lila',
		pink: 'Pink',
		olive: 'Oliv',
		slate: 'Schiefer'
	},
	review: {
		title: 'Wochenrückblick',
		keyFigures: 'Kennzahlen',
		questHours: 'Quest-Stunden',
		noBudget: 'Kein Wochenbudget festgelegt',
		dailyAverage: 'Tagesdurchschnitt',
		notStarted: 'Diese Woche hat noch nicht begonnen',
		loggedOver: (hours, days) => `${hours} erfasst an ${days} ${plural(days, 'Tag', 'Tagen')}`,
		questVsOther: 'Quest-Arbeit vs. Sonstiges',
		ofLogged: (hours) => `von ${hours} erfasst`,
		noTimeLogged: 'Keine Zeit erfasst',
		points: (signed) => `${signed}${nb}Pkt.`,
		vsLastWeek: 'ggü. Vorwoche',
		vsLastDays: (range) => `ggü. ${range} der Vorwoche`,
		perDay: 'Quest-Stunden · pro Tag',
		dayAria: (day, hm) => `${day}: ${hm} Quest-Arbeit`,
		dayAriaOther: (hm) => `, Sonstiges ${hm}`,
		noQuestWork: 'Keine Quest-Arbeit',
		thisQuarter: 'Dieses Quartal',
		questWork: 'Quest-Arbeit',
		quarterTarget: (hours, weeks) => ` / ${hours} Ziel (${weeks})`,
		weeks: (n, count) => `${n} ${plural(count, 'Woche', 'Wochen')}`,
		otherWork: 'Sonstiges',
		closed: 'Abgeschlossen',
		weeklyHours: 'Stunden pro Woche:',
		quarterVsTarget: (name) => `${name}: Quartalsstunden im Verhältnis zum Ziel`,
		hoursByQuest: 'Stunden pro Quest',
		noQuests: 'Noch keine Quests.',
		closedSr: '(abgeschlossen)',
		split: (quest, pct, other) => `Quest-Arbeit ${quest} (${pct}${nb}%), Sonstiges ${other}`,
		noTimeThisWeek: 'Diese Woche wurde keine Zeit erfasst',
		questWorkLegend: 'Quest-Arbeit',
		empty: {
			title: 'Noch nichts erfasst',
			text: 'Sobald du einen Fokus beendest, siehst du hier deine Woche.',
			action: 'Fokus starten',
			pastTitle: 'Nichts erfasst',
			pastText: 'In dieser Woche wurde keine Zeit erfasst.',
			futureText: 'Der Rückblick füllt sich, sobald du Zeit erfasst.'
		},
		phone: {
			view: 'Anzeigen',
			week: 'Woche',
			quarter: 'Quartal',
			ofTarget: (hours) => `von ${hours}`,
			perDay: 'pro Tag',
			perWeek: 'pro Woche',
			perWeekChart: 'Quest-Stunden · pro Woche',
			weekAria: (monday, hm) => `Woche ab ${monday}: ${hm} Quest-Arbeit`,
			vsQuarter: (label) => `ggü. ${label}`,
			vsQuarterSoFar: (label) => `ggü. gleichem Stand in ${label}`,
			quarterEmpty: {
				text: 'Sobald du einen Fokus beendest, siehst du hier dein Quartal.',
				pastText: 'In diesem Quartal wurde keine Zeit erfasst.',
				futureTitle: 'Dieses Quartal hat noch nicht begonnen'
			}
		},
		yourWeek: (name) => (name ? `Deine Woche, ${name}.` : 'Deine Woche.'),
		summary: {
			future: 'Sie hat noch nicht begonnen.',
			emptyCurrent: 'Noch nichts erfasst.',
			empty: 'Nichts erfasst.',
			logged: (total) => `${total} erfasst.`,
			more: (total, delta, partial) =>
				`${total} erfasst – ${delta} mehr als ${partial ? 'an denselben Tagen letzte Woche' : 'letzte Woche'}.`,
			less: (total, delta, partial) =>
				`${total} erfasst – ${delta} weniger als ${partial ? 'an denselben Tagen letzte Woche' : 'letzte Woche'}.`,
			same: (total, partial) =>
				`${total} erfasst – etwa so viel wie ${partial ? 'an denselben Tagen letzte Woche' : 'letzte Woche'}.`
		}
	},
	settings: {
		title: 'Einstellungen',
		profile: 'Profil',
		displayName: 'Name',
		displayNamePlaceholder: 'Dein Name',
		displayNameHint: `Optional, höchstens ${DISPLAY_NAME_MAX} Zeichen. Lass das Feld leer für keinen Namen.`,
		avatarColour: 'Avatarfarbe',
		avatarStyle: 'Avatar zeigt',
		avatarStyles: { initials: 'Initialen', emoji: 'Emoji' },
		avatarEmoji: 'Avatar-Emoji',
		avatarEmojiHint: 'Ein Emoji statt deiner Initialen. Lass das Feld leer für deine Initialen.',
		suggestedEmoji: 'Vorgeschlagene Emojis',
		useAvatarEmoji: (emoji) => `${emoji} als Avatar verwenden`,
		dailyGoal: 'Tagesziel',
		dailyGoalDesc:
			'Wie viel Zeit du jeden Tag erfassen möchtest. Ein Ring an „Start“ in der Navigation füllt sich dabei.',
		goal: 'Ziel',
		goalOff: 'Kein Tagesziel',
		goalHours: 'Stunden',
		goalMinutes: 'Minuten',
		goalHint: `Von ${duration(0, DAILY_GOAL_MIN)} bis ${duration(DAILY_GOAL_MAX / 60, 0)}, in ${DAILY_GOAL_STEP}-Minuten-Schritten.`,
		streak: 'Serie',
		streakRuleGoal: (threshold) =>
			`Ein Tag zählt für deine Serie, sobald du dein Tagesziel (${threshold}) erreichst.`,
		streakRuleFallback: (threshold) =>
			`Ein Tag zählt für deine Serie, sobald du mindestens ${threshold} erfasst – oder dein Tagesziel, sobald du eins festlegst.`,
		streakRuleHistory:
			'Vergangene Tage werden mit dem aktuellen Ziel bewertet – änderst du es, wird deine Serie neu gezählt.',
		restDays: 'Ruhetage',
		restDaysHint: `Ruhetage unterbrechen keine Serie: Ohne genug Zeit werden sie übersprungen, mit genug Zeit zählen sie trotzdem. Höchstens ${MAX_REST_DAYS} pro Woche.`,
		devices: 'Geräte',
		devicesDesc:
			'Alle Browser, Home-Bildschirm-Apps und Desktop-Apps, die libe öffnen können. Entferne ein Gerät, um es überall sofort abzumelden.',
		deviceName: 'Gerätename',
		thisDevice: 'Dieses Gerät',
		paired: (date) => `Gekoppelt am ${date}`,
		activeNow: 'Gerade aktiv',
		lastSeen: (ago) => `Zuletzt aktiv: ${ago}`,
		neverSeen: 'Nie aktiv',
		signOut: 'Abmelden',
		revokeMenu: 'Entfernen …',
		revoke: 'Entfernen',
		kinds: { browser: 'Browser', pwa: 'Home-Bildschirm-App', tauri: 'Desktop-App' },
		confirmSignOutTitle: 'Dieses Gerät abmelden?',
		confirmRevokeTitle: 'Gerät entfernen?',
		confirmSignOut:
			' wird abgemeldet. Um libe hier wieder zu nutzen, brauchst du einen Kopplungscode von einem anderen Gerät (oder das Server-Passwort).',
		confirmRevoke:
			' wird sofort abgemeldet und kann libe erst wieder öffnen, wenn es neu gekoppelt wurde.',
		notifications: {
			title: 'Benachrichtigungen',
			desc: 'Ein kurzer Hinweis auf diesem Gerät, wenn eine Timer-Phase endet, und die offenen Aufgaben von heute am App-Symbol.',
			sendTest: 'Test senden',
			sent: 'Gesendet',
			install:
				'Füge libe zum Home-Bildschirm hinzu, um Benachrichtigungen zu bekommen: Tippe auf „Teilen“, dann auf „Zum Home-Bildschirm“.',
			unsupported: 'Dieser Browser kann keine Benachrichtigungen von libe empfangen.',
			deniedApple:
				'Benachrichtigungen sind blockiert. Erlaube sie unter Einstellungen → Mitteilungen → libe.',
			deniedBrowser:
				'Benachrichtigungen sind blockiert. Erlaube sie für diese Seite in den Einstellungen deines Browsers.',
			failed: 'Benachrichtigungen konnten nicht eingeschaltet werden. Versuch es noch einmal.',
			testFailed: 'Die Testbenachrichtigung konnte nicht gesendet werden.'
		},
		language: 'Sprache',
		languageDesc:
			'Gilt für libe auf all deinen Geräten. „Systemstandard“ folgt den Spracheinstellungen des jeweiligen Browsers.',
		appearance: 'Erscheinungsbild',
		appearanceDesc:
			'Nur für dieses Gerät. „Automatisch“ folgt der Systemeinstellung (Hell oder Dunkel).',
		sections: {
			profile: 'Profil',
			goal: 'Tagesziel und Serie',
			focus: 'Fokus',
			notifications: 'Benachrichtigungen',
			appearance: 'Erscheinungsbild',
			language: 'Sprache',
			devices: 'Geräte',
			desktop: 'Desktop-App'
		},
		sectionsLabel: 'Bereiche der Einstellungen',
		profileRowHint: 'Name, Avatar',
		yourDay: 'Dein Tag',
		goalCustomRow: 'Eigene Dauer …',
		goalOffValue: 'Aus',
		restNone: 'Keine',
		restDaysCount: (n) => `${n} Tage`,
		focusGroup: 'Fokus',
		pomodoro: 'Pomodoro',
		pomodoroValue: (focus, short, long) => `${focus} · ${short} · ${long}${nb}min`,
		autoStartRow: 'Automatisch weiter',
		autoStartDesc: 'Pausen und die nächste Runde starten von selbst.',
		pairRow: 'Gerät koppeln',
		deviceKind: 'Art',
		devicePaired: 'Gekoppelt',
		deviceLastSeen: 'Zuletzt aktiv',
		saving: 'Wird gespeichert …',
		saved: 'Gespeichert',
		languageOptions: { auto: 'Systemstandard', en: 'English', de: 'Deutsch' },
		appearanceOptions: { auto: 'Automatisch', light: 'Hell', dark: 'Dunkel' },
		pair: {
			title: 'Neues Gerät koppeln',
			isPaired: ' ist gekoppelt.',
			pairAnother: 'Weiteres Gerät koppeln',
			introBefore: 'Öffne auf dem neuen Gerät ',
			introAfter:
				' (im Browser, in der Home-Bildschirm-App oder in der Desktop-App) und gib diesen Code ein – oder scanne den QR-Code mit seiner Kamera.',
			codeAria: (digits) => `Kopplungscode ${digits}`,
			validFor: (countdown) => `Gültig für ${countdown}`,
			generatingAria: 'Code wird erzeugt',
			generating: 'Wird erzeugt …',
			expired: 'Code abgelaufen.',
			noCode: 'Kein Code.',
			qrAria: 'QR-Code, der die Kopplungsseite mit diesem Code öffnet',
			opens: 'Öffnet',
			newCode: 'Neuer Code',
			createFailed:
				'Es konnte kein Code erzeugt werden. Prüfe die Verbindung und versuche es erneut.',
			locked: 'Zu viele falsche Versuche – dieser Code ist nicht mehr gültig.',
			newDevice: 'Das neue Gerät'
		}
	},
	push: {
		countdownDone: 'Zeit ist um',
		breakStarted: (min) => `Pause · ${min} Min.`,
		longBreakStarted: (min) => `Lange Pause · ${min} Min.`,
		breakWaiting: 'Runde geschafft – starte deine Pause',
		focusStarted: 'Pause vorbei – zurück zum Fokus',
		focusWaiting: 'Pause vorbei – starte die nächste Runde',
		testTitle: 'Benachrichtigungen sind an',
		testBody: 'So sagt dir libe, dass eine Timer-Phase zu Ende ist.'
	},
	desktop: {
		title: 'Desktop-App',
		desc: '· Updates werden im Hintergrund geladen und beim Neustart der App installiert.',
		check: 'Nach Updates suchen',
		track: 'Update-Kanal',
		trackDesc:
			'Stable erhält getestete Releases, Nightly den neuesten Build von libe. Ein Wechsel installiert den neuesten Build dieses Kanals – auch wenn er älter ist als dieser.',
		tracks: { stable: 'Stable', nightly: 'Nightly' },
		checked: (ago) => `Zuletzt geprüft: ${ago}.`,
		downloadProgress: 'Download-Fortschritt',
		installRestart: 'Installieren und neu starten',
		restartToUpdate: 'Neu starten und aktualisieren',
		serverRuns: (version, track) => `Dein Server läuft mit libe ${version} (${track}).`,
		otherTrackBefore: 'Er wird separat über sein Docker-Image aktualisiert: Mit dem Tag ',
		otherTrackAfter: (track) => ` kommt er ebenfalls auf ${track}.`,
		sameTrackBefore: 'Er wird separat über sein Docker-Image aktualisiert (',
		sameTrackAfter: ').',
		devServer: (version) => `Dein Server läuft mit einem Entwicklungs-Build von libe (${version}).`,
		unpairTitle: 'Server wechseln / Kopplung aufheben',
		unpairDesc:
			'Meldet diese App ab und vergisst den Server. Danach zeigt sie ihren Kopplungsbildschirm, auf dem du sie erneut koppeln kannst – mit diesem oder einem anderen Server.',
		unpair: 'Server wechseln / Kopplung aufheben …',
		unpairConfirm: 'Diese App jetzt abmelden?',
		unpairConfirmButton: 'Kopplung aufheben',
		unpairing: 'Kopplung wird aufgehoben …',
		unpairUnsupported:
			'Diese Version der App kann das hier noch nicht. Nutze ihr Menü (libe → Change server / Unpair…) oder aktualisiere die App zuerst.',
		unpairFailed: (detail) => `Die Kopplung konnte nicht aufgehoben werden: ${detail}`,
		nix: {
			desc: '· mit Nix installiert.',
			title: 'Updates kommen über Nix',
			body: 'Diese App wurde mit Nix installiert und aktualisiert sich deshalb nicht selbst. Sie ändert sich, wenn du ihren Flake-Input aktualisierst und neu baust.',
			update: 'Aktualisieren',
			rebuild: 'danach neu bauen (oder system.autoUpgrade machen lassen)',
			track: 'Kanal',
			or: 'oder',
			trackNote: '– der Branch des libe-Inputs'
		},
		phases: {
			idle: 'Noch nicht geprüft.',
			checking: 'Suche nach Updates …',
			upToDate: 'Auf dem neuesten Stand.',
			downloading: (version, pct) =>
				`libe ${version} wird heruntergeladen …${pct === null ? '' : ` ${pct}${nb}%`}`,
			readyPassword: (version) =>
				`libe ${version} ist bereit zur Installation (fragt nach deinem Passwort).`,
			ready: (version) =>
				`libe ${version} ist bereit und wird installiert, wenn du die App neu startest oder beendest.`,
			installing: (version) => `libe ${version} wird installiert …`
		},
		codes: {
			devBuild: 'Entwicklungs-Builds aktualisieren sich nicht selbst.',
			unsupportedInstall:
				'Für diese Installationsart gibt es keine automatischen Updates. Lade neue Versionen von den GitHub-Releases herunter.',
			nixManaged:
				'Diese App wurde mit Nix installiert und aktualisiert sich nicht selbst. Aktualisiere den Flake-Input (nix flake update libe) und baue neu.',
			managedByNix: 'Updates dieser App laufen über Nix.',
			noRelease: (track) => `Es ist noch kein ${track}-Release veröffentlicht.`,
			checkFailed: (detail) => `Die Suche nach Updates ist fehlgeschlagen: ${detail}`,
			downloadFailed: (version, detail) =>
				`Der Download von libe ${version} ist fehlgeschlagen: ${detail}`,
			installFailed: (detail) => `Die Installation des Updates ist fehlgeschlagen: ${detail}`,
			saveTrackFailed: (detail) => `Der Update-Kanal konnte nicht gespeichert werden: ${detail}`,
			installing: 'Gerade wird ein Update installiert.',
			nothingDownloaded: 'Es wurde noch kein Update heruntergeladen.'
		}
	},
	auth: {
		alreadyPairedBefore: 'Dieses Gerät ist bereits gekoppelt als ',
		alreadyPairedAfter: '.',
		continue: 'Weiter zu libe →',
		deviceName: 'Gerätename',
		pairing: 'Wird gekoppelt …',
		tooManyAttempts: (seconds) => `Zu viele Versuche. Versuche es in ${seconds}${nb}s erneut.`,
		intro:
			'libe ist dein persönlicher Planer: Ziele setzen, Tage planen und deine Fokuszeit erfassen.',
		setup: {
			pageTitle: 'libe einrichten',
			title: 'libe einrichten',
			titleRecovery: 'Mit dem Server-Passwort koppeln',
			subtitle:
				'Kopple dein erstes Gerät. Du brauchst das Server-Passwort – es wurde beim Einrichten dieses libe-Servers festgelegt.',
			subtitleRecovery: 'Wiederherstellung: Kopple dieses Gerät mit dem Server-Passwort.',
			notSet: 'LIBE_SETUP_SECRET ist nicht gesetzt.',
			notSetHelpHtml:
				'Setze es in der Serverumgebung (<code>.env</code> in der Entwicklung, unter <code>environment</code> des Dienstes <code>app</code> in <code>compose.yaml</code>) auf einen langen Zufallswert, z.&#8239;B. <code>openssl rand -base64 24</code>, starte den Server neu und lade diese Seite neu.',
			secret: 'Server-Passwort',
			secretHintHtml: 'Für Admins: der Wert von <code>LIBE_SETUP_SECRET</code> auf dem Server.',
			submit: 'Dieses Gerät koppeln',
			yourName: 'Dein Name',
			yourNameHint:
				'Optional – wird in libe angezeigt. Du kannst ihn später in den Einstellungen ändern.',
			haveDevice: 'Ein gekoppeltes Gerät in der Nähe?',
			withCode: 'Stattdessen mit einem Code koppeln'
		},
		pair: {
			pageTitle: 'Dieses Gerät koppeln · libe',
			title: 'Dieses Gerät koppeln',
			subtitle:
				'Verbinde dieses Gerät mit einem bestehenden libe. Es teilt alles mit den bereits gekoppelten Geräten – libe ist für eine Person, kopple also nur deine eigenen Geräte.',
			code: 'Kopplungscode',
			codeHintHtml:
				'Einen Code bekommst du auf einem Gerät, das dieses libe schon nutzt: Einstellungen → <strong>Neues Gerät koppeln</strong>. Codes sind 10 Minuten gültig.',
			submit: 'Gerät koppeln',
			standalone:
				'Die Home-Bildschirm-App hat eine eigene Anmeldung, getrennt von Safari – kopple sie hier einmal.',
			nothingPaired: 'Noch ist nichts gekoppelt.',
			setUpFirst: 'Richte das erste Gerät',
			withSecret: 'mit dem Server-Passwort ein.',
			lostAll: 'Alle Geräte verloren?',
			useSecret: 'Server-Passwort verwenden'
		},
		session: {
			pageTitle: 'Anmeldung · libe',
			signingIn: 'Anmeldung läuft …',
			failed: 'Anmeldung fehlgeschlagen',
			noToken: 'Es wurde kein Geräte-Token übergeben.',
			signedOut: 'Dieses Gerät wurde abgemeldet. Kopple es erneut.',
			startFailed: (status) => `Die Sitzung konnte nicht gestartet werden (${status}).`,
			unreachable: 'Der Server ist nicht erreichbar.',
			pairAgain: 'Dieses Gerät koppeln'
		}
	},
	onboarding: {
		pageTitle: 'Willkommen · libe',
		back: 'Zurück',
		progress: (step, total) => `Schritt ${step} von ${total}`,
		skipSetup: 'Einrichtung überspringen',
		continue: 'Weiter',
		intro: {
			title: 'Willkommen bei libe',
			questsTitle: 'Quests',
			questsText: 'Plane die Dinge, die dir wichtig sind, in kleinen Schritten.',
			focusTitle: 'Fokus',
			focusText: 'Starte einen Timer, libe schreibt die Zeit für dich mit.',
			reviewTitle: 'Rückblick',
			reviewText: 'Sieh am Ende der Woche, wohin deine Zeit gegangen ist.',
			start: 'Los geht’s'
		},
		goal: {
			title: 'Wie viel Zeit am Tag?',
			lead: 'Dein Tagesziel. Du kannst es jederzeit in den Einstellungen ändern.',
			label: 'Tagesziel',
			none: 'Kein Tagesziel',
			later: 'Später festlegen'
		},
		quest: {
			title: 'Woran willst du arbeiten?',
			lead: 'Eine Quest ist ein größeres Ziel: eine Sprache, ein Projekt, Laufen.',
			section: 'Quest',
			name: 'Name der Quest',
			namePlaceholder: 'Spanisch lernen',
			color: 'Farbe',
			stepSection: 'Erster Schritt',
			stepTitle: 'Erster Schritt',
			stepPlaceholder: 'Lektion 1 durcharbeiten',
			duration: 'Dauer',
			stepFooter: 'Er landet auf deiner Liste für heute.',
			skip: 'Überspringen'
		},
		focus: {
			title: 'Bereit für deinen ersten Fokus?',
			lead: 'Ein Timer läuft, du arbeitest, libe schreibt die Zeit mit. Pausieren geht jederzeit.',
			start: 'Fokus starten',
			later: 'Später, zur Startseite',
			noTaskTitle: 'Alles bereit',
			noTaskLead:
				'Leg auf der Startseite einen ersten Schritt an, wann immer du magst, und starte von dort einen Fokus.',
			home: 'Zur Startseite'
		}
	},
	welcome: {
		paired: (name) =>
			name
				? `Willkommen, ${name} – dieses Gerät ist jetzt gekoppelt.`
				: 'Willkommen – dieses Gerät ist jetzt gekoppelt.',
		dismiss: 'Schließen'
	},
	offline: {
		pageTitle: 'Offline · libe',
		title: 'Du bist offline',
		subtitle:
			'libe braucht eine Verbindung zu deinem Server. Deine Pläne und Timer liegen dort, es geht also nichts verloren – verbinde dich wieder und mach weiter.',
		retry: 'Erneut versuchen'
	},
	deviceNames: {
		iphone: 'iPhone',
		ipad: 'iPad',
		androidPhone: 'Android-Smartphone',
		androidTablet: 'Android-Tablet',
		chromebook: 'Chromebook',
		mac: 'Mac',
		windows: 'Windows-PC',
		linux: 'Linux-PC',
		browser: 'Browser'
	},
	ago: {
		justNow: 'gerade eben',
		minutes: (n) => `vor ${n}${nb}Min.`,
		hours: (n) => `vor ${n}${nb}Std.`,
		yesterday: 'gestern',
		days: (n) => `vor ${n} Tagen`
	},
	errors: {
		// Quests
		questNameRequired: 'Gib der Quest einen Namen.',
		questNameTooLong: `Der Name darf höchstens ${QUEST_NAME_MAX} Zeichen lang sein.`,
		questDescriptionTooLong: `Die Beschreibung darf höchstens ${QUEST_DESC_MAX} Zeichen lang sein.`,
		questIconInvalid: 'Verwende genau ein Emoji.',
		questColorInvalid: 'Wähle eine der Farben.',
		questBudgetInvalid: `Das Budget muss größer als 0 und höchstens ${QUEST_BUDGET_MAX_H} Stunden sein.`,
		questUnknown: 'Unbekannte Quest.',
		questGone: 'Diese Quest gibt es nicht mehr.',
		pickQuest: 'Wähle eine Quest – oder leg auf der Seite „Quests“ deine erste an.',
		questNotFound: 'Quest nicht gefunden.',
		// Aufgaben
		taskTitleRequired: 'Schreib auf, was zu tun ist.',
		taskTitleTooLong: `Der Titel darf höchstens ${TASK_TITLE_MAX} Zeichen lang sein.`,
		taskDurationInvalid: `Die Dauer muss eine ganze Zahl von Minuten zwischen 1 und ${TASK_DURATION_MAX_MIN} sein.`,
		unknownDay: 'Unbekannter Tag.',
		taskGone: 'Diese Aufgabe gibt es nicht mehr.',
		taskNotFound: 'Aufgabe nicht gefunden.',
		pickTask: 'Wähle eine Aufgabe.',
		// Zeitblöcke
		blockStartInvalid: 'Wähle eine Startzeit zwischen 00:00 und 23:59.',
		blockDurationInvalid: 'Die Dauer muss eine positive ganze Zahl von Minuten sein.',
		blockPastMidnight: 'Der Block muss bis Mitternacht (24:00) enden.',
		blockGone: 'Diesen Block gibt es nicht mehr.',
		// Erfasste Zeit
		logInFuture: 'Diese Zeit liegt in der Zukunft.',
		logTooOld: `Zeit kann höchstens ${MANUAL_LOG_MAX_AGE_DAYS} Tage rückwirkend erfasst werden.`,
		logOverlapsTimer:
			'Das überschneidet sich mit dem laufenden Timer – stoppe ihn zuerst oder wähle eine andere Zeit.',
		pickDate: 'Wähle ein Datum.',
		pickStartDate: 'Wähle ein Startdatum.',
		pickStartTime: 'Wähle eine Startzeit.',
		pickEnd: 'Wähle Enddatum und Endzeit.',
		logDurationInvalid: `Die Dauer muss eine ganze Zahl von 1 bis ${MAX_TIMER_MIN} Minuten sein.`,
		endBeforeStart: 'Das Ende muss nach dem Beginn liegen.',
		sessionTooLong: 'Eine Sitzung darf höchstens 24 Stunden dauern.',
		sessionNotFound: 'Sitzung nicht gefunden.',
		// Timer
		timerNotRunning: 'Der Timer läuft nicht.',
		timerNotPaused: 'Der Timer ist nicht pausiert.',
		phaseRunning: 'Diese Phase läuft bereits.',
		noBreakToSkip: 'Es gibt keine Pause zum Überspringen.',
		plannedMinInvalid: `Die geplanten Minuten müssen eine ganze Zahl von 1 bis ${MAX_TIMER_MIN} sein.`,
		unknownMode: 'Unbekannter Modus.',
		unknownTimerAction: 'Unbekannte Timer-Aktion.',
		timerConflict: 'Es läuft bereits ein anderer Timer.',
		nothingToPause: 'Es gibt nichts zu pausieren.',
		nothingToResume: 'Es gibt nichts fortzusetzen.',
		noActiveTimer: 'Kein aktiver Timer.',
		noPomodoro: 'Es läuft kein Pomodoro.',
		pomodoroFocusMin: `Fokusdauer: eine ganze Zahl von ${lim.focusMin[0]} bis ${lim.focusMin[1]}.`,
		pomodoroShortBreakMin: `Kurze Pause: eine ganze Zahl von ${lim.shortBreakMin[0]} bis ${lim.shortBreakMin[1]}.`,
		pomodoroLongBreakMin: `Lange Pause: eine ganze Zahl von ${lim.longBreakMin[0]} bis ${lim.longBreakMin[1]}.`,
		pomodoroLongBreakEvery: `Lange Pause alle: eine ganze Zahl von ${lim.longBreakEvery[0]} bis ${lim.longBreakEvery[1]}.`,
		// Anfragen
		invalidBody: 'Ungültige Anfrage.',
		invalidJson: 'Ungültiges JSON.',
		expectedJson: 'JSON-Body erwartet.',
		invalidId: 'Ungültige ID.',
		taskAndDayRequired: 'taskId und day sind erforderlich.',
		// Geräte & Kopplung
		notPaired: 'Dieses Gerät ist nicht gekoppelt.',
		unknownDevice: 'Unbekanntes Gerät.',
		unknownCode: 'Unbekannter Code.',
		deviceNameRequired: 'Gib diesem Gerät einen Namen.',
		deviceNameTooLong: `Der Name darf höchstens ${DEVICE_NAME_MAX} Zeichen lang sein.`,
		setupDisabled: 'Die Einrichtung ist deaktiviert: LIBE_SETUP_SECRET ist nicht gesetzt.',
		wrongSetupSecret: 'Falsches Server-Passwort.',
		pairCodeFormat: 'Gib den 6-stelligen Code ein, der auf deinem anderen Gerät angezeigt wird.',
		pairCodeExpired: 'Dieser Code ist abgelaufen. Erzeuge auf deinem anderen Gerät einen neuen.',
		pairCodeUsed:
			'Dieser Code wurde bereits verwendet. Erzeuge auf deinem anderen Gerät einen neuen.',
		pairCodeLocked:
			'Zu viele falsche Versuche für diesen Code. Erzeuge auf deinem anderen Gerät einen neuen.',
		pairCodeWrong: 'Falscher Code. Prüfe den Code auf deinem anderen Gerät und versuche es erneut.',
		// Einstellungen
		languageInvalid: 'Wähle eine der Sprachen.',
		themeInvalid: 'Wähle ein Erscheinungsbild.',
		profileNameTooLong: `Der Name darf höchstens ${DISPLAY_NAME_MAX} Zeichen lang sein.`,
		profileColorInvalid: 'Wähle eine der Farben.',
		profileEmojiInvalid: 'Verwende genau ein Emoji.',
		dailyGoalInvalid: `Wähle ein Ziel von ${duration(0, DAILY_GOAL_MIN)} bis ${duration(DAILY_GOAL_MAX / 60, 0)}, in ${DAILY_GOAL_STEP}-Minuten-Schritten.`,
		streakRestDayInvalid: 'Wähle Ruhetage von Montag bis Sonntag.',
		streakRestDaysTooMany: `Wähle höchstens ${MAX_REST_DAYS} Ruhetage – mindestens ein Tag pro Woche muss zählen.`,
		// notifications
		pushEndpointInvalid: 'Dieser Push-Dienst wird nicht unterstützt.',
		pushKeysInvalid: 'Ungültige Schlüssel des Push-Abos.',
		pushNotSubscribed: 'Benachrichtigungen sind auf diesem Gerät nicht eingeschaltet.',
		pushSendFailed: 'Der Push-Dienst hat die Benachrichtigung nicht angenommen.'
	},
	goal: {
		duration,
		progress: (logged, goal) => `${logged} von ${goal} heute`,
		progressDone: (logged, goal) => `${logged} von ${goal} heute, Tagesziel erreicht`
	},
	streak: {
		count: (n) => `${n} ${plural(n, 'Tag', 'Tage')} in Folge`,
		todayDone: 'heute geschafft',
		pending: (remaining) => `Noch ${remaining} heute, damit deine Serie hält`,
		startHint: (remaining) => `Erfasse heute ${remaining} für eine neue Serie`,
		rest: 'Ruhetag – deine Serie ist sicher',
		milestone: (n, name) => `${n} Tage in Folge – stark${name ? `, ${name}` : ''}!`,
		none: 'Noch keine Serie',
		longestShort: (n) => `Längste: ${n} ${plural(n, 'Tag', 'Tage')}`,
		longest: (n) => `Längste Serie: ${n} ${plural(n, 'Tag', 'Tage')}`,
		marks: {
			done: 'Serientag',
			rest: 'Ruhetag',
			missed: 'verpasst',
			today: 'zählt noch nicht',
			future: 'kommt noch'
		}
	},
	homeList: {
		open: (n) => `${n} offen`,
		showMore: (n) => `${n} weitere anzeigen`,
		backlogRow: (n) => `Backlog, ${n} ${plural(n, 'Aufgabe', 'Aufgaben')}`,
		dailyPlan: 'Tagesplan',
		wholeDay: 'Ganzer Tag',
		nextHours: 'Nächste Stunden',
		planEmpty: 'Nichts geplant',
		planNow: (title) => `Jetzt: ${title}`,
		planNext: (time, title) => `${time} ${title}`,
		planPast: (n) => `${n} ${plural(n, 'Block', 'Blöcke')} früher heute`,
		planHint: 'Einen Zeitblock legst du über das ⋯-Menü einer Aufgabe an.'
	}
};
