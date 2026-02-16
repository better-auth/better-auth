import type { AuthContext, BetterAuthOptions } from "@better-auth/core";
import { runWithAdapter } from "@better-auth/core/context";
import { BASE_ERROR_CODES, BetterAuthError } from "@better-auth/core/error";
import { getEndpoints, router } from "../api";
import { getTrustedOrigins } from "../context/helpers";
import type { Auth } from "../types";
import {
	getBaseURL,
	getOrigin,
	isDynamicBaseURLConfig,
	resolveBaseURL,
} from "../utils/url";

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
				// Create per-request context to avoid concurrent request race conditions.
				// Each request may resolve to a different host, so we must not mutate the shared ctx.
				handlerCtx = Object.create(ctx) as AuthContext;
				const baseURL = resolveBaseURL(options.baseURL, basePath, request);
				if (baseURL) {
					handlerCtx.baseURL = baseURL;
					handlerCtx.options = {
						...ctx.options,
						baseURL: getOrigin(baseURL) || undefined,
					};
				} else {
					throw new BetterAuthError(
						"Could not resolve base URL from request. Check your allowedHosts config.",
					);
				}
			// Use a typed variable so the baseURL override doesn't need
				// an unsafe cast — the spread is structurally BetterAuthOptions.
				const trustedOriginOptions: BetterAuthOptions = {
					...handlerCtx.options,
					baseURL: options.baseURL,
				};
				handlerCtx.trustedOrigins = await getTrustedOrigins(
					trustedOriginOptions,
					request,
				);
			} else if (!ctx.options.baseURL) {
				// No static baseURL configured — resolve per-request from headers.
				// Uses per-request context so concurrent first-requests don't race.
				handlerCtx = Object.create(ctx) as AuthContext;
				const baseURL = getBaseURL(
					undefined,
					basePath,
					request,
					undefined,
					ctx.options.advanced?.trustedProxyHeaders,
				);
				if (baseURL) {
					handlerCtx.baseURL = baseURL;
					handlerCtx.options = {
						...ctx.options,
						baseURL: getOrigin(baseURL) || undefined,
					};
				} else {
					throw new BetterAuthError(
						"Could not get base URL from request. Please provide a valid base URL.",
					);
				}
				handlerCtx.trustedOrigins = await getTrustedOrigins(
					handlerCtx.options,
					request,
				);
			} else {
				// Static baseURL is already set — use shared ctx directly.
				handlerCtx = ctx;
				handlerCtx.trustedOrigins = await getTrustedOrigins(
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
