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


export const translationClientPlugin = (
	translations?: Record<string, string>,
): BetterFetchPlugin => {
	return {
		id: "translation",
		name: "Translation",
		hooks: {
			async onResponse(context) {
				if (!translations) {
					return;
				}
				const response = context.response;
				if (!response.ok) {
					try {
						const data = await context.response.clone().json();
						const code = data?.code || data?.error?.code;
						if (code && translations[code]) {
							const message = translations[code];
							if (data.message) {
								data.message = message;
							}
							if (data.error?.message) {
								data.error.message = message;
							}
							return Response.json(data, {
								status: response.status,
								statusText: response.statusText === "OK" ? "OK" : message,
								headers: response.headers,
							});
						}
					} catch {}
				}
				return response;
			},
		},
	};
};
