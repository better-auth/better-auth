import type { UnionToIntersection } from "type-fest";
import { router } from "./api";
import { init } from "./init";
import type { BetterAuthOptions } from "./types/options";
import type { BetterAuthPlugin } from "./types/plugins";

export const betterAuth = <O extends BetterAuthOptions>(options: O) => {
	const authContext = init(options);
	type PluginEndpoint = UnionToIntersection<
		O["plugins"] extends Array<infer T>
			? T extends BetterAuthPlugin
				? T["endpoints"]
				: {}
			: {}
	>;
	const { handler, endpoints } = router(authContext);
	type Endpoint = typeof endpoints;
	return {
		handler,
		api: endpoints as Endpoint & PluginEndpoint,
		options,
	};
};

export type BetterAuth<Endpoints extends Record<string, any> = {}> = {
	handler: (request: Request) => Promise<Response>;
	api: Endpoints;
	options: BetterAuthOptions;
};
