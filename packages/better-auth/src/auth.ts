import { getEndpoints, router } from "./api";
import { init } from "./init";
import type { BetterAuthOptions } from "./types/options";
import type {
	InferPluginTypes,
	InferSession,
	InferUser,
	PrettifyDeep,
} from "./types";
import { getBaseURL } from "./utils/url";
import type { FilterActions, InferAPI } from "./types/api";

export const betterAuth = <O extends BetterAuthOptions>(options: O) => {
	const authContext = init(options);
	const { api } = getEndpoints(authContext, options);

	return {
		handler: async (request: Request) => {
			const ctx = await authContext;
			const basePath = ctx.options.basePath || "/api/auth";
			const url = new URL(request.url);
			if (!ctx.options.baseURL) {
				const baseURL =
					getBaseURL(undefined, basePath) || `${url.origin}${basePath}`;
				ctx.options.baseURL = baseURL;
				ctx.baseURL = baseURL;
			}
			ctx.trustedOrigins.push(url.origin);
			if (!ctx.options.baseURL) {
				return new Response("Base URL not set", { status: 400 });
			}
			if (url.pathname === basePath || url.pathname === `${basePath}/`) {
				return new Response("Welcome to BetterAuth", { status: 200 });
			}
			const { handler } = router(ctx, options);
			return handler(request);
		},
		api: api as InferAPI<typeof api>,
		options: options as O,
		$context: authContext,
		$Infer: {} as {
			Session: {
				session: PrettifyDeep<InferSession<O>>;
				user: PrettifyDeep<InferUser<O>>;
			};
		} & InferPluginTypes<O>,
	};
};

export type Auth = {
	handler: (request: Request) => Promise<Response>;
	api: FilterActions<ReturnType<typeof router>["endpoints"]>;
	options: BetterAuthOptions;
};
