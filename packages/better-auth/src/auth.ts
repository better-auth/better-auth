import { getEndpoints, router } from "./api";
import { init } from "./init";
import type { BetterAuthOptions } from "./types/options";

export const betterAuth = <O extends BetterAuthOptions>(options: O) => {
	const authContext = init(options);
	const { api } = getEndpoints(authContext, options);
	return {
		handler: async (request: Request) => {
			console.log(request);
			const basePath = authContext.options.basePath;
			if (!authContext.options.baseURL) {
				const baseURL = `${new URL(request.url).origin}/api/auth`;
				authContext.options.baseURL = baseURL;
				authContext.baseURL = baseURL;
			}
			if (!authContext.options.baseURL) {
				return new Response("Base URL not set", { status: 400 });
			}

			const url = new URL(request.url);
			if (url.pathname === basePath || url.pathname === `${basePath}/`) {
				return new Response("Welcome to BetterAuth", { status: 200 });
			}
			const { handler } = router(authContext, options);
			return handler(request);
		},
		api,
		options: authContext.options,
	};
};

export type Auth = {
	handler: (request: Request) => Promise<Response>;
	api: ReturnType<typeof router>["endpoints"];
	options: BetterAuthOptions;
};
