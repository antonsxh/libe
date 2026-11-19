// Pairing page of the libe desktop app. Talks to Rust via the Tauri IPC (local origin only).
const { invoke } = window.__TAURI__.core;
const $ = (id) => document.getElementById(id);

// ─── Language: German when the system prefers `de` over `en`, else English ──────────────
// (same rule as `localeFromLanguages` in the web app). Rust sends stable error codes with an
// English `message`; unknown codes fall back to that message.

const MESSAGES = {
	en: {
		connecting: 'Connecting…',
		checking: 'Checking this device with your libe server.',
		opening: 'Opening libe…',
		offlineTitle: 'Can’t reach your server',
		retry: 'Retry',
		change: 'Change server / Unpair',
		pairTitle: 'Pair this app',
		introBefore: 'On a device that is already paired open libe → avatar menu →',
		introMenu: 'Pair new device',
		introAfter: ', then enter the code here.',
		server: 'Server',
		code: 'Pairing code',
		codeHint: 'Codes are valid for 10 minutes.',
		name: 'Device name',
		submit: 'Pair device',
		pairing: 'Pairing…',
		platforms: { macos: 'Mac app', windows: 'Windows app', linux: 'Linux app' },
		desktopApp: 'Desktop app',
		codes: {
			serverEmpty: () => 'Enter the address of your libe server.',
			serverInvalid: () => 'That doesn’t look like a server address.',
			serverScheme: () => 'The server address must start with https:// or http://.',
			codeFormat: () => 'Enter the 6-digit code shown on your other device.',
			nameInvalid: () => 'Give this device a name (up to 60 characters).',
			notLibe: (status) => `The server answered ${status}. Is this a libe server?`,
			serverStatus: (status) => `The server answered ${status}.`,
			timeout: (server) => `${server} did not answer in time.`,
			unreachable: (server) => `Can’t reach ${server}. Check the address and your connection.`,
			signedOut: () =>
				'This device was signed out (revoked on another device). Pair it again with a new code.',
			cookieLoop: () =>
				'libe could not keep a session cookie. Check the server’s ORIGIN / HTTPS setup.',
			keychainUnavailable: (e) => `Keychain unavailable: ${e}`,
			keychainRead: (e) => `Could not read the keychain: ${e}`,
			keychainSave: (e) => `Could not save to the keychain: ${e}`,
			keychainDelete: (e) => `Could not delete the keychain entry: ${e}`
		}
	},
	de: {
		connecting: 'Verbinde …',
		checking: 'Dieses Gerät wird mit deinem libe-Server geprüft.',
		opening: 'libe wird geöffnet …',
		offlineTitle: 'Dein Server ist nicht erreichbar',
		retry: 'Erneut versuchen',
		change: 'Server wechseln / Kopplung aufheben',
		pairTitle: 'Diese App koppeln',
		introBefore: 'Öffne libe auf einem bereits gekoppelten Gerät → Avatar-Menü →',
		introMenu: 'Neues Gerät koppeln',
		introAfter: ' und gib den Code hier ein.',
		server: 'Server',
		code: 'Kopplungscode',
		codeHint: 'Codes sind 10 Minuten gültig.',
		name: 'Gerätename',
		submit: 'Gerät koppeln',
		pairing: 'Wird gekoppelt …',
		platforms: { macos: 'Mac-App', windows: 'Windows-App', linux: 'Linux-App' },
		desktopApp: 'Desktop-App',
		codes: {
			serverEmpty: () => 'Gib die Adresse deines libe-Servers ein.',
			serverInvalid: () => 'Das sieht nicht nach einer Serveradresse aus.',
			serverScheme: () => 'Die Serveradresse muss mit https:// oder http:// beginnen.',
			codeFormat: () =>
				'Gib den 6-stelligen Code ein, der auf deinem anderen Gerät angezeigt wird.',
			nameInvalid: () => 'Gib diesem Gerät einen Namen (höchstens 60 Zeichen).',
			notLibe: (status) => `Der Server antwortete mit ${status}. Ist das ein libe-Server?`,
			serverStatus: (status) => `Der Server antwortete mit ${status}.`,
			timeout: (server) => `${server} hat nicht rechtzeitig geantwortet.`,
			unreachable: (server) =>
				`${server} ist nicht erreichbar. Prüfe die Adresse und deine Verbindung.`,
			signedOut: () =>
				'Dieses Gerät wurde abgemeldet (auf einem anderen Gerät entfernt). Kopple es mit einem neuen Code erneut.',
			cookieLoop: () =>
				'libe konnte kein Sitzungs-Cookie behalten. Prüfe ORIGIN / HTTPS in der Serverkonfiguration.',
			keychainUnavailable: (e) => `Schlüsselbund nicht verfügbar: ${e}`,
			keychainRead: (e) => `Der Schlüsselbund konnte nicht gelesen werden: ${e}`,
			keychainSave: (e) => `Speichern im Schlüsselbund fehlgeschlagen: ${e}`,
			keychainDelete: (e) => `Der Schlüsselbund-Eintrag konnte nicht gelöscht werden: ${e}`
		}
	}
};

