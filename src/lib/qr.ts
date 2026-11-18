/**
 * QR code → SVG path (via `qrcode-generator`, a small dependency-free encoder). Rendered as
 * our own `<svg>` so colours come from tokens; one path with horizontal runs per row.
 */
import qrcode from 'qrcode-generator';

export interface QrShape {
	/** Modules per side (without quiet zone). */
	size: number;
	/** Path in module units, origin = top-left module. */
	path: string;
}

export function qrShape(text: string, level: 'L' | 'M' | 'Q' | 'H' = 'M'): QrShape {
	const qr = qrcode(0, level);
	qr.addData(text, 'Byte');
	qr.make();
	const size = qr.getModuleCount();
	let path = '';
	for (let y = 0; y < size; y++) {
		let x = 0;
		while (x < size) {
			if (!qr.isDark(y, x)) {
				x++;
				continue;
			}
			const start = x;
			while (x < size && qr.isDark(y, x)) x++;
			path += `M${start} ${y}h${x - start}v1h${start - x}z`;
		}
	}
	return { size, path };
}
