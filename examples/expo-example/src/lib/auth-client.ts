import { createAuthClient } from "better-auth/react";
import * as SecureStore from "expo-secure-store";
import * as Linking from "expo-linking";
import * as Browser from "expo-web-browser";
import * as Constants from "expo-constants";
import { BetterAuthClientPlugin } from "better-auth/types";
import { atom } from "nanostores";

type Cookie = {
	name: string;
	value: string;
	expires?: Date;
	maxAge?: number;
	domain?: string;
	path?: string;
	secure: boolean;
	httpOnly: boolean;
	sameSite?: "Strict" | "Lax" | "None";
};

function parseCookies(setCookieHeader: string): Cookie[] {
	return setCookieHeader.split(",").map((cookieString) => {
		const parts = cookieString.split(";").map((part) => part.trim());
		const [nameValue, ...attributes] = parts;
		const [rawName, value] =
			nameValue?.split("=").map(decodeURIComponent) || [];
		if (!rawName || !value) {
			throw new Error("Invalid cookie string");
		}

		const name = rawName.startsWith("__Secure-")
			? rawName
			: rawName.replace(/^__Secure-/, "");

		const cookie: Cookie = {
			name,
			value,
			secure: rawName.startsWith("__Secure-"),
			httpOnly: false,
		};

		attributes.forEach((attr) => {
			let [key, val] = attr.split("=").map((part) => part.trim());
			if (!key) return;
			if (!val) {
				val = "";
			}

			switch (key.toLowerCase()) {
				case "expires":
					cookie.expires = new Date(val);
					break;
				case "max-age":
					cookie.maxAge = parseInt(val, 10);
					break;
				case "domain":
					cookie.domain = val;
					break;
				case "path":
					cookie.path = val;
					break;
				case "secure":
					cookie.secure = true;
					break;
				case "httponly":
					cookie.httpOnly = true;
					break;
				case "samesite":
					cookie.sameSite = val as "Strict" | "Lax" | "None";
					break;
			}
		});

		return cookie;
	});
}

function getCookieValue(
	setCookieHeader: string,
	cookieName: string,
): string | undefined {
	const cookies = parseCookies(setCookieHeader);
	const targetCookie = cookies.find(
		(cookie) =>
			cookie.name === cookieName || cookie.name === `__Secure-${cookieName}`,
	);
	return targetCookie?.value;
}
const expoClient = () => {
	let notify = () => {};
	const cookieName = "better-auth_cookie";
	const storeCookie = SecureStore.getItem("cookie");
	const hasSessionCookie = storeCookie?.includes("session_token");
	const isAuthenticated = atom<boolean>(!!hasSessionCookie);
	return {
		id: "expo",
		getActions(_, $store) {
			notify = () => $store.notify("_sessionSignal");
			return {};
		},
		getAtoms() {
			return {
				isAuthenticated,
			};
		},
		fetchPlugins: [
			{
				id: "expo",
				name: "Expo",
				hooks: {
					async onSuccess(context) {
						const setCookie = context.response.headers.get("set-cookie");
						if (setCookie) {
							await SecureStore.setItemAsync(cookieName, setCookie);
						}
						if (
							context.data.redirect &&
							context.request.url.toString().includes("/sign-in")
						) {
							const callbackURL = context.request.body?.callbackURL;
							const to = Linking.createURL(callbackURL);
							const signInURL = context.data?.url;
							const result = await Browser.openAuthSessionAsync(signInURL, to);
							if (result.type !== "success") return;
							const url = Linking.parse(result.url);
							const cookie = String(url.queryParams?.cookie);
							if (!cookie) return;
							await SecureStore.setItemAsync(cookieName, cookie);
							notify();
						}
					},
				},
				async init(url, options) {
					options = options || {};
					const cookie = await SecureStore.getItemAsync(cookieName);
					const scheme = Constants.default.expoConfig?.scheme;
					const schemeURL = typeof scheme === "string" ? scheme : scheme?.[0];
					if (!schemeURL) {
						throw new Error("Scheme not found in app.json");
					}
					options.credentials = "omit";
					options.headers = {
						...options.headers,
						cookie: cookie || "",
						origin: schemeURL,
					};
					if (options.body?.callbackURL) {
						if (options.body.callbackURL.startsWith("/")) {
							const url = Linking.createURL(options.body.callbackURL);
							options.body.callbackURL = url;
						}
					}
					if (url.includes("/sign-out")) {
						isAuthenticated.set(false);
						await SecureStore.deleteItemAsync(cookieName);
						notify();
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

export const authClient = createAuthClient({
	baseURL: "http://localhost:3000",
	disableDefaultFetchPlugins: true,
	plugins: [expoClient()],
});