const languages = navigator.languages?.length ? navigator.languages : [navigator.language || ''];
const locale =
	languages
		.map((tag) => String(tag).toLowerCase().split('-')[0])
		.find((primary) => primary in MESSAGES) ?? 'en';
const t = MESSAGES[locale];

document.documentElement.lang = locale;
for (const el of document.querySelectorAll('[data-i18n]')) {
	const text = t[el.dataset.i18n];
	if (typeof text === 'string') el.textContent = text;
}

/** A `Problem` from Rust (`{ code, message, detail? }`) — or any other error — as text. */
function problemText(problem) {
	if (problem && typeof problem === 'object') {
		const translate = Object.hasOwn(t.codes, problem.code) ? t.codes[problem.code] : null;
		if (translate) return translate(problem.detail ?? '');
		if (typeof problem.message === 'string') return problem.message;
	}
	return String(problem);
}

// ─── Views ───────────────────────────────────────────────────────────────────

function show(view) {
	for (const v of ['busy', 'offline', 'pair']) $(`view-${v}`).hidden = v !== view;
}

function render(status) {
	if (status.state === 'connecting') {
		$('busy-title').textContent = t.opening;
		$('busy-text').textContent = status.server;
		show('busy');
	} else if (status.state === 'unreachable') {
		$('offline-text').textContent = problemText(status.error);
		show('offline');
	} else {
		if (status.server && !$('server').value) $('server').value = status.server;
		if (!$('name').value) $('name').value = t.platforms[status.platform] ?? status.name;
		$('notice').hidden = !status.notice;
		$('notice').textContent = status.notice ? problemText(status.notice) : '';
		show('pair');
		($('server').value ? $('code') : $('server')).focus();
	}
}

async function resume() {
	$('busy-title').textContent = t.connecting;
	$('busy-text').textContent = t.checking;
	show('busy');
	try {
		render(await invoke('resume'));
	} catch (e) {
		render({ state: 'pair', server: null, name: t.desktopApp, notice: e });
	}
}

$('code').addEventListener('input', (e) => {
	const digits = e.target.value.replace(/\D/g, '').slice(0, 6);
	e.target.value = digits.length > 3 ? `${digits.slice(0, 3)} ${digits.slice(3)}` : digits;
});

$('pair-form').addEventListener('submit', async (e) => {
	e.preventDefault();
	const submit = $('submit');
	$('error').hidden = true;
	submit.disabled = true;
	submit.textContent = t.pairing;
	try {
		await invoke('pair', {
			server: $('server').value,
			code: $('code').value,
			name: $('name').value,
			// The server words its own errors ("Wrong code…") in this language.
			language: languages.join(',')
		});
		$('busy-title').textContent = t.opening;
		$('busy-text').textContent = '';
		show('busy');
	} catch (err) {
		$('error').textContent = problemText(err);
		$('error').hidden = false;
	} finally {
		submit.disabled = false;
		submit.textContent = t.submit;
	}
});

$('retry').addEventListener('click', resume);
$('change').addEventListener('click', async () => {
	render(await invoke('unpair'));
});

resume();
