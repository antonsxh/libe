import { getTimerSnapshot } from '#lib/server/timer.ts';
import type { LayoutServerLoad } from './$types';

/** The timer snapshot seeds the client store (SSR renders running cards / nav chip). */
export const load = (async () => ({ timer: await getTimerSnapshot() })) satisfies LayoutServerLoad;
