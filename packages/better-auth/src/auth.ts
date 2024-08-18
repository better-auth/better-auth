import { router } from "./api";
import { BetterAuthOptions } from "./types/options";
import { UnionToIntersection } from "type-fest";
import { Plugin } from "./types/plugins";
import { init } from "./init";

export const betterAuth = <O extends BetterAuthOptions>(options: O) => {
	const pluginEndpoints = options.plugins?.reduce(
		(acc, plugin) => {
			return {
				...acc,
				...plugin.endpoints,
			};
		},
		{} as Record<string, any>,
	);

	const authContext = init(options);

	const { handler, endpoints } = router(authContext);
	type Endpoint = typeof endpoints;

	const api = {
		...endpoints,
		...pluginEndpoints,
	};

	type PluginEndpoint = UnionToIntersection<
		O["plugins"] extends Array<infer T>
			? T extends Plugin
				? T["endpoints"]
				: {}
			: {}
	>;
	return {
		handler,
		api: Object.entries(api).reduce(
			(acc, [key, value]) => {
				acc[key] = (ctx: any) => {
					//@ts-ignore
					return value({
						...ctx,
						...authContext,
					});
				};
				return acc;
			},
			{} as Record<string, any>,
		) as Endpoint & PluginEndpoint,
		options,
	};
};

export type BetterAuth<
	Endpoints extends Record<string, any> = ReturnType<
		typeof router
	>["endpoints"],
> = {
	handler: (request: Request) => Promise<Response>;
	api: Endpoints;
	options: BetterAuthOptions;
};
