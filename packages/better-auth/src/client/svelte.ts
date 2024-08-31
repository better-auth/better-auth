import type { UnionToIntersection } from "../types/helper";
import { createAuthClient as createClient } from "./base";
import type { AuthPlugin, ClientOptions } from "./type";

export const createAuthClient = <Option extends ClientOptions>(
	options?: Option,
) => {
	const client = createClient(options);
	const signals = options?.authPlugins?.reduce(
		(acc, plugin) => {
			return {
				...acc,
				...(plugin(client.$fetch).integrations?.svelte?.() || {}),
			};
		},
		{} as Record<string, any>,
	) as Option["authPlugins"] extends Array<infer Pl>
		? Pl extends AuthPlugin
			? UnionToIntersection<
					ReturnType<Pl>["integrations"] extends
						| {
								svelte?: () => infer R;
						  }
						| undefined
						? R
						: {
								test1: ReturnType<Pl>["integrations"];
							}
				>
			: {}
		: {};
	const obj = Object.assign(client, {
		...signals,
		$session: client.$atoms.$session,
	});
	return obj;
};
