import { type BetterFetchPlugin } from "@better-fetch/fetch";

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

export const addOrigin = {
	id: "add-origin",
	name: "Add origin",
	init: (url, options) => {
		return {
			url,
			options: {
				...options,
				headers: {
					...(options?.baseURL
						? { origin: new URL(options.baseURL).origin }
						: {}),
					...options?.headers,
				},
			},
		};
	},
} satisfies BetterFetchPlugin;
