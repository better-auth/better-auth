import type { BetterAuthClientPlugin } from "@better-auth/core";
import type { Awaitable } from "../../types/helper";

/**
 * Configuration for the client-side last login method plugin
 */
export interface LastLoginMethodClientConfig {
	/**
	 * Name of the cookie to read the last login method from
	 * @default "better-auth.last_used_login_method"
	 */
	cookieName?: string | undefined;
	/**
	 * Custom method to get the last login method
	 * @returns The last login method
	 */
	customGetMethod?: (() => string | null) | undefined;
	/**
	 * Custom method to clear the last login method
	 */
	customClearMethod?: (() => void) | undefined;
	/**
	 * Custom resolve method for retrieving the last login method (on client-side)
	 * Only applied when `onLastMethodRetrieved` is provided.
	 */
	customResolveMethod?:
		| ((pathname: string) => Awaitable<string | null>)
		| undefined;
	/**
	 * Callback invoked when the last method is retrieved (on client-side)
	 */
	onLastMethodRetrieved?:
		| ((method: string | null) => Awaitable<void>)
		| undefined;
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
		fetchPlugins: config.onLastMethodRetrieved
			? [
					{
						id: "last-login-method-client-resolver",
						name: "Last Login Method Client Resolver",
						hooks: {
							onSuccess: async (ctx) => {
								const { pathname } = new URL(
									ctx.request.url.toString(),
									"http://localhost",
								);
								const defaultResolveMethod = (url: string) => {
									const paths = [
										"/callback/",
										"/oauth2/callback/",
										"/sign-in/email",
										"/sign-up/email",
									];
									if (paths.some((p) => url.includes(p))) {
										return url.split("/").pop();
									}
									if (url.includes("siwe")) return "siwe";
									if (url.includes("/passkey/verify-authentication"))
										return "passkey";
									return null;
								};

								const lastMethod = config.customResolveMethod
									? await config.customResolveMethod(pathname)
									: defaultResolveMethod(pathname);
								await config.onLastMethodRetrieved(lastMethod);
							},
						},
					},
				]
			: undefined,
		getActions() {
			const getLastUsedLoginMethod = (): string | null => {
				return config.customGetMethod
					? config.customGetMethod()
					: getCookieValue(cookieName);
			};

			return {
				/**
				 * Get the last used login method from cookies
				 * @returns The last used login method or null if not found
				 */
				getLastUsedLoginMethod,
				/**
				 * Clear the last used login method cookie
				 * This sets the cookie with an expiration date in the past
				 */
				clearLastUsedLoginMethod: (): void => {
					if (config.customClearMethod) {
						config.customClearMethod();
						return;
					}
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
					const lastMethod = getLastUsedLoginMethod();
					return lastMethod === method;
				},
			};
		},
	} satisfies BetterAuthClientPlugin;
};
