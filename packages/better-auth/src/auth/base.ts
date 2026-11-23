import type { AuthContext, BetterAuthOptions } from "@better-auth/core";
import type { AsyncLocalStorage } from "@better-auth/core/async_hooks";
import { getAsyncLocalStorage } from "@better-auth/core/async_hooks";
import { runWithAdapter } from "@better-auth/core/context";
import { BASE_ERROR_CODES, BetterAuthError } from "@better-auth/core/error";
import { createAuthRouter, getEndpoints } from "../api";
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
	const authContext = initFn(options).then((ctx) => {
		const validateSchema = ctx.options.advanced?.database?.validateSchema;
		if (!ctx.checkSchema && validateSchema !== false) {
			const level = validateSchema === true ? "warn" : "debug";
			ctx.logger[level](
				`Schema validation is not available for adapter "${ctx.adapter.id}". Skipping schema validation. Database operations will proceed normally.`,
			);
		}
		return ctx;
	});
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
	// One router per base path, reused across requests. A base path comes from
	// the configuration (a configured URL's path, otherwise `basePath`) and never
	// from the request, so this holds one entry per configured base path. Each
	// request runs inside `requestContext` holding its own `handlerCtx`, which is
	// the context the shared router's hooks and endpoints read.
	const routers = new Map<string, (request: Request) => Promise<Response>>();
	let requestContext: Promise<AsyncLocalStorage<AuthContext>> | undefined;
	const handler = async (request: Request) => {
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

		requestContext ??= getAsyncLocalStorage().then(
			(AsyncLocalStorage) => new AsyncLocalStorage<AuthContext>(),
		);
		const storage = await requestContext;
		const routerBasePath = new URL(handlerCtx.baseURL).pathname;
		let routerHandler = routers.get(routerBasePath);
		if (!routerHandler) {
			routerHandler = createAuthRouter(
				() => storage.getStore()!,
				routerBasePath,
				options,
			).handler;
			routers.set(routerBasePath, routerHandler);
		}
		return runWithAdapter(handlerCtx.adapter, () =>
			storage.run(handlerCtx, () => routerHandler(request)),
		);
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
