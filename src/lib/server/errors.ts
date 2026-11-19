/** Error-code helpers for endpoints and form actions. */
import type { ErrorCode, I18n } from '#lib/i18n/index.ts';

/** `{ field: code }` from a pure validator → `{ field: message }` in `t`'s language. */
export function translateErrors<K extends string>(
	errors: Partial<Record<K, ErrorCode>>,
	t: I18n
): Partial<Record<K, string>> {
	const text: Partial<Record<K, string>> = {};
	for (const [field, code] of Object.entries(errors) as [K, ErrorCode | undefined][])
		if (code) text[field] = t.errors[code];
	return text;
}
