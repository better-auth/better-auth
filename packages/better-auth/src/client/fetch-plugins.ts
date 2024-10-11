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
			if (error) {
				if (error.status === 404) {
					throw new BetterAuthError(
						"CSRF route not found. Make sure the server is running and the base URL is correct and includes the path (e.g. http://localhost:3000/api/auth).",
					);
				}

				if (error.status === 429) {
					return new Response(
						JSON.stringify({
							message: "Too many requests. Please try again later.",
						}),
						{
							status: 429,
							statusText: "Too Many Requests",
						},
					);
				}
				throw new BetterAuthError(
					"Failed to fetch CSRF token: " + error.message,
				);
			}
			const csrfToken = data?.csrfToken;
			options.body = {
				...options?.body,
				csrfToken: csrfToken,
			};
		}
		options.credentials = "include";
		return { url, options };
	},
} satisfies BetterFetchPlugin;
