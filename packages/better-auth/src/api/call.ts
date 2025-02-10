import {
	APIError,
	type Endpoint,
	type Method,
	createEndpoint,
	createMiddleware,
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

export const createAuthMiddleware = createMiddleware.create({
	use: [
		optionsMiddleware,
		/**
		 * Only use for post hooks
		 */
		createMiddleware(async () => {
			return {} as {
				returned?: unknown;
				endpoint: Endpoint;
			};
		}),
	],
});

export const createAuthEndpoint = createEndpoint.create({
	use: [optionsMiddleware],
});

export type AuthEndpoint = ReturnType<typeof createAuthEndpoint>;
export type AuthMiddleware = ReturnType<typeof createAuthMiddleware>;
