/**
 * Browser-side helpers for pairing and the installed (home-screen) app.
 */
import { deviceNameFromUA, type DeviceKind, type DeviceModel } from '#lib/auth.ts';

/** Running as an installed web app (iOS home screen, desktop PWA window)? */
export function isStandalone(): boolean {
	if (typeof window === 'undefined') return false;
	return (
		(navigator as Navigator & { standalone?: boolean }).standalone === true ||
		window.matchMedia('(display-mode: standalone)').matches
	);
}

/** The device kind a browser pairs as. */
export function clientDeviceKind(): DeviceKind {
	return isStandalone() ? 'pwa' : 'browser';
}

/**
 * Default device name (`names` = `t.deviceNames`); iPadOS reports a Mac UA, so touch support
 * disambiguates.
 */
export function clientDeviceName(names: Record<DeviceModel, string>): string {
	return deviceNameFromUA(navigator.userAgent, { touch: navigator.maxTouchPoints > 1, names });
}
