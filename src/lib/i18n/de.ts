/**
 * Deutsche UI-Texte — gleiche Schlüssel wie `en.ts` (Typ `Messages`; fehlende oder
 * zusätzliche Schlüssel brechen `bun run check`). Informelles „du“, typografische
 * Anführungszeichen „…“, Gedankenstrich –, Auslassungspunkte nach geschütztem Leerzeichen (U+00A0, „Speichern …“ – bricht nicht um),
 * schmales geschütztes Leerzeichen vor Einheiten (` `).
 */
import { DEVICE_NAME_MAX } from '#lib/auth.ts';
import { MANUAL_LOG_MAX_AGE_DAYS } from '#lib/manual-log.ts';
import { QUEST_BUDGET_MAX_H, QUEST_DESC_MAX, QUEST_NAME_MAX } from '#lib/quest-form.ts';
import { TASK_DURATION_MAX_MIN, TASK_TITLE_MAX } from '#lib/task-form.ts';
import { MAX_TIMER_MIN, POMODORO_LIMITS } from '#lib/timer.ts';
import type { Messages } from './en.ts';

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
const lim = POMODORO_LIMITS;
/** Schmales geschütztes Leerzeichen (zwischen Zahl und Einheit). */
const nb = ' ';

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
		minutes: (n) => `${n}${nb}min`,
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
		brandHome: 'libe – Start',
		timerChip: (display, state, title) => `Timer ${display} (${state}): ${title} – Fokus öffnen`,
		search: 'Suchen …',
		account: 'Konto und Geräte',
		signedInAs: 'Angemeldet als',
		thisDevice: 'Dieses Gerät',
		settings: 'Einstellungen',
		pairNewDevice: 'Neues Gerät koppeln',
		signOut: 'Dieses Gerät abmelden'
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
		searching: 'Suche läuft …',
		noResults: 'Keine Treffer',
		failed: 'Suche fehlgeschlagen – versuch es noch mal.',
		startFocus: (title) => `Fokus-Timer für ${title} starten`,
		keys: { move: 'auswählen', open: 'öffnen', focus: 'Fokus starten', close: 'schließen' }
	},
	dialog: { close: 'Dialog schließen' },
	menu: { open: 'Menü öffnen' },
	week: {
		nav: 'Woche',
		previous: 'Vorherige Woche',
		next: 'Nächste Woche',
		thisWeek: 'Diese Woche'
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
		filter: 'Quest-Arbeit nach Quest filtern',
		filterDialog: 'Quest-Filter',
		filterHint: 'Aufgaben anzeigen von',
		noOpenQuests: 'Keine offenen Quests.',
		pickerCompact: (name) => `Quest: ${name} (ändern)`,
		chooseQuest: 'Quest wählen',
		addBottom: 'Unten hinzufügen',
		addTop: 'Oben hinzufügen',
		bottom: 'Unten',
		top: 'Oben',
		addToBacklog: 'Ins Backlog …',
		addTask: 'Neue Aufgabe …',
		backlogEmpty: 'Im Backlog wartet nichts.'
	},
	home: {
		today: 'heute',
		thisWeek: (hours) => `${hours} diese Woche`,
		budgetBar: 'Genutzter Anteil des Quest-Budgets dieser Woche',
		blockFailed:
			'Der Zeitblock konnte nicht gespeichert werden – der Beginn muss vor dem Ende liegen, beides zwischen 00:00 und 24:00.',
		questWork: 'Quest-Arbeit',
		addQuestWork: 'Neue Quest-Arbeit …',
		timeline: 'Zeitleiste',
		openTasks: (n) => `${n} ${plural(n, 'offene Aufgabe', 'offene Aufgaben')}`,
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
		title: 'Woche planen',
		addOther: 'Sonstige Aufgabe …',
		todayMarker: '(heute)',
		openBacklog: 'Offene Aufgaben im Backlog',
		collapseBacklog: 'Backlog einklappen',
		expandBacklog: 'Backlog ausklappen'
	},
	calendar: {
		title: 'Kalender',
		showPlan: 'Plan einblenden',
		hidePlan: 'Plan ausblenden',
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
		pickTitle: 'Worauf konzentrierst du dich?',
		timerMode: 'Timer-Modus',
		modeFocus: 'Fokus',
		modePomodoro: 'Pomodoro',
		noTasks: 'Keine offenen Aufgaben für heute oder im Backlog.',
		addOnHome: 'Auf der Startseite eine hinzufügen',
		plannedMinutes: 'Geplante Minuten',
		openEnded: 'Ohne Limit',
		plannedHint: 'Zählt herunter, danach weiter in die Überzeit. Leer = Stoppuhr.',
		pomodoroSummary: (focus, short, long, every) =>
			`${focus}${nb}min Fokus · ${short}${nb}min Pause · ${long}${nb}min lange Pause alle ${every}`,
		change: 'Ändern',
		start: 'Starten',
		logAfterwards: 'Zeit nachtragen …',
		groups: {
			selected: 'Ausgewählt',
			todayQuest: 'Heute · Quest-Arbeit',
			todayOther: 'Heute · Sonstiges',
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
		allQuests: 'Alle Quests',
		perWeek: (hours) => `${hours} / Woche`,
		backlogEmpty: 'Noch nichts im Backlog – alles Eingeplante steht unter „Eingeplant“.',
		scheduled: 'Eingeplant',
		scheduledEmpty: 'Für diese Quest ist noch nichts eingeplant.',
		notFound: 'Quest nicht gefunden',
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
			description: 'Beschreibung',
			descriptionPlaceholder: 'Die wenigen Dinge, die wirklich zählen …',
			icon: 'Icon',
			suggested: 'Vorgeschlagene Emojis',
			useIcon: (emoji) => `${emoji} als Icon verwenden`,
			budget: 'Wochenbudget · h',
			budgetPlaceholder: 'keins',
			colour: 'Farbe',
			colourGroup: 'Quest-Farbe',
			changeLater: 'Du kannst später alles ändern.',
			create: 'Quest erstellen',
			saveChanges: 'Änderungen speichern'
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
		subtitle: 'Wie viel der Woche deine Quests vorangebracht hat.',
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
		questWorkLegend: 'Quest-Arbeit'
	},
	settings: {
		title: 'Einstellungen',
		subtitle: 'Gekoppelte Geräte, Fokus-Timer und Sprache.',
		devices: 'Geräte',
		devicesDesc:
			'Alle Browser, Home-Bildschirm-Apps und Desktop-Apps, die libe öffnen können. Entferne ein Gerät, um es überall sofort abzumelden.',
		pairNew: 'Neues Gerät koppeln',
		deviceName: 'Gerätename',
		thisDevice: 'Dieses Gerät',
		paired: (date) => `Gekoppelt am ${date}`,
		activeNow: 'Gerade aktiv',
		lastSeen: (ago) => `Zuletzt aktiv: ${ago}`,
		neverSeen: 'Nie aktiv',
		rename: 'Umbenennen …',
		signOut: 'Abmelden',
		revokeMenu: 'Entfernen …',
		revoke: 'Entfernen',
		signOutDevice: 'Dieses Gerät abmelden',
		kinds: { browser: 'Browser', pwa: 'Home-Bildschirm-App', tauri: 'Desktop-App' },
		focusTimer: 'Fokus-Timer',
		pomodoroSummary: (focus, short, long, every) =>
			`Pomodoro: ${focus}${nb}min Fokus · ${short}${nb}min Pause · ${long}${nb}min lange Pause alle ${every} Runden`,
		autoStart: ' · Autostart',
		pomodoroSettings: 'Pomodoro-Einstellungen',
		confirmSignOutTitle: 'Dieses Gerät abmelden?',
		confirmRevokeTitle: 'Gerät entfernen?',
		confirmSignOut:
			' wird abgemeldet. Um libe hier wieder zu nutzen, brauchst du einen Kopplungscode von einem anderen Gerät (oder das Setup-Secret).',
		confirmRevoke:
			' wird sofort abgemeldet und kann libe erst wieder öffnen, wenn es neu gekoppelt wurde.',
		language: 'Sprache',
		languageDesc:
			'Gilt für libe auf all deinen Geräten. „Systemstandard“ folgt den Spracheinstellungen des jeweiligen Browsers.',
		languageOptions: { auto: 'Systemstandard', en: 'English', de: 'Deutsch' },
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
		setup: {
			pageTitle: 'libe einrichten',
			title: 'libe einrichten',
			titleRecovery: 'Mit dem Setup-Secret koppeln',
			subtitle: 'Kopple dein erstes Gerät mit dem Setup-Secret aus der Serverkonfiguration.',
			subtitleRecovery: 'Wiederherstellung: Kopple dieses Gerät mit dem Setup-Secret des Servers.',
			notSet: 'LIBE_SETUP_SECRET ist nicht gesetzt.',
			notSetHelpHtml:
				'Setze es in der Serverumgebung (<code>.env</code> in der Entwicklung, unter <code>environment</code> des Dienstes <code>app</code> in <code>compose.yaml</code>) auf einen langen Zufallswert, z.&#8239;B. <code>openssl rand -base64 24</code>, starte den Server neu und lade diese Seite neu.',
			secret: 'Setup-Secret',
			secretHintHtml: 'Der Wert von <code>LIBE_SETUP_SECRET</code> auf dem Server.',
			submit: 'Dieses Gerät koppeln',
			haveDevice: 'Ein gekoppeltes Gerät in der Nähe?',
			withCode: 'Stattdessen mit einem Code koppeln'
		},
		pair: {
			pageTitle: 'Dieses Gerät koppeln · libe',
			title: 'Dieses Gerät koppeln',
			subtitle: 'Gib den Code ein, der auf einem bereits gekoppelten Gerät angezeigt wird.',
			code: 'Kopplungscode',
			codeHintHtml:
				'Auf einem gekoppelten Gerät: Avatar-Menü → <strong>Neues Gerät koppeln</strong>. Codes sind 10 Minuten gültig.',
			submit: 'Gerät koppeln',
			standalone:
				'Die Home-Bildschirm-App hat eine eigene Anmeldung, getrennt von Safari – kopple sie hier einmal.',
			nothingPaired: 'Noch ist nichts gekoppelt.',
			setUpFirst: 'Richte das erste Gerät',
			withSecret: 'mit dem Setup-Secret ein.',
			lostAll: 'Alle Geräte verloren?',
			useSecret: 'Setup-Secret verwenden'
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
		pickQuest: 'Wähle eine Quest.',
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
		wrongSetupSecret: 'Falsches Setup-Secret.',
		pairCodeFormat: 'Gib den 6-stelligen Code ein, der auf deinem anderen Gerät angezeigt wird.',
		pairCodeExpired: 'Dieser Code ist abgelaufen. Erzeuge auf deinem anderen Gerät einen neuen.',
		pairCodeUsed:
			'Dieser Code wurde bereits verwendet. Erzeuge auf deinem anderen Gerät einen neuen.',
		pairCodeLocked:
			'Zu viele falsche Versuche für diesen Code. Erzeuge auf deinem anderen Gerät einen neuen.',
		pairCodeWrong: 'Falscher Code. Prüfe den Code auf deinem anderen Gerät und versuche es erneut.',
		// Einstellungen
		languageInvalid: 'Wähle eine der Sprachen.'
	}
};
