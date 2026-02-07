import type { BetterFetchPlugin } from "@better-fetch/fetch";

export const redirectPlugin = {
	id: "redirect",
	name: "Redirect",
	hooks: {
		onSuccess(context) {
			const redirectUri = context.data?.url ?? context.data?.uri;
			if (redirectUri && context.data?.redirect) {
				if (typeof window !== "undefined" && window.location) {
					if (window.location) {
						try {
							window.location.href = redirectUri;
						} catch {}
					}
				}
			}
		},
	},
} satisfies BetterFetchPlugin;
