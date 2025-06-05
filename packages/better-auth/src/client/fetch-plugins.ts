import { type BetterFetchPlugin } from "@better-fetch/fetch";

export const redirectPlugin = {
	id: "redirect",
	name: "Redirect",
	hooks: {
		onSuccess(context) {
			if (context.data?.url && context.data?.redirect) {
				if (typeof window !== "undefined" && window.location) {
					try {
						if (context.data.target === "_blank") {
							window.open(context.data.url, "_blank");
						} else {
							window.location.href = context.data.url;
						}
					} catch {}
				}
			}
		},
	},
} satisfies BetterFetchPlugin;
