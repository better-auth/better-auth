import type { BetterAuthClientPlugin, Store } from "better-auth";
import * as Browser from "expo-web-browser";
import * as Linking from "expo-linking";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { BetterFetchOption } from "@better-fetch/fetch";

interface CookieAttributes {
	value: string;
	expires?: Date;
	"max-age"?: number;
	domain?: string;
	path?: string;
	secure?: boolean;
	httpOnly?: boolean;
	sameSite?: "Strict" | "Lax" | "None";
}

export function parseSetCookieHeader(
	header: string,
): Map<string, CookieAttributes> {
	const cookieMap = new Map<string, CookieAttributes>();
	const cookies = header.split(", ");
	cookies.forEach((cookie) => {
		const [nameValue, ...attributes] = cookie.split("; ");
		const [name, value] = nameValue.split("=");

		const cookieObj: CookieAttributes = { value };

		attributes.forEach((attr) => {
			const [attrName, attrValue] = attr.split("=");
			cookieObj[attrName.toLowerCase() as "value"] = attrValue;
		});

		cookieMap.set(name, cookieObj);
	});

	return cookieMap;
}

interface ExpoClientOptions {
	scheme?: string;
	storage: {
		setItem: (key: string, value: string) => any;
		getItem: (key: string) => string | null;
	};
	storagePrefix?: string;
	disableCache?: boolean;
}

interface StoredCookie {
	value: string;
	expires: Date | null;
}

export function getSetCookie(header: string, prevCookie?: string) {
	const parsed = parseSetCookieHeader(header);
	let toSetCookie: Record<string, StoredCookie> = {};
	parsed.forEach((cookie, key) => {
		const expiresAt = cookie["expires"];
		const maxAge = cookie["max-age"];
		const expires = expiresAt
			? new Date(String(expiresAt))
			: maxAge
				? new Date(Date.now() + Number(maxAge))
				: null;
		toSetCookie[key] = {
			value: cookie["value"],
			expires,
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
		if (value.expires && value.expires < new Date()) {
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

export const expoClient = (opts: ExpoClientOptions) => {
	let store: Store | null = null;
	const cookieName = `${opts?.storagePrefix || "better-auth"}_cookie`;
	const localCacheName = `${opts?.storagePrefix || "better-auth"}_session_data`;
	const storage = opts?.storage;
	const isWeb = Platform.OS === "web";

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
							const prevCookie = await storage.getItem(cookieName);
							const toSetCookie = getSetCookie(
								setCookie || "",
								prevCookie ?? undefined,
							);
							await storage.setItem(cookieName, toSetCookie);
							store?.notify("$sessionSignal");
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
							context.request.url.toString().includes("/sign-in") &&
							!context.request?.body.includes("idToken") // id token is used for silent sign-in
						) {
							const callbackURL = JSON.parse(context.request.body)?.callbackURL;
							const to = callbackURL;
							const signInURL = context.data?.url;
							const result = await Browser.openAuthSessionAsync(signInURL, to);
							if (result.type !== "success") return;
							const url = new URL(result.url);
							const cookie = String(url.searchParams.get("cookie"));
							if (!cookie) return;
							storage.setItem(cookieName, getSetCookie(cookie));
							store?.notify("$sessionSignal");
						}
					},
				},
				async init(url, options) {
					if (isWeb) {
						return {
							url,
							options: options as BetterFetchOption,
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
							data: null,
							error: null,
							isPending: false,
						});
						storage.setItem(localCacheName, "{}");
					}
					return {
						url,
						options: options as BetterFetchOption,
					};
				},
			},
		],
	} satisfies BetterAuthClientPlugin;
};
