import { createEndpoint, createMiddleware, type EndpointOptions, type EndpointContext } from "better-call";
import type { AuthContext } from "../init";
import type { AuthPluginSchema } from "../plugins";

export const optionsMiddleware = createMiddleware(async <S extends AuthPluginSchema>() => {
	/**
	 * This will be passed on the instance of
	 * the context. Used to infer the type
	 * here.
	 */
	return {} as AuthContext<S>;
});

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

// Create the actual callable once so the memory etc is more optimized
const createEndpointFunc = createEndpoint.create({
	use: [optionsMiddleware],
});

function createEndpointType<S extends AuthPluginSchema>() {
	return createEndpoint.create({
		use: [optionsMiddleware<S>],
	})
}

// Use a separate function to make sure the type is correct
export function createAuthEndpoint<S extends AuthPluginSchema, Path extends string, Opts extends EndpointOptions, R>(path: Path, options: Opts, handler: (ctx: EndpointContext<Path, Opts, AuthContext<S>>) => Promise<R>) {
	return createEndpointFunc(path, options, handler)
}


export type AuthEndpoint<S extends AuthPluginSchema> = ReturnType<ReturnType<typeof createEndpointType<S>>>;
export type AuthMiddleware = ReturnType<typeof createAuthMiddleware>;
