/**
 * Generates every static icon from the mark in `src/lib/logo.ts` and the colours in
 * `src/lib/styles/tokens.css` (stroke `--accent`, dot `--text`, ground `--bg`):
 *
 *   bun scripts/icons.ts
 *
 * Writes `static/favicon.svg` (+ the README's `assets/icon.svg`), the PNGs in `static/` at
 * their sizes, `static/favicon.ico` (16/32/48) and the desktop app's `src-tauri/icons/` (a
 * 1024² PNG through `tauri icon`; only the files that already exist there are replaced).
 * PNGs are rasterised by Playwright's Chromium (`bunx playwright install chromium` once).
 *
 * The SVG builder, the icon list and the ICO encoder are pure exports for `icons.test.ts`,
 * which also fails when the committed `favicon.svg` no longer matches the tokens.
 */
import {
	copyFileSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOGO, LOGO_TOKENS } from '../src/lib/logo.ts';
import { TOKENS_PATH, readTokens, resolveColor, toHex } from './contrast.ts';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));

export type LogoColors = { stroke: string; dot: string; ground: string };

/** The mark's colours as hex, resolved from the `tokens.css` declarations. */
export function logoColors(tokens: Map<string, string>): LogoColors {
	const hex = (token: string) => toHex(resolveColor(`var(${token})`, tokens));
	return {
		stroke: hex(LOGO_TOKENS.stroke),
		dot: hex(LOGO_TOKENS.dot),
		ground: hex(LOGO_TOKENS.ground)
	};
}

/**
 * How the mark sits on its tile: `scale` around the tile centre (1 = the logo's own size in
 * the 32 viewBox), and the tile either a rounded square on transparency or the full square
 * (opaque: Apple touch icon, maskable PWA icon — the platform applies its own mask).
 */
export type IconSpec = { scale: number; tile: 'rounded' | 'full' };

export const TILE_RADIUS = 7;
/** Favicons, the PWA's "any" icons, the desktop app. */
export const ICON: IconSpec = { scale: 1, tile: 'rounded' };
/** iOS rounds the corners itself and shows transparency as black. */
export const APPLE: IconSpec = { scale: 0.92, tile: 'full' };
/** Mark inside the maskable safe zone (a circle of 40 % of the size around the centre). */
export const MASKABLE: IconSpec = { scale: 0.78, tile: 'full' };

/** The mark as a standalone SVG document (viewBox only; the size comes from the page). */
export function iconSvg(colors: LogoColors, spec: IconSpec): string {
	const n = LOGO.viewBox;
	const rx = spec.tile === 'rounded' ? ` rx="${TILE_RADIUS}"` : '';
	const { stroke, dot, center } = LOGO;
	return [
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}">`,
		`  <rect width="${n}" height="${n}"${rx} fill="${colors.ground}"/>`,
		`  <g transform="translate(${n / 2} ${n / 2}) scale(${spec.scale}) translate(-${center.x} -${center.y})">`,
		`    <path d="${stroke.d}" fill="none" stroke="${colors.stroke}" stroke-width="${stroke.width}" stroke-linecap="round"/>`,
		`    <circle cx="${dot.cx}" cy="${dot.cy}" r="${dot.r}" fill="${colors.dot}"/>`,
		`  </g>`,
		`</svg>`,
		``
	].join('\n');
}

/** SVG files written as they are (repo-relative). */
export const SVG_FILES: { path: string; spec: IconSpec }[] = [
	{ path: 'static/favicon.svg', spec: ICON },
	{ path: 'assets/icon.svg', spec: ICON }
];

/** PNG files rendered at their pixel size (repo-relative). */
export const PNG_FILES: { path: string; size: number; spec: IconSpec }[] = [
	{ path: 'static/favicon-32.png', size: 32, spec: ICON },
	{ path: 'static/apple-touch-icon.png', size: 180, spec: APPLE },
	{ path: 'static/icons/icon-192.png', size: 192, spec: ICON },
	{ path: 'static/icons/icon-512.png', size: 512, spec: ICON },
	{ path: 'static/icons/icon-maskable-512.png', size: 512, spec: MASKABLE }
];

export const ICO_FILE = { path: 'static/favicon.ico', sizes: [16, 32, 48], spec: ICON };

/**
 * `tauri icon` input; its outputs replace only the files already in `dir`. The 1024² input
 * itself is kept as `source` (`tauri icon` writes that file at 512² only).
 */
