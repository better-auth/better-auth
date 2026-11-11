import type { AuthContext, BetterAuthOptions } from "@better-auth/core";
import { runWithAdapter } from "@better-auth/core/context";
import { SchemaMismatchError } from "@better-auth/core/db/internal";
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
	const postInit = (ctx: AuthContext) => {
		const validateSchema = ctx.options.advanced?.database?.validateSchema;
		if (!ctx.checkSchema && validateSchema !== false) {
			const level = validateSchema === true ? "warn" : "debug";
			ctx.logger[level](
				`Schema validation is not available for adapter "${ctx.adapter.id}". Skipping schema validation. Database operations will proceed normally.`,
			);
		}
		const pendingSchemaCheck = ctx.checkSchema?.();
		if (pendingSchemaCheck) {
			void pendingSchemaCheck.catch((error: unknown) => {
				ctx.logger.error(
					error instanceof SchemaMismatchError
						? error.message
						: "Could not validate the database schema. Check your database connection.",
				);
			});
		}
		return ctx;
	};
	// A rejected init must not be cached forever, otherwise a transient
	// failure (e.g. a plugin's init briefly losing its DB connection) would
	// 500 every request for the lifetime of the process. `pending` is cleared
	// on rejection so the next caller retries `initFn` instead of re-awaiting
	// the same failed promise. A successful context is memoized and never
	// re-created.
	let pending: Promise<AuthContext> | undefined;
	const getAuthContext = (): Promise<AuthContext> =>
		(pending ??= initFn(options)
			.then(postInit)
			.catch((error: unknown) => {
				pending = undefined;
				throw error;
			}));
	// Start init eagerly so cold-start latency isn't paid on the first
	// request, without letting that eager attempt become an unhandled
	// rejection if it fails before anything awaits it.
	void getAuthContext().catch(() => {});
	// A thenable rather than a plain cached promise: every `await authContext`
	// re-invokes `getAuthContext()`, so callers that resolved this once at
	// startup (like the `api` object below) still observe a retried context
	// after a failed init.
	const authContext: Promise<AuthContext> = {
		then: (onFulfilled, onRejected) =>
			getAuthContext().then(onFulfilled, onRejected),
	} as Promise<AuthContext>;
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
		const ctx = await getAuthContext();
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
	};
	return {
		handler,
		fetch: handler,
		api,
		options: options,
		get $context() {
			return getAuthContext();
		},
		$ERROR_CODES: {
			...errorCodes,
			...BASE_ERROR_CODES,
		},
	} as any;
};
