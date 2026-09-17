import type {
	BetterAuthClientPlugin,
	ClientFetchOption,
	ClientStore,
	CookieSecurity,
} from "@better-auth/core";
import type { Session, User } from "@better-auth/core/db";
import { safeJSONParse } from "@better-auth/core/utils/json";
import {
	COOKIE_SECURITY_PREFIXES,
	parseSetCookieHeader,
	stripCookieSecurityPrefix,
} from "better-auth/cookies/utils";
import Constants from "expo-constants";
import * as Linking from "expo-linking";
import { Platform } from "react-native";
import type { ExpoClientStorage } from "./client-storage";
import { createManagedStorage } from "./client-storage";
import { setupExpoFocusManager } from "./focus-manager";
import { setupExpoOnlineManager } from "./online-manager";
import { PACKAGE_VERSION } from "./version";

export type { ExpoClientStorage } from "./client-storage";
export { normalizeCookieName, storageAdapter } from "./client-storage";

if (Platform.OS !== "web") {
	setupExpoFocusManager();
	setupExpoOnlineManager();
}

interface ExpoClientOptions {
	scheme?: string | undefined;
	storage: ExpoClientStorage;
	/**
	 * Prefix for local storage keys (e.g., "my-app_cookie", "my-app_session_data")
	 * @default "better-auth"
	 */
	storagePrefix?: string | undefined;
	/**
	 * Namespace(s) for server cookie names to filter (e.g., "better-auth.session_token")
	 * This is used to identify which cookies belong to better-auth to prevent
	 * infinite refetching when third-party cookies are set.
	 * Can be a single string or an array of strings to match multiple namespaces.
	 * @default "better-auth"
	 * @example "better-auth"
	 * @example ["better-auth", "my-app"]
	 */
	cookieNamespace?: string | string[] | undefined;
	/**
	 * @deprecated Use `cookieNamespace`.
	 * This option will be removed in a future minor release.
	 */
	cookiePrefix?: string | string[] | undefined;
	/**
	 * Match the server's explicit `advanced.cookieSecurity` setting.
	 * Host mode reads only `__Host-` OAuth state cookies.
	 */
	cookieSecurity?: CookieSecurity | undefined;
	disableCache?: boolean | undefined;
	/**
	 * Options to customize the Expo web browser behavior when opening authentication
	 * sessions. These are passed directly to `expo-web-browser`'s
	 * `Browser.openBrowserAsync`.
	 *
	 * For example, on iOS you can use `{ preferEphemeralSession: true }` to prevent
	 * the authentication session from sharing cookies with the user's default
	 * browser session:
	 *
	 * ```ts
	 * const client = createClient({
	 *   expo: {
	 *     webBrowserOptions: {
	 *       preferEphemeralSession: true,
	 *     },
	 *   },
	 * });
	 * ```
	 */
	webBrowserOptions?: import("expo-web-browser").AuthSessionOpenOptions;
}

interface StoredCookie {
	value: string;
	expires: string | null;
}

function defineExpoClientPlugin<Plugin extends BetterAuthClientPlugin>(
	plugin: Plugin,
): Plugin {
	return plugin;
}

export function getSetCookie(header: string, prevCookie?: string | undefined) {
	const parsed = parseSetCookieHeader(header);
	const toSetCookie =
		safeJSONParse<Record<string, StoredCookie>>(prevCookie) ?? {};
	parsed.forEach((cookie, key) => {
		const expiresAt = cookie["expires"];
		const maxAge = cookie["max-age"];
		if (maxAge !== undefined && Number(maxAge) <= 0) {
			delete toSetCookie[key];
			return;
		}
		const expires = maxAge
			? new Date(Date.now() + Number(maxAge) * 1000)
			: expiresAt
				? new Date(String(expiresAt))
				: null;
		if (expires && expires.getTime() <= Date.now()) {
			delete toSetCookie[key];
			return;
		}
		toSetCookie[key] = {
			value: cookie["value"],
			expires: expires ? expires.toISOString() : null,
		};
	});
	return JSON.stringify(toSetCookie);
}

