import { isSafeUrlScheme } from "@better-auth/core/utils/url";
import type { BetterFetchPlugin } from "@better-fetch/fetch";

export const redirectPlugin = {
	id: "redirect",
	name: "Redirect",
	hooks: {
		onSuccess(context) {
			if (
				context.data?.url &&
				context.data?.redirect &&
				isSafeUrlScheme(context.data.url)
			) {
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
