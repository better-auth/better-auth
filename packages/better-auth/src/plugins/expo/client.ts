import { atom } from "nanostores";
import type { BetterAuthClientPlugin } from "../../types";
import { Linking } from "react-native";

interface ExpoClientOptions {
	storage: {
		getItem: (key: string) => string;
		setItem: (key: string, value: string) => void;
		deleteItem: (key: string) => void;
	};
	scheme: string;
}

export const expoClient = (options: ExpoClientOptions) => {
	const { storage } = options;
	let notify = () => {};
	const cookieName = "better-auth_cookie";
	const storeCookie = storage.getItem("cookie");
	const hasSessionCookie = storeCookie?.includes("session_token");
	const isAuthenticated = atom<boolean>(!!hasSessionCookie);
	function createURL(path: string) {
		return `${options.scheme}/${path}`;
	}
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
							await storage.setItem(cookieName, setCookie);
						}
						if (
							context.data.redirect &&
							context.request.url.toString().includes("/sign-in")
						) {
							const callbackURL = context.request.body?.callbackURL;
							const to = createURL(callbackURL);
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
						storage.deleteItem(cookieName);
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
