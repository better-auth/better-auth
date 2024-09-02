import { useStore } from "@nanostores/react";
import {
	createAuthFetch,
	createAuthClient as createVanillaClient,
} from "./base";
import type { AuthPlugin, ClientOptions } from "./type";
import type { UnionToIntersection } from "../types/helper";

export const createAuthClient = <Option extends ClientOptions>(
	options?: Option,
) => {
	const $fetch = createAuthFetch(options);
	const hooks = options?.authPlugins?.reduce(
		(acc, plugin) => {
			return {
				...acc,
				...(plugin($fetch).integrations?.react?.(useStore) || {}),
			};
		},
		{} as Record<string, any>,
	) as Option["authPlugins"] extends Array<infer Pl>
		? Pl extends AuthPlugin
			? UnionToIntersection<
					ReturnType<Pl>["integrations"] extends
						| {
								react?: (useStore: any) => infer R;
						  }
						| undefined
						? R
						: {}
				>
			: {}
		: {};

	const client = createVanillaClient(options, hooks);

	function useSession(
		initialValue: typeof client.$atoms.$session.value = null,
	) {
		const session = useStore(client.$atoms.$session);
		if (session) {
			return session;
		}
		return initialValue;
	}

	const obj = Object.assign(client, {
		useSession,
	});
	return obj;
};

export const useAuthStore = useStore;
