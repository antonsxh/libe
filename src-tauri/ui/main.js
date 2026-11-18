// Pairing page of the libe desktop app. Talks to Rust via the Tauri IPC (local origin only).
const { invoke } = window.__TAURI__.core;
const $ = (id) => document.getElementById(id);

function show(view) {
	for (const v of ['busy', 'offline', 'pair']) $(`view-${v}`).hidden = v !== view;
}

function render(status) {
	if (status.state === 'connecting') {
		$('busy-title').textContent = 'Opening libe…';
		$('busy-text').textContent = status.server;
		show('busy');
	} else if (status.state === 'unreachable') {
		$('offline-text').textContent = status.error;
		show('offline');
	} else {
		if (status.server && !$('server').value) $('server').value = status.server;
		if (!$('name').value) $('name').value = status.name;
		$('notice').hidden = !status.notice;
		$('notice').textContent = status.notice ?? '';
		show('pair');
		($('server').value ? $('code') : $('server')).focus();
	}
}

async function resume() {
	$('busy-title').textContent = 'Connecting…';
	$('busy-text').textContent = 'Checking this device with your libe server.';
	show('busy');
	try {
		render(await invoke('resume'));
	} catch (e) {
		render({ state: 'pair', server: null, name: 'Desktop app', notice: String(e) });
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
	submit.textContent = 'Pairing…';
	try {
		await invoke('pair', {
			server: $('server').value,
			code: $('code').value,
			name: $('name').value
		});
		$('busy-title').textContent = 'Opening libe…';
		$('busy-text').textContent = '';
		show('busy');
	} catch (err) {
		$('error').textContent = String(err);
		$('error').hidden = false;
	} finally {
		submit.disabled = false;
		submit.textContent = 'Pair device';
	}
});

$('retry').addEventListener('click', resume);
$('change').addEventListener('click', async () => {
	render(await invoke('unpair'));
});

resume();
