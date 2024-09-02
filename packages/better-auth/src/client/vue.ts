import { useStore } from "@nanostores/vue";
import { createAuthClient as createClient } from "./base";
import type { AuthPlugin, ClientOptions } from "./type";
import type { UnionToIntersection } from "type-fest";

export const createAuthClient = <O extends ClientOptions>(options?: O) => {
	const client = createClient(options);
	function useSession() {
		return useStore(client.$atoms.$session);
	}
	const hooks = options?.authPlugins?.reduce(
		(acc, plugin) => {
			return {
				...acc,
				...(plugin(client.$fetch).integrations?.vue?.(useStore) || {}),
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
	const obj = Object.assign(client, {
		useSession,
		...hooks,
	});
	return obj;
};

export const useAuthStore = useStore;