export function getCookie(cookie: string | null) {
	const parsed = safeJSONParse<Record<string, StoredCookie>>(cookie) ?? {};
	const toSend = Object.entries(parsed).reduce((acc, [key, value]) => {
		if (value.expires && new Date(value.expires) < new Date()) {
			return acc;
		}
		return acc ? `${acc}; ${key}=${value.value}` : `${key}=${value.value}`;
	}, "");
	return toSend;
}

function getOAuthStateValue(
	cookieJson: string | null,
	cookieNamespace: string | string[],
	cookieSecurity?: CookieSecurity,
): string | null {
	if (!cookieJson) return null;

	const parsed = safeJSONParse<Record<string, StoredCookie>>(cookieJson);
	if (!parsed) return null;

	const namespaces = Array.isArray(cookieNamespace)
		? cookieNamespace
		: [cookieNamespace];
	const selectedPrefix = cookieSecurity
		? COOKIE_SECURITY_PREFIXES[cookieSecurity]
		: undefined;

	for (const namespace of namespaces) {
		// Cookie strategy uses: <namespace>.oauth_state.
		const name = `${namespace}.oauth_state`;
		const candidates =
			selectedPrefix !== undefined
				? [`${selectedPrefix}${name}`]
				: [`${COOKIE_SECURITY_PREFIXES.secure}${name}`, name];

		for (const name of candidates) {
			const value = parsed?.[name]?.value;
			if (value) return value;
		}
	}

	return null;
}

function getOrigin(scheme: string) {
	const schemeURI = Linking.createURL("", { scheme });
	return schemeURI;
}

/**
 * Compare if session cookies have actually changed by comparing their values.
 * Ignores expiry timestamps that naturally change on each request.
 *
 * @param prevCookie - Previous cookie JSON string
 * @param newCookie - New cookie JSON string
 * @returns true if session cookies have changed, false otherwise
 */
