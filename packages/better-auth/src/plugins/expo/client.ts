import type { BetterAuthClientPlugin, Store } from "better-auth";
import * as Browser from "expo-web-browser";
import * as Linking from "expo-linking";
import * as SecureStorage from "expo-secure-store";
import { parseSetCookieHeader } from "../../cookies";

interface ExpoClientOptions {
	scheme: string;
	storage?: {
		getItemAsync: (key: string) => Promise<string | null> | string | null;
		setItemAsync: (key: string, value: string) => Promise<void> | void;
		deleteItemAsync: (key: string) => Promise<void> | void;
	};
	cookies?: {
		name?: string;
	};
}

interface StoredCookie {
	value: string;
	expires: Date | null;
}

function getSetCookie(header: string) {
	const parsed = parseSetCookieHeader(header);
	const toSetCookie: Record<string, StoredCookie> = {};
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
	return JSON.stringify(toSetCookie);
}

function getCookie(cookie: string) {
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

export const expoClient = (opts: ExpoClientOptions) => {
	let store: Store | null = null;
	const cookieName = opts.cookies?.name || "better-auth_cookie";
	const storage = opts.storage || SecureStorage;
	const scheme = opts.scheme;
	if (!scheme) {
		throw new Error(
			"Scheme not found in app.json. Please provide a scheme in the options.",
		);
	}
	const schemeURL = `${scheme}://`;
	return {
		id: "expo",
		getActions(_, $store) {
			store = $store;
			return {};
		},
		fetchPlugins: [
			{
				id: "expo",
				name: "Expo",
				hooks: {
					async onSuccess(context) {
						const setCookie = context.response.headers.get("set-cookie");
						const toSetCookie = getSetCookie(setCookie || "");
						await storage.setItemAsync(cookieName, toSetCookie);
						if (
							context.data.redirect &&
							context.request.url.toString().includes("/sign-in")
						) {
							const callbackURL = JSON.parse(context.request.body)?.callbackURL;
							const to = callbackURL;
							const signInURL = context.data?.url;
							const result = await Browser.openAuthSessionAsync(signInURL, to);
							if (result.type !== "success") return;
							const url = new URL(result.url);
							const cookie = String(url.searchParams.get("cookie"));
							if (!cookie) return;
							await storage.setItemAsync(cookieName, getSetCookie(cookie));
							store?.notify("$sessionSignal");
						}
					},
				},
				async init(url, options) {
					options = options || {};
					const storedCookie = await storage.getItemAsync(cookieName);
					const cookie = getCookie(storedCookie || "{}");
					options.credentials = "omit";
					options.headers = {
						...options.headers,
						cookie,
						origin: schemeURL,
					};
					if (options.body?.callbackURL) {
						if (options.body.callbackURL.startsWith("/")) {
							const url = Linking.createURL(options.body.callbackURL, {
								scheme,
							});
							options.body.callbackURL = url;
						}
					}
					if (url.includes("/sign-out")) {
						await storage.deleteItemAsync(cookieName);
						store?.atoms.session?.set({
							data: null,
							error: null,
							isPending: false,
						});
					}
					return {
						url,
						options,
					};
				},
			},
		],
	} satisfies BetterAuthClientPlugin;
};
