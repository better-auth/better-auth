import type { BetterAuthClientPlugin } from "@better-auth/core";
import type { Awaitable } from "../../types/helper";
import { defaultResolveMethod } from "./resolve";

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
	 * Advanced configuration options
	 */
	advanced?:
		| {
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
					| ((url: string | URL) => Awaitable<string | null>)
					| undefined;
				/**
				 * Callback fired when the last login method is retrieved (on client-side)
				 *
				 * Lets you intercept successful sign-in/up responses and extract the last used
				 * login method manually.
				 *
				 * Designed for __environments without cookie support__ (e.g. Expo, React Native),
				 * allowing you to plug in your own storage layer
				 *
				 * @example
				 * ```ts
				 * import * as SecureStore from "expo-secure-store";
				 *
				 * lastLoginMethodClient({
				 *  advanced: {
				 *      async onLastMethodRetrieved(method) {
				 *        await SecureStore.setItemAsync("last_login_method", method);
				 *      },
				 *      customGetMethod() {
				 *        return SecureStore.getItem("last_login_method");
				 *      },
				 *      customClearMethod() {
				 *        void SecureStore.deleteItemAsync("last_login_method");
				 *      },
				 *   },
				 * });
				 * ```
				 */
				onLastMethodRetrieved?:
					| ((method: string | null) => Awaitable<void>)
					| undefined;
		  }
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
		fetchPlugins: config.advanced?.onLastMethodRetrieved
			? [
					{
						id: "last-login-method-client-resolver",
						name: "Last Login Method Client Resolver",
						hooks: {
							onResponse: async (ctx) => {
								const { pathname } = new URL(
									ctx.request.url.toString(),
									"http://localhost",
								);
								const lastMethod = config.advanced?.customResolveMethod
									? await config.advanced?.customResolveMethod(pathname)
									: defaultResolveMethod({ url: pathname });
								if (!lastMethod) {
									return;
								}
								await config.advanced?.onLastMethodRetrieved!(lastMethod);
							},
						},
					},
				]
			: undefined,
		getActions() {
			const getLastUsedLoginMethod = (): string | null => {
				return config.advanced?.customGetMethod
					? config.advanced?.customGetMethod()
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
					if (config.advanced?.customClearMethod) {
						config.advanced?.customClearMethod();
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
