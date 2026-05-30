import type { BetterAuthClientPlugin } from "@better-auth/core";
import {
	parseCookies,
	SECURE_COOKIE_PREFIX,
	stripSecureCookiePrefix,
} from "../../cookies/cookie-utils";
import { PACKAGE_VERSION } from "../../version";
import { LAST_USED_LOGIN_METHOD_COOKIE_NAME } from "./constant";

/**
 * Finds the last login method cookie, matching by base name so it resolves
 * regardless of the server's cookiePrefix/`__Secure-`. An explicit name matches
 * verbatim. Returns the matched name and value, or null.
 */
function findLastLoginCookie(
	explicitName?: string,
): { name: string; value: string } | null {
	if (typeof document === "undefined") return null;

	const parsed = parseCookies(document.cookie);
	if (explicitName) {
		for (const name of [
			explicitName,
			`${SECURE_COOKIE_PREFIX}${explicitName}`,
		]) {
			const value = parsed.get(name);
			if (value !== undefined) return { name, value };
		}
		return null;
	}
	for (const [name, value] of parsed) {
		const base = stripSecureCookiePrefix(name);
		if (
			base === LAST_USED_LOGIN_METHOD_COOKIE_NAME ||
			base.endsWith(`.${LAST_USED_LOGIN_METHOD_COOKIE_NAME}`)
		) {
			return { name, value };
		}
	}
	return null;
}

/**
 * Deletes a cookie by writing it back with `Max-Age=0`.
 */
function deleteDocumentCookie(name: string): void {
	if (typeof document === "undefined") return;

	const parts = [`${name}=`, "path=/", "Max-Age=0"];
	if (name.startsWith(SECURE_COOKIE_PREFIX)) parts.push("Secure");
	document.cookie = parts.join("; ");
}

/**
 * Configuration for the client-side last login method plugin
 */
export interface LastLoginMethodClientConfig {
	/**
	 * Full literal cookie name to read. Left unset, the cookie is resolved
	 * automatically regardless of `advanced.cookiePrefix`. Set this to match a
	 * custom server-side `cookieName`.
	 */
	cookieName?: string | undefined;
}

/**
 * Client-side plugin to retrieve the last used login method
 */
export const lastLoginMethodClient = (
	config: LastLoginMethodClientConfig = {},
) => {
	const explicitName = config.cookieName;

	return {
		id: "last-login-method-client",
		version: PACKAGE_VERSION,
		getActions() {
			return {
				/**
				 * Get the last used login method from cookies
				 * @returns The last used login method or null if not found
				 */
				getLastUsedLoginMethod: (): string | null => {
					return findLastLoginCookie(explicitName)?.value ?? null;
				},
				/**
				 * Clear the last used login method cookie, if present
				 */
				clearLastUsedLoginMethod: (): void => {
					const name = findLastLoginCookie(explicitName)?.name;
					if (name) deleteDocumentCookie(name);
				},
				/**
				 * Check if a specific login method was the last used
				 * @param method The method to check
				 * @returns True if the method was the last used, false otherwise
				 */
				isLastUsedLoginMethod: (method: string): boolean => {
					const lastMethod = findLastLoginCookie(explicitName)?.value ?? null;
					return lastMethod === method;
				},
			};
		},
	} satisfies BetterAuthClientPlugin;
};
