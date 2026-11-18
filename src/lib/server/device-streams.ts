/**
 * Open long-lived connections (timer SSE) per device, so revoking a device can close its
 * streams immediately. In-process only (single server); the SSE heartbeat re-checks the
 * database as a fallback.
 */
type Close = () => void;

const streams = new Map<string, Set<Close>>();

export function registerDeviceStream(deviceId: string, close: Close): () => void {
	let set = streams.get(deviceId);
	if (!set) streams.set(deviceId, (set = new Set()));
	set.add(close);
	return () => {
		set.delete(close);
		if (set.size === 0) streams.delete(deviceId);
	};
}

export function closeDeviceStreams(deviceId: string): void {
	const set = streams.get(deviceId);
	if (!set) return;
	streams.delete(deviceId);
	for (const close of set) {
		try {
			close();
		} catch {
			// already closed
		}
	}
}
