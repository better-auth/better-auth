import type { BetterAuthClientPlugin } from "@better-auth/core";
import type { atproto } from "./index";

export const atprotoClient = () => {
	return {
		id: "atproto",
		$InferServerPlugin: {} as ReturnType<typeof atproto>,
		getActions: ($fetch) => ({
			signIn: {
				atproto: async (
					data: { handle: string; callbackURL?: string },
					fetchOptions?: RequestInit,
				) => {
					const res = await $fetch<{ url: string; redirect: boolean }>(
						"/atproto/sign-in",
						{
							...fetchOptions,
							method: "POST",
							body: {
								handle: data.handle,
								callbackURL: data.callbackURL,
							},
						},
					);
					if (res.data?.url && typeof window !== "undefined") {
						window.location.href = res.data.url;
					}
					return res;
				},
			},
			atproto: {
				getSession: async (fetchOptions?: RequestInit) => {
					return $fetch<{
						active: boolean;
						did?: string;
						handle?: string;
						displayName?: string;
						avatar?: string;
						banner?: string;
						description?: string;
					}>("/atproto/session", { ...fetchOptions, method: "GET" });
				},
				restore: async (fetchOptions?: RequestInit) => {
					return $fetch<{ active: boolean; did?: string }>("/atproto/restore", {
						...fetchOptions,
						method: "POST",
					});
				},
			},
		}),
		pathMethods: {
			"/atproto/sign-in": "POST",
			"/atproto/session": "GET",
			"/atproto/restore": "POST",
		},
	} satisfies BetterAuthClientPlugin;
};
