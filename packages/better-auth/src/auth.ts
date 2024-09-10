import type { Endpoint } from "better-call";
import { getEndpoints, router } from "./api";
import { init } from "./init";
import type { BetterAuthOptions } from "./types/options";

export const betterAuth = <O extends BetterAuthOptions>(options: O) => {
	const authContext = init(options);
	const { api } = getEndpoints(authContext, options);
	type API = typeof api;
	return {
		handler: async (request: Request) => {
			const basePath = authContext.options.basePath;
			const url = new URL(request.url);
			if (!authContext.options.baseURL) {
				const baseURL = `${url.origin}/api/auth`;
				authContext.options.baseURL = baseURL;
				authContext.baseURL = baseURL;
			}
			if (!authContext.options.baseURL) {
				return new Response("Base URL not set", { status: 400 });
			}
			if (url.pathname === basePath || url.pathname === `${basePath}/`) {
				return new Response("Welcome to BetterAuth", { status: 200 });
			}
			const { handler } = router(authContext, options);
			return handler(request);
		},
		api: api as Omit<
			API,
			API extends { [key in infer K]: Endpoint }
				? K extends string
					? API[K]["options"]["metadata"] extends { isAction: false }
						? K
						: never
					: never
				: never
		>,
		options: authContext.options as O,
	};
};

export type Auth = {
	handler: (request: Request) => Promise<Response>;
	api: ReturnType<typeof router>["endpoints"];
	options: BetterAuthOptions;
};
