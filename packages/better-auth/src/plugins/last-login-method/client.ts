import type { BetterAuthClientPlugin } from "@better-auth/core";

/**
 * Configuration for the client-side last login method plugin
 */
export interface LastLoginMethodClientConfig {
	/**
	 * Name of the cookie to read the last login method from
	 * @default "better-auth.last_used_login_method"
	 */
	cookieName?: string | undefined;
}

function getCookieValue(name: string): string | null {
	if (typeof document === "undefined") {
		return null;
	}

	const cookie = document.cookie
		.split("; ")
		.find((row) => row.startsWith(`${name}=`));

	return cookie ? cookie.split("=")[1]! : null;
}

/**
 * Client-side plugin to retrieve the last used login method
 */
export const lastLoginMethodClient = (
	config: LastLoginMethodClientConfig = {},
) => {
	const cookieName = config.cookieName || "better-auth.last_used_login_method";

	return {
		id: "last-login-method-client",
		getActions() {
			return {
				/**
				 * Get the last used login method from cookies
				 * @returns The last used login method or null if not found
				 */
				getLastUsedLoginMethod: (): string | null => {
					return getCookieValue(cookieName);
				},
				/**
				 * Clear the last used login method cookie
				 * This sets the cookie with an expiration date in the past
				 */
				clearLastUsedLoginMethod: (): void => {
					if (typeof document !== "undefined") {
						document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
					}
				},
				/**
				 * Check if a specific login method was the last used
				 * @param method The method to check
				 * @returns True if the method was the last used, false otherwise
				 */
				isLastUsedLoginMethod: (method: string): boolean => {
					const lastMethod = getCookieValue(cookieName);
					return lastMethod === method;
				},
			};
		},
	} satisfies BetterAuthClientPlugin;
};
