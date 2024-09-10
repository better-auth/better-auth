import { type BetterFetchPlugin, betterFetch } from "@better-fetch/fetch";
import { BetterAuthError } from "../error/better-auth-error";

export const redirectPlugin = {
	id: "redirect",
	name: "Redirect",
	hooks: {
		onSuccess(context) {
			if (context.data?.url && context.data?.redirect) {
				if (typeof window !== "undefined") {
					window.location.href = context.data.url;
				}
			}
		},
	},
} satisfies BetterFetchPlugin;

export const addCurrentURL = {
	id: "add-current-url",
	name: "Add current URL",
	hooks: {
		onRequest(context) {
			if (typeof window !== "undefined") {
				const url = new URL(context.url);
				url.searchParams.set("currentURL", window.location.href);
				context.url = url;
			}
			return context;
		},
	},
} satisfies BetterFetchPlugin;

export const csrfPlugin = {
	id: "csrf",
	name: "CSRF Check",
	async init(url, options) {
		if (!options?.baseURL) {
			throw new BetterAuthError(
				"API Base URL on the auth client isn't configured. Please pass it directly to the client `baseURL`",
			);
		}

		if (options?.method !== "GET") {
			options = options || {};
			const { data, error } = await betterFetch<{
				csrfToken: string;
			}>("/csrf", {
				body: undefined,
				baseURL: options.baseURL,
				plugins: [],
				method: "GET",
				credentials: "include",
				customFetchImpl: options.customFetchImpl,
			});
			if (error?.status === 404) {
				throw new BetterAuthError(
					"Route not found. Make sure the server is running and the base URL is correct and includes the path (e.g. http://localhost:3000/api/auth).",
				);
			}
			if (error) {
				throw new BetterAuthError(error.message || "Failed to get CSRF token.");
			}
			options.body = {
				...options?.body,
				csrfToken: data.csrfToken,
			};
		}
		options.credentials = "include";
		return { url, options };
	},
} satisfies BetterFetchPlugin;
