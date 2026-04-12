import type { AuthContext, BetterAuthOptions } from "@better-auth/core";
import { runWithAdapter } from "@better-auth/core/context";
import { BASE_ERROR_CODES, BetterAuthError } from "@better-auth/core/error";
import { getEndpoints, router } from "../api";
import {
	getTrustedOrigins,
	getTrustedProviders,
	resolveDynamicTrustedProxyHeaders,
	resolveRequestContext,
} from "../context/helpers";
import type { Auth } from "../types";
import { getBaseURL, getOrigin, isDynamicBaseURLConfig } from "../utils/url";

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
	return {
		handler: async (request: Request) => {
			const ctx = await authContext;
			const basePath = ctx.options.basePath || "/api/auth";

			let handlerCtx: AuthContext;

			if (isDynamicBaseURLConfig(options.baseURL)) {
				// Per-request clone avoids mutating shared ctx under concurrent
				// requests that may resolve to different hosts.
				handlerCtx = await resolveRequestContext(
					ctx,
					request,
					resolveDynamicTrustedProxyHeaders(ctx.options),
				);
			} else {
				handlerCtx = ctx;
				// Static config with no baseURL: memoize on the shared ctx from the
				// first request. A concurrent-first-requests race is harmless since
				// both writes resolve to the same value.
				if (!ctx.options.baseURL) {
					const baseURL = getBaseURL(
						undefined,
						basePath,
						request,
						undefined,
						ctx.options.advanced?.trustedProxyHeaders,
					);
					if (baseURL) {
						ctx.baseURL = baseURL;
						ctx.options.baseURL = getOrigin(ctx.baseURL) || undefined;
					} else {
						throw new BetterAuthError(
							"Could not get base URL from request. Please provide a valid base URL.",
						);
					}
				}
				handlerCtx.trustedOrigins = await getTrustedOrigins(
					ctx.options,
					request,
				);
				handlerCtx.trustedProviders = await getTrustedProviders(
					ctx.options,
					request,
				);
			}

			const { handler } = router(handlerCtx, options);
			return runWithAdapter(handlerCtx.adapter, () => handler(request));
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
