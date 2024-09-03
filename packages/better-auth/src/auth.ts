import { getEndpoints, router } from "./api";
import { init } from "./init";
import type { BetterAuthOptions } from "./types/options";

export const betterAuth = <O extends BetterAuthOptions>(options: O) => {
	const authContext = init(options);
	const { api } = getEndpoints(authContext, options);
	return {
		handler: async (request: Request) => {
			if (!authContext.options.baseURL) {
				const baseURL = `${new URL(request.url).origin}/api/auth`;
				authContext.options.baseURL = baseURL;
				authContext.baseURL = baseURL;
			}
			const { handler } = router(authContext, options);
			return handler(request);
		},
		api,
		options,
	};
};

export type Auth = {
	handler: (request: Request) => Promise<Response>;
	api: ReturnType<typeof router>["endpoints"];
	options: BetterAuthOptions;
};
