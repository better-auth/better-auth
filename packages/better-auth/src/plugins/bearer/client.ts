import type { BetterAuthClientPlugin } from "@better-auth/core";

interface BearerClientOptions {
	/** The local storage key to store the bearer token */
	localStorageKey?: string;
}

/**
 * Client plugin to handle bearer tokens.
 * It stores the token from URL parameters or response headers into local storage.
 */
export const bearerClient = (options?: BearerClientOptions) => {
	const localStorageKey = options?.localStorageKey || "bearer_token";
	if (typeof window !== "undefined") {
		const urlParams = new URLSearchParams(window.location.search);
		const token = urlParams.get("set-auth-token");
		if (token) {
			localStorage.setItem(localStorageKey, token);
			urlParams.delete("set-auth-token");
			const newUrl = `${window.location.pathname}${urlParams.toString() ? `?${urlParams.toString()}` : ""}${window.location.hash}`;
			window.history.replaceState({}, "", newUrl);
		}
	}

	return {
		id: "bearer",
		fetchPlugins: [
			{
				id: "bearer-token",
				name: "bearer-token",
				hooks: {
					onResponse(ctx) {
						const authToken = ctx.response.headers.get("set-auth-token");
						if (authToken) {
							localStorage.setItem(localStorageKey, authToken);
						}
					},
				},
			},
		],
	} satisfies BetterAuthClientPlugin;
};
