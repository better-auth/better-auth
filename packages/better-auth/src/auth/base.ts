import type { AuthContext, BetterAuthOptions } from "@better-auth/core";
import { runWithAdapter } from "@better-auth/core/context";
import { BASE_ERROR_CODES } from "@better-auth/core/error";
import { getEndpoints, router } from "../api";
import { resolvePerRequestContext } from "../context/helpers";
import type { Auth } from "../types";

export const createBetterAuth = <Options extends BetterAuthOptions>(
	options: Options,
	initFn: (options: Options) => Promise<AuthContext>,
): Auth<Options> => {
	const authContext = initFn(options);
	const { api } = getEndpoints(authContext, options);
	const errorCodes = options.plugins?.reduce((acc, plugin) => {
		if (plugin.$ERROR_CODES) {
			return {
				...acc,
				...plugin.$ERROR_CODES,
			};
		}
		return acc;
	}, {});
	const handler = async (request: Request) => {
		const ctx = await authContext;
		// Resolve request-derived state (trustedOrigins/trustedProviders, and
		// the canonical origin when no baseURL is configured) on a per-request
		// clone so concurrent requests on different hosts never mutate the
		// shared context.
		const handlerCtx = await resolvePerRequestContext(ctx, request);
		const { handler } = router(handlerCtx, options);
		return runWithAdapter(handlerCtx.adapter, () => handler(request));
	};
	return {
		handler,
		fetch: handler,
		api,
		options: options,
		$context: authContext,
		$ERROR_CODES: {
			...errorCodes,
			...BASE_ERROR_CODES,
		},
	} as any;
};
