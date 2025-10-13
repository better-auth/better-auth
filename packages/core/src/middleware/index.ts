import {
	createEndpoint,
	createMiddleware,
	type EndpointContext,
	type EndpointOptions,
	type InferUse,
	type MiddlewareContext,
	type MiddlewareInputContext,
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

type PostHooksMiddlewareType<O extends MiddlewareOptions = MiddlewareOptions> =
	ReturnType<
		typeof createMiddleware<
			O,
			{
				returned?: unknown;
				responseHeaders?: Headers;
			}
		>
	>;

type OptionsMiddlewareType<
	S extends BetterAuthPluginDBSchema<typeof schema>,
	O extends MiddlewareOptions = MiddlewareOptions,
> = ReturnType<typeof createMiddleware<O, AuthContext<S>>>;

type createMiddlewareType<
	S extends BetterAuthPluginDBSchema<typeof schema>,
	O extends MiddlewareOptions = MiddlewareOptions,
> = ReturnType<
	typeof createMiddleware.create<{
		use: [OptionsMiddlewareType<S, O>, PostHooksMiddlewareType<O>];
	}>
>;

const createMiddlewareFunc = createMiddleware.create({
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
}) as createMiddlewareType<any>;

export function createAuthMiddleware<
	S extends BetterAuthPluginDBSchema<typeof schema>,
	Options extends MiddlewareOptions,
	R,
>(
	options: Options,
	handler: (
		ctx: MiddlewareContext<
			Options,
			AuthContext<S> & {
				returned?: unknown;
				responseHeaders?: Headers;
			}
		>,
	) => Promise<R>,
): AuthMiddleware<S> {
	return createMiddlewareFunc(options, handler) as AuthMiddleware<S>;
}

const createEndpointFunc = createEndpoint.create({
	use: [optionsMiddleware],
}) as createEndpointType<any>;

type createEndpointType<S extends BetterAuthPluginDBSchema<typeof schema>> =
	ReturnType<typeof createEndpoint.create<{ use: [OptionsMiddlewareType<S>] }>>;

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

export type AuthEndpoint<S extends BetterAuthPluginDBSchema<typeof schema>> =
	ReturnType<createEndpointType<S>>;
export type AuthMiddleware<
	S extends BetterAuthPluginDBSchema<typeof schema>,
	O extends MiddlewareOptions = MiddlewareOptions,
> = ReturnType<createMiddlewareType<S, O>>;
