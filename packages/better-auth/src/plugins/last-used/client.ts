import type { BetterAuthClientPlugin, OAuthProviderList } from "../../types";

export const client = () => {
	return {
		id: "last-used",
		fetchPlugins: [
			{
				id: "last-used",
				name: "Last Used",
				init(url, options) {
					if (url.startsWith("/sign-in")) {
						let lastUsed = "";
						if (url === "/sign-in/social") {
							lastUsed = options?.body?.provider;
						} else {
							lastUsed = url.replace("/sign-in/", "");
						}
						localStorage.setItem("last-used", lastUsed);
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
