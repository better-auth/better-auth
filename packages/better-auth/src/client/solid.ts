import type { AuthPlugin, ClientOptions } from "./type";
import { createAuthFetch, createAuthClient as createClient } from "./base";
import { useStore } from "@nanostores/solid";
import type * as SolidJS from "solid-js"; //to fix ts error: This is likely not portable. A type annotation is necessary.
import type { UnionToIntersection } from "type-fest";
export const createAuthClient = <Option extends ClientOptions>(
	options?: Option,
) => {
	const $fetch = createAuthFetch(options);
	const hooks = options?.authPlugins?.reduce(
		(acc, plugin) => {
			return {
				...acc,
				...(plugin($fetch).integrations?.solid?.(useStore) || {}),
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

	const client = createClient(options, hooks);

	function useSession() {
		return useStore(client.$atoms.$session);
	}
	const obj = Object.assign(client, {
		useSession,
	});
	return obj;
};