export const TAURI_ICONS = { dir: 'src-tauri/icons', size: 1024, spec: ICON, source: 'icon.png' };

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Width and height from a PNG's IHDR chunk. */
export function pngSize(png: Uint8Array): { width: number; height: number } {
	const isPng = PNG_SIGNATURE.every((b, i) => png[i] === b);
	const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
	if (!isPng || png.length < 24 || String.fromCharCode(...png.subarray(12, 16)) !== 'IHDR') {
		throw new Error('not a PNG');
	}
	return { width: view.getUint32(16), height: view.getUint32(20) };
}

/**
 * An ICO file holding the given PNGs (square, ≤ 256 px) as PNG-compressed entries, which
 * every current browser and Windows since Vista read.
 */
export function encodeIco(pngs: Uint8Array[]): Uint8Array {
	const HEADER = 6;
	const ENTRY = 16;
	let offset = HEADER + ENTRY * pngs.length;
	const out = new Uint8Array(offset + pngs.reduce((sum, p) => sum + p.length, 0));
	const view = new DataView(out.buffer);
	view.setUint16(0, 0, true); // reserved
	view.setUint16(2, 1, true); // type: icon
	view.setUint16(4, pngs.length, true);
	pngs.forEach((png, i) => {
		const { width, height } = pngSize(png);
		if (width !== height || width > 256)
			throw new Error(`ICO entry must be square ≤ 256: ${width}×${height}`);
		const at = HEADER + ENTRY * i;
		view.setUint8(at, width % 256); // 0 means 256
		view.setUint8(at + 1, height % 256);
		view.setUint8(at + 2, 0); // no palette
		view.setUint8(at + 3, 0); // reserved
		view.setUint16(at + 4, 1, true); // colour planes
		view.setUint16(at + 6, 32, true); // bits per pixel
		view.setUint32(at + 8, png.length, true);
		view.setUint32(at + 12, offset, true);
		out.set(png, offset);
		offset += png.length;
	});
	return out;
}

async function main() {
	const colors = logoColors(readTokens(readFileSync(TOKENS_PATH, 'utf8')));
	const file = (path: string) => join(ROOT, path);
	const write = (path: string, data: string | Uint8Array) => {
		writeFileSync(file(path), data);
		console.log(`wrote ${path}`);
	};

	for (const { path, spec } of SVG_FILES) write(path, iconSvg(colors, spec));

	const { chromium } = await import('@playwright/test');
	const browser = await chromium.launch();
	const page = await browser.newPage({ deviceScaleFactor: 1 });
	const render = async (spec: IconSpec, size: number): Promise<Uint8Array> => {
		await page.setViewportSize({ width: size, height: size });
		await page.setContent(
			`<!doctype html><style>html,body{margin:0;background:transparent}` +
				`svg{display:block;width:${size}px;height:${size}px}</style>${iconSvg(colors, spec)}`
		);
		const png = await page.screenshot({
			clip: { x: 0, y: 0, width: size, height: size },
			omitBackground: spec.tile === 'rounded'
		});
		const actual = pngSize(png);
		if (actual.width !== size || actual.height !== size) {
			throw new Error(`rendered ${actual.width}×${actual.height}, expected ${size}²`);
		}
		return png;
	};

	try {
		for (const { path, size, spec } of PNG_FILES) write(path, await render(spec, size));

		const icoPngs: Uint8Array[] = [];
		for (const size of ICO_FILE.sizes) icoPngs.push(await render(ICO_FILE.spec, size));
		write(ICO_FILE.path, encodeIco(icoPngs));

		const tmp = mkdtempSync(join(tmpdir(), 'libe-icons-'));
		try {
			const source = join(tmp, 'icon.png');
			writeFileSync(source, await render(TAURI_ICONS.spec, TAURI_ICONS.size));
			const out = join(tmp, 'out');
			const tauri = Bun.spawnSync([process.execPath, 'run', 'tauri', 'icon', source, '-o', out], {
				cwd: ROOT,
				stdout: 'inherit',
				stderr: 'inherit'
			});
			if (tauri.exitCode !== 0) throw new Error(`tauri icon failed (exit ${tauri.exitCode})`);
			const generated = new Set(readdirSync(out));
			for (const name of readdirSync(file(TAURI_ICONS.dir))) {
				const from = name === TAURI_ICONS.source ? source : join(out, name);
				if (from !== source && !generated.has(name))
					throw new Error(`tauri icon did not produce ${name}`);
				copyFileSync(from, file(join(TAURI_ICONS.dir, name)));
				console.log(`wrote ${TAURI_ICONS.dir}/${name}`);
			}
		} finally {
			rmSync(tmp, { recursive: true, force: true });
		}
	} finally {
		await browser.close();
	}
}

if (import.meta.main) await main();
