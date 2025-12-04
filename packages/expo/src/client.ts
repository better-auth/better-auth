import type {
	BetterAuthClientPlugin,
	ClientFetchOption,
	ClientStore,
} from "@better-auth/core";
import Constants from "expo-constants";
import * as Linking from "expo-linking";
import { Platform } from "react-native";
import { setupExpoFocusManager } from "./focus-manager";
import { setupExpoOnlineManager } from "./online-manager";

if (Platform.OS !== "web") {
	setupExpoFocusManager();
	setupExpoOnlineManager();
}

interface CookieAttributes {
	value: string;
	expires?: Date | undefined;
	"max-age"?: number | undefined;
	domain?: string | undefined;
	path?: string | undefined;
	secure?: boolean | undefined;
	httpOnly?: boolean | undefined;
	sameSite?: ("Strict" | "Lax" | "None") | undefined;
}

export function parseSetCookieHeader(
	header: string,
): Map<string, CookieAttributes> {
	const cookieMap = new Map<string, CookieAttributes>();
	const cookies = splitSetCookieHeader(header);
	cookies.forEach((cookie) => {
		const parts = cookie.split(";").map((p) => p.trim());
		const [nameValue, ...attributes] = parts;
		const [name, ...valueParts] = nameValue!.split("=");
		const value = valueParts.join("=");
		const cookieObj: CookieAttributes = { value };
		attributes.forEach((attr) => {
			const [attrName, ...attrValueParts] = attr.split("=");
			const attrValue = attrValueParts.join("=");
			cookieObj[attrName!.toLowerCase() as "value"] = attrValue;
		});
		cookieMap.set(name!, cookieObj);
	});
	return cookieMap;
}

function splitSetCookieHeader(setCookie: string): string[] {
	const parts: string[] = [];
	let buffer = "";
	let i = 0;
	while (i < setCookie.length) {
		const char = setCookie[i];
		if (char === ",") {
			const recent = buffer.toLowerCase();
			const hasExpires = recent.includes("expires=");
			const hasGmt = /gmt/i.test(recent);
			if (hasExpires && !hasGmt) {
				buffer += char;
				i += 1;
				continue;
			}
			if (buffer.trim().length > 0) {
				parts.push(buffer.trim());
				buffer = "";
			}
			i += 1;
			if (setCookie[i] === " ") i += 1;
			continue;
		}
		buffer += char;
		i += 1;
	}
	if (buffer.trim().length > 0) {
		parts.push(buffer.trim());
	}
	return parts;
}

interface ExpoClientOptions {
	scheme?: string | undefined;
	storage: {
		setItem: (key: string, value: string) => any;
		getItem: (key: string) => string | null;
	};
	/**
	 * Prefix for local storage keys (e.g., "my-app_cookie", "my-app_session_data")
	 * @default "better-auth"
	 */
	storagePrefix?: string | undefined;
	/**
	 * Prefix(es) for server cookie names to filter (e.g., "better-auth.session_token")
	 * This is used to identify which cookies belong to better-auth to prevent
	 * infinite refetching when third-party cookies are set.
	 * Can be a single string or an array of strings to match multiple prefixes.
	 * @default "better-auth"
	 * @example "better-auth"
	 * @example ["better-auth", "my-app"]
	 */
	cookiePrefix?: string | string[] | undefined;
	disableCache?: boolean | undefined;
}

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
	} catch (e) {}
	const toSend = Object.entries(parsed).reduce((acc, [key, value]) => {
		if (value.expires && new Date(value.expires) < new Date()) {
			return acc;
		}
		return `${acc}; ${key}=${value.value}`;
	}, "");
	return toSend;
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

/**
 * Expo secure store does not support colons in the keys.
 * This function replaces colons with underscores.
 *
 * @see https://github.com/better-auth/better-auth/issues/5426
 *
 * @param name cookie name to be saved in the storage
 * @returns normalized cookie name
 */
export function normalizeCookieName(name: string) {
	return name.replace(/:/g, "_");
}

export function storageAdapter(storage: {
	getItem: (name: string) => string | null;
	setItem: (name: string, value: string) => void;
}) {
	return {
		getItem: (name: string) => {
			return storage.getItem(normalizeCookieName(name));
		},
		setItem: (name: string, value: string) => {
			return storage.setItem(normalizeCookieName(name), value);
		},
	};
}

