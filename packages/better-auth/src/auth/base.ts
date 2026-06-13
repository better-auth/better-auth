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
				// Resolve request-derived state on a per-request clone so it never
				// mutates the shared context. This isolates a request-dependent
				// `trustedOrigins`/`trustedProviders` callback from concurrent
				// requests, and (for the no-baseURL case) stops the first request's
				// host from being memoized onto the shared context, where it would
				// be reused for every later request's token links.
				handlerCtx = Object.create(
					Object.getPrototypeOf(ctx),
					Object.getOwnPropertyDescriptors(ctx),
				) as AuthContext;

				let trustOptions = ctx.options;
				if (!ctx.options.baseURL) {
					const baseURL = getBaseURL(
						undefined,
						basePath,
						request,
						undefined,
						ctx.options.advanced?.trustedProxyHeaders,
					);
					if (!baseURL) {
						throw new BetterAuthError(
							"Could not get base URL from request. Please provide a valid base URL.",
						);
					}
					handlerCtx.baseURL = baseURL;
					handlerCtx.options = {
						...ctx.options,
						baseURL: getOrigin(baseURL) || undefined,
					};
					trustOptions = handlerCtx.options;
				}

				handlerCtx.trustedOrigins = await getTrustedOrigins(
					trustOptions,
					request,
				);
				handlerCtx.trustedProviders = await getTrustedProviders(
					trustOptions,
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
