import {
	type Endpoint,
	type EndpointResponse,
	createEndpointCreator,
	createMiddleware,
	createMiddlewareCreator,
} from "better-call";
import type { AuthContext } from "../init";
import type { BetterAuthOptions } from "../types/options";

export const optionsMiddleware = createMiddleware(async () => {
	/**
	 * This will be passed on the instance of
	 * the context. Used to infer the type
	 * here.
	 */
	return {} as AuthContext;
});

export const createAuthMiddleware = createMiddlewareCreator({
	use: [
		optionsMiddleware,
		/**
		 * Only use for post hooks
		 */
		createMiddleware(async () => {
			return {} as {
				returned?: Response;
			};
		}),
	],
});

export const createAuthEndpoint = createEndpointCreator({
	use: [optionsMiddleware],
});

export type AuthEndpoint = Endpoint<
	(ctx: {
		options: BetterAuthOptions;
		body: any;
		query: any;
		params: any;
		headers: Headers;
	}) => Promise<EndpointResponse>
>;

export type AuthMiddleware = ReturnType<typeof createAuthMiddleware>;
