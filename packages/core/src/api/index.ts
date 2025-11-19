import type { EndpointContext, EndpointOptions } from "better-call";
import { createEndpoint, createMiddleware } from "better-call";
import { runWithEndpointContext } from "../context";
import type { AuthContext } from "../types";

export const optionsMiddleware = createMiddleware(async () => {
	/**
	 * This will be passed on the instance of
	 * the context. Used to infer the type
	 * here.
	 */
	return {} as AuthContext;
});

export const createAuthMiddleware = createMiddleware.create({
	use: [
		optionsMiddleware,
		/**
		 * Only use for post hooks
		 */
		createMiddleware(async () => {
			return {} as {
				returned?: unknown | undefined;
				responseHeaders?: Headers | undefined;
			};
		}),
	],
});

const use = [optionsMiddleware];

export const createAuthEndpoint = <
	Path extends string,
	Opts extends EndpointOptions,
	R,
>(
	path: Path,
	options: Opts,
	handler: (ctx: EndpointContext<Path, Opts, AuthContext>) => Promise<R>,
) => {
	return createEndpoint(
		path,
		{
			...options,
			use: [...(options?.use || []), ...use],
		},
		// todo: prettify the code, we want to call `runWithEndpointContext` to top level
		async (ctx) => runWithEndpointContext(ctx as any, () => handler(ctx)),
	);
};

export type AuthEndpoint = ReturnType<typeof createAuthEndpoint>;
export type AuthMiddleware = ReturnType<typeof createAuthMiddleware>;
