import {
	createEndpoint,
	createMiddleware,
	type EndpointContext,
	type EndpointOptions,
	type MiddlewareOptions,
} from "better-call";
import type { AuthContext } from "../types";
import type { BetterAuthPluginDBSchema } from "../db";
import type { schema } from "../db/schema";

export const optionsMiddleware = createMiddleware(async () => {
	/**
	 * This will be passed on the instance of
	 * the context. Used to infer the type
	 * here.
	 */
	return {};
}) as OptionsMiddlewareType<any>;

type OptionsMiddlewareType<
	S extends BetterAuthPluginDBSchema<typeof schema>,
	O extends MiddlewareOptions = MiddlewareOptions,
> = ReturnType<typeof createMiddleware<O, AuthContext<S>>>;

export const createAuthMiddleware = createMiddleware.create({
	use: [
		optionsMiddleware,
		/**
		 * Only use for post hooks
		 */
		createMiddleware(async () => {
			return {} as {
				returned?: unknown;
				responseHeaders?: Headers;
			};
		}),
	],
});

const createEndpointFunc = createEndpoint.create({
	use: [optionsMiddleware],
}) as createEndpointType<any>;

type createEndpointType<
	S extends BetterAuthPluginDBSchema<typeof schema>,
> = ReturnType<typeof createEndpoint.create<{use: [OptionsMiddlewareType<S>]}>>;

// Use a separate function to make sure the type is correct
export function createAuthEndpoint<
	S extends BetterAuthPluginDBSchema<typeof schema>,
	Path extends string,
	Opts extends EndpointOptions,
	R,
>(
	path: Path,
	options: Opts,
	handler: (ctx: EndpointContext<Path, Opts, AuthContext<S>>) => Promise<R>,
): AuthEndpoint<S> {
	return createEndpointFunc(path, options, handler);
}

export type AuthEndpoint<S extends BetterAuthPluginDBSchema<typeof schema>> = ReturnType<createEndpointType<S>>;
export type AuthMiddleware = ReturnType<typeof createAuthMiddleware>;
