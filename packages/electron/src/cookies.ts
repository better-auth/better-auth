import { parseSetCookieHeader } from "better-auth/cookies";

interface StoredCookie {
	value: string;
	expires: string | null;
}

export function getSetCookie(header: string, prevCookie?: string | undefined) {
	const parsed = parseSetCookieHeader(header);
	let toSetCookie: Record<string, StoredCookie> = {};
	parsed.forEach((cookie, key) => {
		const expiresAt = cookie["expires"];
		const maxAge = cookie["max-age"];
		const expires = maxAge
			? new Date(Date.now() + Number(maxAge) * 1000)
			: expiresAt
				? new Date(String(expiresAt))
				: null;
		toSetCookie[key] = {
			value: cookie["value"],
			expires: expires ? expires.toISOString() : null,
		};
	});
	if (prevCookie) {
		try {
			const prevCookieParsed = JSON.parse(prevCookie);
			toSetCookie = {
				...prevCookieParsed,
				...toSetCookie,
			};
		} catch {
			//
		}
	}
	return JSON.stringify(toSetCookie);
}

export function getCookie(cookie: string) {
	let parsed = {} as Record<string, StoredCookie>;
	try {
		parsed = JSON.parse(cookie) as Record<string, StoredCookie>;
	} catch (_e) {}
	const toSend = Object.entries(parsed).reduce((acc, [key, value]) => {
		if (value.expires && new Date(value.expires) < new Date()) {
			return acc;
		}
		return `${acc}; ${key}=${value.value}`;
	}, "");
	return toSend;
}

/**
 * Compare if session cookies have actually changed by comparing their values.
 * Ignores expiry timestamps that naturally change on each request.
 *
 * @param prevCookie - Previous cookie JSON string
 * @param newCookie - New cookie JSON string
 * @returns true if session cookies have changed, false otherwise
 */
export function hasSessionCookieChanged(
	prevCookie: string | null,
	newCookie: string,
): boolean {
	if (!prevCookie) return true;

	try {
		const prev = JSON.parse(prevCookie) as Record<string, StoredCookie>;
		const next = JSON.parse(newCookie) as Record<string, StoredCookie>;

		// Get all session-related cookie keys (session_token, session_data)
		const sessionKeys = new Set<string>();
		Object.keys(prev).forEach((key) => {
			if (key.includes("session_token") || key.includes("session_data")) {
				sessionKeys.add(key);
			}
		});
		Object.keys(next).forEach((key) => {
			if (key.includes("session_token") || key.includes("session_data")) {
				sessionKeys.add(key);
			}
		});

		// Compare the values of session cookies (ignore expires timestamps)
		for (const key of sessionKeys) {
			const prevValue = prev[key]?.value;
			const nextValue = next[key]?.value;
			if (prevValue !== nextValue) {
				return true;
			}
		}

		return false;
	} catch {
		// If parsing fails, assume cookie changed
		return true;
	}
}

/**
 * Check if the Set-Cookie header contains better-auth cookies.
 * This prevents infinite refetching when non-better-auth cookies (like third-party cookies) change.
 *
 * Supports multiple cookie naming patterns:
 * - Default: "better-auth.session_token", "better-auth-passkey", "__Secure-better-auth.session_token"
 * - Custom prefix: "myapp.session_token", "myapp-passkey", "__Secure-myapp.session_token"
 * - Custom full names: "my_custom_session_token", "custom_session_data"
 * - No prefix (cookiePrefix=""): matches any cookie with known suffixes
 * - Multiple prefixes: ["better-auth", "my-app"] matches cookies starting with any of the prefixes
 *
 * @param setCookieHeader - The Set-Cookie header value
 * @param cookiePrefix - The cookie prefix(es) to check for. Can be a string, array of strings, or empty string.
 * @returns true if the header contains better-auth cookies, false otherwise
 */
export function hasBetterAuthCookies(
	setCookieHeader: string,
	cookiePrefix: string | string[],
): boolean {
	const cookies = parseSetCookieHeader(setCookieHeader);
	const cookieSuffixes = ["session_token", "session_data"];
	const prefixes = Array.isArray(cookiePrefix) ? cookiePrefix : [cookiePrefix];

	// Check if any cookie is a better-auth cookie
	for (const name of cookies.keys()) {
		// Remove __Secure- prefix if present for comparison
		const nameWithoutSecure = name.startsWith("__Secure-")
			? name.slice(9)
			: name;

		// Check against all provided prefixes
		for (const prefix of prefixes) {
			if (prefix) {
				// When prefix is provided, check if cookie starts with the prefix
				// This matches all better-auth cookies including session cookies, passkey cookies, etc.
				if (nameWithoutSecure.startsWith(prefix)) {
					return true;
				}
			} else {
				// When prefix is empty, check for common better-auth cookie patterns
				for (const suffix of cookieSuffixes) {
					if (nameWithoutSecure.endsWith(suffix)) {
						return true;
					}
				}
			}
		}
	}
	return false;
}