export const expoClient = (opts: ExpoClientOptions) => {
	let store: ClientStore | null = null;
	const storagePrefix = opts?.storagePrefix || "better-auth";
	const cookieName = `${storagePrefix}_cookie`;
	const localCacheName = `${storagePrefix}_session_data`;
	const storage = storageAdapter(opts?.storage);
	const isWeb = Platform.OS === "web";
	const cookiePrefix = opts?.cookiePrefix || "better-auth";

	const rawScheme =
		opts?.scheme || Constants.expoConfig?.scheme || Constants.platform?.scheme;
	const scheme = Array.isArray(rawScheme) ? rawScheme[0] : rawScheme;

	if (!scheme && !isWeb) {
		throw new Error(
			"Scheme not found in app.json. Please provide a scheme in the options.",
		);
	}
	return {
		id: "expo",
		getActions(_, $store) {
			store = $store;
			return {
				/**
				 * Get the stored cookie.
				 *
				 * You can use this to get the cookie stored in the device and use it in your fetch
				 * requests.
				 *
				 * @example
				 * ```ts
				 * const cookie = client.getCookie();
				 * fetch("https://api.example.com", {
				 * 	headers: {
				 * 		cookie,
				 * 	},
				 * });
				 */
				getCookie: () => {
					const cookie = storage.getItem(cookieName);
					return getCookie(cookie || "{}");
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
						const setCookie = context.response.headers.get("set-cookie");
						if (setCookie) {
							// Only process and notify if the Set-Cookie header contains better-auth cookies
							// This prevents infinite refetching when other cookies (like Cloudflare's __cf_bm) are present
							if (hasBetterAuthCookies(setCookie, cookiePrefix)) {
								const prevCookie = await storage.getItem(cookieName);
								const toSetCookie = getSetCookie(
									setCookie || "",
									prevCookie ?? undefined,
								);
								// Only notify $sessionSignal if the session cookie values actually changed
								// This prevents infinite refetching when the server sends the same cookie with updated expiry
								if (hasSessionCookieChanged(prevCookie, toSetCookie)) {
									await storage.setItem(cookieName, toSetCookie);
									store?.notify("$sessionSignal");
								} else {
									// Still update the storage to refresh expiry times, but don't trigger refetch
									await storage.setItem(cookieName, toSetCookie);
								}
							}
						}

						if (
							context.request.url.toString().includes("/get-session") &&
							!opts?.disableCache
						) {
							const data = context.data;
							storage.setItem(localCacheName, JSON.stringify(data));
						}

						if (
							context.data?.redirect &&
							(context.request.url.toString().includes("/sign-in") ||
								context.request.url.toString().includes("/link-social")) &&
							!context.request?.body.includes("idToken") // id token is used for silent sign-in
						) {
							const callbackURL = JSON.parse(context.request.body)?.callbackURL;
							const to = callbackURL;
							const signInURL = context.data?.url;
							let Browser: typeof import("expo-web-browser") | undefined =
								undefined;
							try {
								Browser = await import("expo-web-browser");
							} catch (error) {
								throw new Error(
									'"expo-web-browser" is not installed as a dependency!',
									{
										cause: error,
									},
								);
							}

							if (Platform.OS === "android") {
								try {
									Browser.dismissAuthSession();
								} catch (e) {}
							}

							const proxyURL = `${context.request.baseURL}/expo-authorization-proxy?authorizationURL=${encodeURIComponent(signInURL)}`;
							const result = await Browser.openAuthSessionAsync(proxyURL, to);
							if (result.type !== "success") return;
							const url = new URL(result.url);
							const cookie = String(url.searchParams.get("cookie"));
							if (!cookie) return;
							const prevCookie = await storage.getItem(cookieName);
							const toSetCookie = getSetCookie(cookie, prevCookie ?? undefined);
							storage.setItem(cookieName, toSetCookie);
							store?.notify("$sessionSignal");
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
					options = options || {};
					const storedCookie = storage.getItem(cookieName);
					const cookie = getCookie(storedCookie || "{}");
					options.credentials = "omit";
					options.headers = {
						...options.headers,
						cookie,
						"expo-origin": getOrigin(scheme!),
						"x-skip-oauth-proxy": "true", // skip oauth proxy for expo
					};
					if (options.body?.callbackURL) {
						if (options.body.callbackURL.startsWith("/")) {
							const url = Linking.createURL(options.body.callbackURL, {
								scheme,
							});
							options.body.callbackURL = url;
						}
					}
					if (options.body?.newUserCallbackURL) {
						if (options.body.newUserCallbackURL.startsWith("/")) {
							const url = Linking.createURL(options.body.newUserCallbackURL, {
								scheme,
							});
							options.body.newUserCallbackURL = url;
						}
					}
					if (options.body?.errorCallbackURL) {
						if (options.body.errorCallbackURL.startsWith("/")) {
							const url = Linking.createURL(options.body.errorCallbackURL, {
								scheme,
							});
							options.body.errorCallbackURL = url;
						}
					}
					if (url.includes("/sign-out")) {
						await storage.setItem(cookieName, "{}");
						store?.atoms.session?.set({
							...store.atoms.session.get(),
							data: null,
							error: null,
							isPending: false,
						});
						storage.setItem(localCacheName, "{}");
					}
					return {
						url,
						options: options as ClientFetchOption,
					};
				},
			},
		],
	} satisfies BetterAuthClientPlugin;
};

export * from "./focus-manager";
export * from "./online-manager";
