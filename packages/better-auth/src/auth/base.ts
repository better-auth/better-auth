import type { AuthContext, BetterAuthOptions } from "@better-auth/core";
import { runWithAdapter } from "@better-auth/core/context";
import { BASE_ERROR_CODES } from "@better-auth/core/error";
import { getEndpoints, router } from "../api";
import { resolveRequestContext } from "../context/helpers";
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

	// Built once on the first request and reused
	// only the per-request context varies.
	let routerHandler: ReturnType<typeof router>["handler"] | undefined;
	return {
		handler: async (request: Request) => {
			const ctx = await authContext;

			// Per-request context on a clone; the shared context is never mutated,
			// so concurrent requests on different hosts stay isolated.
			const handlerCtx = await resolveRequestContext(ctx, request);
			if (!routerHandler) {
				routerHandler = router(ctx, options, handlerCtx.baseURL).handler;
			}
			return runWithAdapter(handlerCtx.adapter, () =>
				routerHandler!(request, handlerCtx),
			);
		},
		api,
		options: options,
		$context: authContext,
		$ERROR_CODES: {
			...errorCodes,
			...BASE_ERROR_CODES,
		},
	} as any;
};
