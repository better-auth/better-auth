import { useStore } from "@nanostores/vue";
import { createAuthFetch, createAuthClient as createClient } from "./base";
import type { AuthPlugin, ClientOptions } from "./type";
import type { UnionToIntersection } from "type-fest";

export const createAuthClient = <O extends ClientOptions>(options?: O) => {
	const $fetch = createAuthFetch(options);
	const hooks = options?.authPlugins?.reduce(
		(acc, plugin) => {
			return {
				...acc,
				...(plugin($fetch).integrations?.vue?.(useStore) || {}),
			};
		},
		{} as Record<string, any>,
	) as O["authPlugins"] extends Array<infer Pl>
		? Pl extends AuthPlugin
			? UnionToIntersection<
					ReturnType<Pl>["integrations"] extends
						| {
								vue?: (useStore: any) => infer R;
						  }
						| undefined
						? R
						: {}
				>
			: {}
		: {};
	const client = createClient(options, hooks);
	function useSession() {
		return useStore(client.$atoms.$session);
	}
	const obj = Object.assign(client, {
		useSession,
		...hooks,
	});
	return obj;
};

export const useAuthStore = useStore;
