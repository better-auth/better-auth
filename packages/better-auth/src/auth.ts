import { router } from "./api";
import { BetterAuthOptions } from "./types/options";
import { UnionToIntersection } from "type-fest";
import { Plugin } from "./types/plugins";
import { init } from "./init";
import { CustomProvider } from "./providers";

export const betterAuth = <O extends BetterAuthOptions>(options: O) => {
	const authContext = init(options);
	type PluginEndpoint = UnionToIntersection<
		O["plugins"] extends Array<infer T>
			? T extends Plugin
				? T["endpoints"]
				: {}
			: {}
	>;

	type ProviderEndpoint = UnionToIntersection<
		O["providers"] extends Array<infer T>
			? T extends CustomProvider
				? T["endpoints"]
				: {}
			: {}
	>;
	const { handler, endpoints } = router(authContext);
	type Endpoint = typeof endpoints;
	return {
		handler,
		api: Object.entries(endpoints).reduce(
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
		) as Endpoint & PluginEndpoint & ProviderEndpoint,
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
