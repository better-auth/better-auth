import type { Endpoint } from "better-call";
import { getEndpoints, router } from "./api";
import { init } from "./init";
import type { BetterAuthOptions } from "./types/options";
import type {
	InferPluginTypes,
	InferSession,
	InferUser,
	Prettify,
	UnionToIntersection,
} from "./types";
import { getBaseURL } from "./utils/url";

type FilteredAPI<API> = Omit<
	API,
	API extends { [key in infer K]: Endpoint }
		? K extends string
			? K extends "getSession"
				? K
				: API[K]["options"]["metadata"] extends { isAction: false }
					? K
					: never
			: never
		: never
>;

type FilterActions<API> = Omit<
	API,
	API extends { [key in infer K]: Endpoint }
		? K extends string
			? API[K]["options"]["metadata"] extends { isAction: false }
				? K
				: never
			: never
		: never
>;

type InferSessionAPI<API, O extends BetterAuthOptions> = API extends {
	[key: string]: infer E;
}
	? UnionToIntersection<
			E extends Endpoint
				? E["path"] extends "/get-session"
					? {
							getSession: (context: {
								headers: Headers;
							}) => Promise<
								Prettify<
									Awaited<ReturnType<E>> & {
										session: InferSession<O>;
										user: Prettify<
											InferUser<O> & Awaited<ReturnType<E>> extends {
												user: infer U;
											}
												? U extends Record<string, any>
													? U
													: {}
												: {}
										>;
									}
								>
							>;
						}
					: never
				: never
		>
	: never;

type InferAPI<API, O extends BetterAuthOptions> = InferSessionAPI<API, O> &
	FilteredAPI<API>;

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
		api: api as InferAPI<typeof api, O>,
		options: options as O,
		$context: authContext,
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
	api: FilterActions<ReturnType<typeof router>["endpoints"]>;
	options: BetterAuthOptions;
};
