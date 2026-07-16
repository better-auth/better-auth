import type { BetterAuthOptions } from "@better-auth/core";
import { defaultMessages } from "./messages";

/**
 * Resolve the UI locale from options → Accept-Language header → "en".
 */
export function resolveUILocale(
	options: BetterAuthOptions,
	request?: Request,
): string {
	const explicit = options.ui?.locale;
	if (explicit) return explicit;

	if (request) {
		const accept = request.headers.get("accept-language");
		if (accept) {
			const first = accept.split(",")[0];
			const tag = first?.split(";")[0]?.trim();
			if (tag) return tag;
		}
	}

	return "en";
}

/**
 * Merge the built-in English defaults with any user-provided overrides.
 */
export function getUIMessages(
	options: BetterAuthOptions,
): Record<string, string> {
	const overrides = options.ui?.messages;
	if (!overrides) return defaultMessages;
	const merged = { ...defaultMessages };
	for (const [key, value] of Object.entries(overrides)) {
		if (value !== undefined) merged[key] = value;
	}
	return merged;
}

/**
 * Look up a translated string by key.
 * Returns the message for `key`, or `fallback`, or the key itself.
 */
export function t(
	messages: Record<string, string>,
	key: string,
	fallback?: string,
): string {
	return messages[key] ?? fallback ?? key;
}
