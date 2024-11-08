import type { Endpoint, Prettify } from "better-call";
import { getEndpoints, router } from "./api";
import { init } from "./init";
import type { BetterAuthOptions } from "./types/options";
import type { InferPluginTypes, InferSession, InferUser } from "./types";
import { getBaseURL } from "./utils/url";

type InferAPI<API> = Omit<
	API,
	API extends { [key in infer K]: Endpoint }
		? K extends string
			? API[K]["options"]["metadata"] extends { isAction: false }
				? K
				: never
			: never
		: never
>;

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
			ctx.trustedOrigins = [url.origin, ...(ctx.options.trustedOrigins || [])];
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
		$Infer: {} as {
			Session: {
				session: Prettify<InferSession<O>>;
				user: Prettify<InferUser<O>>;
			};
		} & InferPluginTypes<O>,
	};
};

export type Auth = {
	handler: (request: Request) => Promise<Response>;
	api: InferAPI<ReturnType<typeof router>["endpoints"]>;
	options: BetterAuthOptions;
};
