import type { BetterFetchPlugin } from "@better-fetch/fetch";

export const redirectPlugin = {
	id: "redirect",
	name: "Redirect",
	hooks: {
		onSuccess(context) {
			if (context.data?.url && context.data?.redirect) {
				if (typeof window !== "undefined" && window.location) {
					if (window.location) {
						try {
							window.location.href = context.data.url;
						} catch {}
					}
				}
			}
		},
	},
} satisfies BetterFetchPlugin;

export const userAgentPlugin = {
	id: "user-agent",
	name: "UserAgent",
	hooks: {
		onRequest(context) {
			context.headers.append("user-agent", "better-auth");
		},
	},
} satisfies BetterFetchPlugin;
