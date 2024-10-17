import type { BetterAuthClientPlugin } from "../../types";

export const ssrPlugin = <UseFetch extends (...args: any) => any>(
	useFetch: UseFetch,
) => {
	return {
		id: "nuxt-ssr",
		getActions($fetch) {
			return {
				useSessionSSR: async () => {
					const res = await useFetch("/api/auth/session");
					return res as {
						session: any;
						user: any;
					};
				},
			};
		},
	} satisfies BetterAuthClientPlugin;
};
