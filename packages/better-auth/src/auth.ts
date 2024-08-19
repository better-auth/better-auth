import { router } from "./api";
import type { BetterAuthOptions } from "./types/options";
import type { UnionToIntersection } from "type-fest";
import type { Plugin } from "./types/plugins";
import { init } from "./init";
import type { CustomProvider } from "./providers";

export const betterAuth = <O extends BetterAuthOptions>(options: O) => {
	const authContext = init(options);
	type PluginEndpoint = UnionToIntersection<
		O["plugins"] extends Array<infer T>
			? T extends Plugin
				? T["endpoints"]
				: Record<string, never>
			: Record<string, never>
	>;

	type ProviderEndpoint = UnionToIntersection<
		O["providers"] extends Array<infer T>
			? T extends CustomProvider
				? T["endpoints"]
				: Record<string, never>
			: Record<string, never>
	>;
	const { handler, endpoints } = router(authContext);
	type Endpoint = typeof endpoints;

	let api: Record<string, any> = {};
	for (const [key, value] of Object.entries(endpoints)) {
		api[key] = (ctx: any) => {
			//@ts-ignore
			return value({
				...ctx,
				context: {
					...authContext,
					...ctx.context,
				},
			});
		};
	}
	return {
		handler,
		api: api as Endpoint & PluginEndpoint & ProviderEndpoint,
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
