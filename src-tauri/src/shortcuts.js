// Reload (Ctrl+R) and Quit (Ctrl+Q) on Linux and Windows, where the app has no menu bar (on
// macOS the menu's accelerators handle ⌘R / ⌘Q and this script is not injected). `lib.rs`
// adds it to every page of the main webview: the bundled pairing page and the paired server's
// pages, which may call `app_quit` (runtime capability). Capture phase: pages can't swallow it.
window.addEventListener(
	'keydown',
	(e) => {
		if (!e.ctrlKey || e.altKey || e.metaKey || e.shiftKey || e.repeat) return;
		const key = e.key.toLowerCase();
		if (key === 'r') {
			e.preventDefault();
			location.reload();
		} else if (key === 'q') {
			e.preventDefault();
			window.__TAURI_INTERNALS__?.invoke('app_quit');
		}
	},
	true
);
