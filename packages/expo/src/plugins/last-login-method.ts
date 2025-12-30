import type { Awaitable, BetterAuthClientPlugin } from "@better-auth/core";

export interface LastLoginMethodClientConfig {
	storage: {
		setItem: (key: string, value: string) => any;
		getItem: (key: string) => string | null;
		deleteItemAsync: (key: string) => Awaitable<void>;
	};
	/**
	 * Prefix for local storage keys (e.g., "my-app_last_login_method")
	 * @default "better-auth"
	 */
	storagePrefix?: string | undefined;
	/**
	 * Custom resolve method for retrieving the last login method
	 */
	customResolveMethod?:
		| ((url: string | URL) => Awaitable<string | undefined | null>)
		| undefined;
}

const paths = [
	"/callback/",
	"/oauth2/callback/",
	"/sign-in/email",
	"/sign-up/email",
];
const defaultResolveMethod = (url: string | URL) => {
	const { pathname } = new URL(url.toString(), "http://localhost");

	if (paths.some((p) => pathname.includes(p))) {
		return pathname.split("/").pop();
	}
	if (pathname.includes("siwe")) return "siwe";
	if (pathname.includes("/passkey/verify-authentication")) {
		return "passkey";
	}

	return;
};

export const lastLoginMethodClient = (config: LastLoginMethodClientConfig) => {
	const resolveMethod = config.customResolveMethod || defaultResolveMethod;
	const storagePrefix = config.storagePrefix || "better-auth";
	const lastLoginMethodName = `${storagePrefix}_last_login_method`;
	const storage = config.storage;

	return {
		id: "last-login-method-expo",
		fetchPlugins: [
			{
				id: "last-login-method-expo",
				name: "Last Login Method",
				hooks: {
					onResponse: async (ctx) => {
						const lastMethod = await resolveMethod(ctx.request.url);
						if (!lastMethod) {
							return;
						}

						await storage.setItem(lastLoginMethodName, lastMethod);
					},
				},
			},
		],
		getActions() {
			return {
				/**
				 * Get the last used login method from storage
				 *
				 * @returns The last used login method or null if not found
				 */
				getLastUsedLoginMethod: (): string | null => {
					return storage.getItem(lastLoginMethodName);
				},
				/**
				 * Clear the last used login method from storage
				 */
				clearLastUsedLoginMethod: async () => {
					await storage.deleteItemAsync(lastLoginMethodName);
				},
				/**
				 * Check if a specific login method was the last used
				 * @param method The method to check
				 * @returns True if the method was the last used, false otherwise
				 */
				isLastUsedLoginMethod: (method: string): boolean => {
					const lastMethod = storage.getItem(lastLoginMethodName);
					return lastMethod === method;
				},
			};
		},
	} satisfies BetterAuthClientPlugin;
};
