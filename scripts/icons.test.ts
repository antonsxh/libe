import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LOGO } from '../src/lib/logo.ts';
import { TOKENS_PATH, readTokens } from './contrast.ts';
import {
	ICON,
	MASKABLE,
	PNG_FILES,
	ROOT,
	SVG_FILES,
	encodeIco,
	iconSvg,
	logoColors,
	pngSize
} from './icons.ts';

const tokens = readTokens(readFileSync(TOKENS_PATH, 'utf8'));
const colors = logoColors(tokens);

/** A minimal PNG header (signature + IHDR) of the given size; enough for `pngSize`. */
function fakePng(size: number, extra = 0): Uint8Array {
	const png = new Uint8Array(33 + extra);
	png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
	const view = new DataView(png.buffer);
	view.setUint32(8, 13);
	png.set(
		[...'IHDR'].map((c) => c.charCodeAt(0)),
		12
	);
	view.setUint32(16, size);
	view.setUint32(20, size);
	return png;
}

describe('icon SVG', () => {
	test('colours come from the tokens: stroke = accent, dot = text, ground = bg', () => {
		expect(colors).toEqual({
			stroke: tokens.get('--accent')!,
			dot: tokens.get('--text')!,
			ground: tokens.get('--bg')!
		});
	});

	test('uses the shared geometry and colours', () => {
		const svg = iconSvg(colors, ICON);
		expect(svg).toContain(`d="${LOGO.stroke.d}"`);
		expect(svg).toContain(`stroke-width="${LOGO.stroke.width}"`);
		expect(svg).toContain(
			`<circle cx="${LOGO.dot.cx}" cy="${LOGO.dot.cy}" r="${LOGO.dot.r}" fill="${colors.dot}"/>`
		);
		expect(svg).toContain(`stroke="${colors.stroke}"`);
		expect(svg).toContain(`fill="${colors.ground}"`);
	});

	test('rounded tile vs full square, mark scaled around the centre', () => {
		expect(iconSvg(colors, ICON)).toContain('rx="7"');
		expect(iconSvg(colors, MASKABLE)).not.toContain('rx=');
		expect(iconSvg(colors, MASKABLE)).toContain(
			'translate(16 16) scale(0.78) translate(-16.4 -16)'
		);
	});

	test('the maskable mark stays inside the safe zone (radius 40 % of the size)', () => {
		// Bounding box of the ink: the path spans x 11‥22, y 7‥25 (+ half the stroke), the dot
		// its circle. Every corner of that box, scaled around the centre, lies in the circle.
		const half = LOGO.stroke.width / 2;
		const { cx, cy, r } = LOGO.dot;
		const xs = [11 - half, Math.max(22 + half, cx + r)];
		const ys = [Math.min(7 - half, cy - r), 25 + half];
		for (const x of xs) {
			for (const y of ys) {
				const d = Math.hypot(x - LOGO.center.x, y - LOGO.center.y) * MASKABLE.scale;
				expect(d).toBeLessThanOrEqual(0.4 * LOGO.viewBox);
			}
		}
	});

	test('committed SVG icons match the current tokens (run `bun scripts/icons.ts`)', () => {
		for (const { path, spec } of SVG_FILES) {
			expect(readFileSync(join(ROOT, path), 'utf8')).toBe(iconSvg(colors, spec));
		}
	});

	test('committed PNG icons have their listed sizes', () => {
		for (const { path, size } of PNG_FILES) {
			expect(pngSize(readFileSync(join(ROOT, path)))).toEqual({ width: size, height: size });
		}
	});
});

describe('ICO encoder', () => {
	test('header, directory and PNG payloads', () => {
		const pngs = [fakePng(16, 3), fakePng(32), fakePng(256, 7)];
		const ico = encodeIco(pngs);
		const view = new DataView(ico.buffer);
		expect([view.getUint16(0, true), view.getUint16(2, true), view.getUint16(4, true)]).toEqual([
			0, 1, 3
		]);
		let offset = 6 + 16 * 3;
		pngs.forEach((png, i) => {
			const at = 6 + 16 * i;
			const size = pngSize(png).width;
			expect(view.getUint8(at)).toBe(size === 256 ? 0 : size);
			expect(view.getUint8(at + 1)).toBe(size === 256 ? 0 : size);
			expect(view.getUint16(at + 4, true)).toBe(1);
			expect(view.getUint16(at + 6, true)).toBe(32);
			expect(view.getUint32(at + 8, true)).toBe(png.length);
			expect(view.getUint32(at + 12, true)).toBe(offset);
			expect(ico.subarray(offset, offset + png.length)).toEqual(png);
			offset += png.length;
		});
		expect(ico.length).toBe(offset);
	});

	test('the committed favicon.ico holds 16, 32 and 48 px PNGs', () => {
		const ico = new Uint8Array(readFileSync(join(ROOT, 'static/favicon.ico')));
		const view = new DataView(ico.buffer);
		const sizes = Array.from({ length: view.getUint16(4, true) }, (_, i) => {
			const at = 6 + 16 * i;
			const png = ico.subarray(
				view.getUint32(at + 12, true),
				view.getUint32(at + 12, true) + view.getUint32(at + 8, true)
			);
			return pngSize(png).width;
		});
		expect(sizes).toEqual([16, 32, 48]);
	});

	test('rejects non-PNG and non-square or oversized entries', () => {
		expect(() => encodeIco([new Uint8Array(40)])).toThrow('not a PNG');
		const wide = fakePng(32);
		new DataView(wide.buffer).setUint32(16, 64);
		expect(() => encodeIco([wide])).toThrow();
		expect(() => encodeIco([fakePng(512)])).toThrow();
	});
});