function hasSessionCookieChanged(
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
 * - Custom namespace: "myapp.session_token", "myapp-passkey", "__Secure-myapp.session_token"
 * - Custom full names: "my_custom_session_token", "custom_session_data"
 * - No namespace (cookieNamespace=""): matches any cookie with known suffixes
 * - Multiple namespaces: ["better-auth", "my-app"] matches cookies starting with any namespace
 *
 * @param setCookieHeader - The Set-Cookie header value
 * @param cookieNamespace - The cookie namespace(s) to check for. Can be a string, array of strings, or empty string.
 * @returns true if the header contains better-auth cookies, false otherwise
 */
export function hasBetterAuthCookies(
	setCookieHeader: string,
	cookieNamespace: string | string[],
): boolean {
	const cookies = parseSetCookieHeader(setCookieHeader);
	const cookieSuffixes = ["session_token", "session_data"];
	const namespaces = Array.isArray(cookieNamespace)
		? cookieNamespace
		: [cookieNamespace];

	// Check if any cookie is a better-auth cookie
	for (const name of cookies.keys()) {
		// Compare the logical name without an RFC cookie security prefix.
		const logicalName = stripCookieSecurityPrefix(name);

		// Check against all provided namespaces
		for (const namespace of namespaces) {
			if (namespace) {
				// When a namespace is provided, check if the cookie starts with it.
				// This matches all better-auth cookies including session cookies, passkey cookies, etc.
				if (logicalName.startsWith(namespace)) {
					return true;
				}
			} else {
				// When the namespace is empty, check for common better-auth cookie patterns.
				for (const suffix of cookieSuffixes) {
					if (logicalName.endsWith(suffix)) {
						return true;
					}
				}
			}
		}
	}
	return false;
}

export const expoClient = (opts: ExpoClientOptions) => {
	if (opts.cookieNamespace !== undefined && opts.cookiePrefix !== undefined) {
		throw new TypeError(
			"Use either cookieNamespace or cookiePrefix, not both.",
		);
	}
	let store: ClientStore | null = null;
	const storagePrefix = opts?.storagePrefix || "better-auth";
	const cookieName = `${storagePrefix}_cookie`;
	const localCacheName = `${storagePrefix}_session_data`;
	const storage = createManagedStorage(opts.storage);
	const isWeb = Platform.OS === "web";
	const cookieNamespace =
		opts.cookieNamespace ?? opts.cookiePrefix ?? "better-auth";
	let sessionCacheHydration: Promise<void> | undefined;
	const restoreSessionCache = async () => {
		if (isWeb || opts?.disableCache) {
			return;
		}

		const sessionAtom = store?.atoms.session;
		if (!sessionAtom) {
			return;
		}
		const initialSessionState = sessionAtom.get();
		if (initialSessionState.data !== null) {
			return;
		}

		const raw = await storage.getItemAsync(localCacheName);
		const cached = raw
			? safeJSONParse<{ user: User; session: Session }>(raw)
			: null;
		const expiresAt = cached?.session?.expiresAt;
		const expiresAtMs = expiresAt ? new Date(expiresAt).getTime() : Number.NaN;
		const fresh =
			!!cached?.user?.id && !!cached.session?.id && expiresAtMs > Date.now();
		if (fresh && sessionAtom.get() === initialSessionState) {
			sessionAtom.set({
				...initialSessionState,
				data: cached,
				error: null,
			});
		}
	};
	const hydrateSessionCache = () => {
		if (!sessionCacheHydration) {
			sessionCacheHydration = restoreSessionCache().catch((error) => {
				sessionCacheHydration = undefined;
				throw error;
			});
		}
		return sessionCacheHydration;
	};
	const clearSessionCache = async () => {
		await storage.setItemAsync(cookieName, "{}");
		store?.atoms.session?.set({
			...store.atoms.session.get(),
			data: null,
			error: null,
			isPending: false,
		});
		await storage.setItemAsync(localCacheName, "{}");
	};

	const rawScheme =
		opts?.scheme || Constants.expoConfig?.scheme || Constants.platform?.scheme;
	const scheme = Array.isArray(rawScheme) ? rawScheme[0] : rawScheme;

	if (!scheme && !isWeb) {
		throw new Error(
			"Scheme not found in app.json. Please provide a scheme in the options.",
		);
	}
	return defineExpoClientPlugin({
		id: "expo",
		version: PACKAGE_VERSION,
		getActions(_fetch: unknown, $store) {
			store = $store;
			return {
				/**
				 * Get the stored cookie.
				 *
				 * @example
				 * ```ts
				 * const cookie = await client.getCookie();
				 * fetch("https://api.example.com", {
				 * 	headers: {
				 * 		cookie,
				 * 	},
				 * });
				 * ```
				 */
				getCookie: async () => {
					const storedCookie = await storage.getItemAsync(cookieName);
					return getCookie(storedCookie);
				},
			};
		},
		fetchPlugins: [
			{
				id: "expo",
				name: "Expo",
				hooks: {
					async onSuccess(context) {
						if (isWeb) return;
						const { pathname } = new URL(context.request.url);
						const setCookie = context.response.headers.get("set-cookie");
						if (setCookie) {
							// Only process and notify if the Set-Cookie header contains better-auth cookies
							// This prevents infinite refetching when other cookies (like Cloudflare's __cf_bm) are present
							if (hasBetterAuthCookies(setCookie, cookieNamespace)) {
								const update = await storage.updateItemAsync(
									cookieName,
									(currentValue) =>
										getSetCookie(setCookie, currentValue ?? undefined),
								);
								// Only notify $sessionSignal if the session cookie values actually changed
								// This prevents infinite refetching when the server sends the same cookie with updated expiry
								if (
									update &&
									hasSessionCookieChanged(update.previousValue, update.value)
								) {
									store?.notify("$sessionSignal");
								}
							}
						}

						if (pathname.endsWith("/get-session") && !opts?.disableCache) {
							const data = context.data;
							await storage.setItemAsync(localCacheName, JSON.stringify(data));
						}
						if (pathname.endsWith("/sign-out")) {
							await clearSessionCache();
						}

						const isSignInRequest =
							pathname.endsWith("/sign-in") || pathname.includes("/sign-in/");
						const isLinkSocialRequest = pathname.endsWith("/link-social");
						if (
							context.data?.redirect &&
							(isSignInRequest || isLinkSocialRequest) &&
							!context.request?.body.includes("idToken") // id token is used for silent sign-in
						) {
							const callbackURL = JSON.parse(context.request.body)?.callbackURL;
							const to = callbackURL;
							const signInURL = context.data?.url;
							let Browser: typeof import("expo-web-browser") | undefined =
								undefined;
							try {
								Browser = await import("expo-web-browser");
							} catch {
								try {
									Browser = require("expo-web-browser");
								} catch (error) {
									throw new Error(
										'"expo-web-browser" is not installed as a dependency!',
										{
											cause: error,
										},
									);
								}
							}

							if (Platform.OS === "android") {
								try {
									Browser!.dismissAuthSession();
								} catch {}
							}

							const storedCookieJson = await storage.getItemAsync(cookieName);
							const oauthStateValue = getOAuthStateValue(
								storedCookieJson,
								cookieNamespace,
								opts.cookieSecurity,
							);
							const params = new URLSearchParams({
								authorizationURL: signInURL,
							});
							if (oauthStateValue) {
								params.append("oauthState", oauthStateValue);
							}
							const proxyURL = `${context.request.baseURL}/expo-authorization-proxy?${params.toString()}`;
							const result = await Browser!.openAuthSessionAsync(
								proxyURL,
								to,
								opts?.webBrowserOptions,
							);
							if (result.type !== "success") return;
							const url = new URL(result.url);
							const cookie = url.searchParams.get("cookie");
							if (!cookie) return;
							const update = await storage.updateItemAsync(
								cookieName,
								(currentValue) =>
									getSetCookie(cookie, currentValue ?? undefined),
							);
							if (update) {
								store?.notify("$sessionSignal");
							}
						}
					},
				},
				async init(url, options) {
					if (isWeb) {
						return {
							url,
							options: options as ClientFetchOption,
						};
					}
					const { pathname } = new URL(url, options?.baseURL);
					if (pathname.endsWith("/get-session")) {
						await hydrateSessionCache();
					}
					options = options || {};
					options.credentials = "omit";
					/**
					 * ID token flow (native sign-in) doesn't need cookie-based auth.
					 * The ID token itself is cryptographically signed by the provider
					 * and validated server-side, so no session cookies or origin
					 * validation is required.
					 *
					 * Sending cookie/expo-origin headers for ID token requests triggers
					 * unnecessary origin checks that fail for custom URL schemes.
					 */
					const isIdTokenRequest = options.body?.idToken !== undefined;

					if (isIdTokenRequest) {
						const storedCookie = pathname.endsWith("/link-social")
							? await storage.getItemAsync(cookieName)
							: null;
						const cookie = getCookie(storedCookie);
						options.headers = {
							...options.headers,
							...(cookie ? { cookie } : {}),
							"x-skip-oauth-proxy": "true",
						};
					} else {
						const storedCookie = await storage.getItemAsync(cookieName);
						const cookie = getCookie(storedCookie);
						options.headers = {
							...options.headers,
							...(cookie ? { cookie } : {}),
							"expo-origin": getOrigin(scheme!),
							"x-skip-oauth-proxy": "true",
						};
						if (options.body?.callbackURL) {
							if (options.body.callbackURL.startsWith("/")) {
								const url = Linking.createURL(options.body.callbackURL);
								options.body.callbackURL = url;
							}
						}
						if (options.body?.newUserCallbackURL) {
							if (options.body.newUserCallbackURL.startsWith("/")) {
								const url = Linking.createURL(options.body.newUserCallbackURL);
								options.body.newUserCallbackURL = url;
							}
						}
						if (options.body?.errorCallbackURL) {
							if (options.body.errorCallbackURL.startsWith("/")) {
								const url = Linking.createURL(options.body.errorCallbackURL);
								options.body.errorCallbackURL = url;
							}
						}
						if (pathname.endsWith("/sign-out")) {
							await clearSessionCache();
						}
					}
					return {
						url,
						options: options as ClientFetchOption,
					};
				},
			},
		],
	});
};

export { parseSetCookieHeader } from "better-auth/cookies/utils";
export * from "./focus-manager";
export * from "./online-manager";
