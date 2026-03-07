import type { AuthContext, BetterAuthOptions } from "@better-auth/core";
import { runWithAdapter } from "@better-auth/core/context";
import { BASE_ERROR_CODES, BetterAuthError } from "@better-auth/core/error";
import { getEndpoints, publicRouter, router } from "../api";
import { getTrustedOrigins, getTrustedProviders } from "../context/helpers";
import { createCookieGetter, getCookies } from "../cookies";
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
	const { api, publicApi } = getEndpoints(authContext, options);
	const hasPublicEndpoints =
		options.plugins?.some(
			(plugin) =>
				plugin.publicEndpoints &&
				Object.keys(plugin.publicEndpoints).length > 0,
		) ?? false;
	const errorCodes = options.plugins?.reduce((acc, plugin) => {
		if (plugin.$ERROR_CODES) {
			return {
				...acc,
				...plugin.$ERROR_CODES,
			};
		}
		return acc;
	}, {});

	const resolveHandlerContext = async (
		request: Request,
	): Promise<AuthContext> => {
		const ctx = await authContext;
		const basePath = ctx.options.basePath || "/api/auth";

		let handlerCtx: AuthContext;

		if (isDynamicBaseURLConfig(options.baseURL)) {
			// Create per-request context to avoid concurrent request race conditions.
			// Each request may resolve to a different host, so we must not mutate the shared ctx.
			handlerCtx = Object.create(
				Object.getPrototypeOf(ctx),
				Object.getOwnPropertyDescriptors(ctx),
			) as AuthContext;
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
			// When crossSubDomainCookies is enabled, recompute cookies
			// per-request so the domain matches the resolved host.
			if (options.advanced?.crossSubDomainCookies?.enabled) {
				handlerCtx.authCookies = getCookies(handlerCtx.options);
				handlerCtx.createAuthCookie = createCookieGetter(handlerCtx.options);
			}
		} else {
			handlerCtx = ctx;
			// Static config: resolve once from the first request when no
			// baseURL was provided. Mutates the shared ctx intentionally so
			// subsequent requests reuse the cached value.
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
			handlerCtx.trustedOrigins = await getTrustedOrigins(ctx.options, request);
		}
		handlerCtx.trustedProviders = await getTrustedProviders(
			handlerCtx.options,
			request,
		);
		return handlerCtx;
	};

	return {
		handler: async (request: Request) => {
			const handlerCtx = await resolveHandlerContext(request);

			if (hasPublicEndpoints) {
				const pathname = new URL(request.url).pathname;
				if (pathname.startsWith("/.well-known/")) {
					const { handler } = publicRouter(handlerCtx, options);
					return runWithAdapter(handlerCtx.adapter, () => handler(request));
				}
			}

			const { handler } = router(handlerCtx, options);
			return runWithAdapter(handlerCtx.adapter, () => handler(request));
		},
		publicHandler: hasPublicEndpoints
			? async (request: Request) => {
					const handlerCtx = await resolveHandlerContext(request);
					const { handler } = publicRouter(handlerCtx, options);
					return runWithAdapter(handlerCtx.adapter, () => handler(request));
				}
			: undefined,
		api,
		publicApi: hasPublicEndpoints ? publicApi : undefined,
		options: options,
		$context: authContext,
		$ERROR_CODES: {
			...errorCodes,
			...BASE_ERROR_CODES,
		},
	} as any;
};
