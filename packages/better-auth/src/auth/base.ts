import type { AuthContext, BetterAuthOptions } from "@better-auth/core";
import { runWithAdapter } from "@better-auth/core/context";
import { SchemaMismatchError } from "@better-auth/core/db/internal";
import { createLogger } from "@better-auth/core/env";
import { BASE_ERROR_CODES, BetterAuthError } from "@better-auth/core/error";
import {
	EVICTION_TIMEOUT_MS,
	settleByDeadline,
} from "@better-auth/core/utils/async";
import { getEndpoints, router } from "../api";
import type { InstallReport } from "../context/create-context";
import {
	getTrustedOrigins,
	getTrustedProviders,
	resolveDynamicTrustedProxyHeaders,
	resolveRequestContext,
} from "../context/helpers";
import type { Auth } from "../types";
import { getBaseURL, getOrigin, isDynamicBaseURLConfig } from "../utils/url";

const ABANDONED_INIT_MESSAGE = [
	`Better Auth initialization did not settle within ${EVICTION_TIMEOUT_MS}ms.`,
	"This has two causes. A runtime that ends I/O with the request that started it, such as Cloudflare Workers, stops settling a promise once that request responds. A dependency that initialization waits on, such as a database, can also stall.",
	"The failure is transient. The next request starts initialization again.",
	"On a request-scoped runtime, hand initialization to a background task handler, so the runtime keeps settling it after the request that started it:",
	"",
	'  import { withCloudflare } from "better-auth/cloudflare";',
	"",
	"  const auth = betterAuth(withCloudflare({ /* ... */ }));",
	"",
	"On another runtime, set advanced.backgroundTasks.handler to its equivalent of waitUntil.",
	"https://www.better-auth.com/docs/guides/optimizing-for-performance#cloudflare-workers",
].join("\n");

const startSchemaCheck = (ctx: AuthContext) => {
	const validateSchema = ctx.options.advanced?.database?.validateSchema;
	if (!ctx.checkSchema && validateSchema !== false) {
		const level = validateSchema === true ? "warn" : "debug";
		ctx.logger[level](
			`Schema validation is not available for adapter "${ctx.adapter.id}". Skipping schema validation. Database operations will proceed normally.`,
		);
	}
	const pendingSchemaCheck = ctx.checkSchema?.(ctx.logger);
	if (pendingSchemaCheck) {
		void pendingSchemaCheck.catch((error: unknown) => {
			ctx.logger.error(
				error instanceof SchemaMismatchError
					? error.message
					: "Could not validate the database schema. Check your database connection.",
			);
		});
	}
};

type InitializationAttempt = {
	context: Promise<AuthContext>;
	deadlineMs: number;
};

type InitializeAuthContext<Options extends BetterAuthOptions> = (
	options: Options,
	install: InstallReport,
) => Promise<AuthContext>;

export const createBetterAuth = <Options extends BetterAuthOptions>(
	options: Options,
	initFn: InitializeAuthContext<Options>,
): Auth<Options> => {
	let settledContext: Promise<AuthContext> | undefined;
	let attempt: InitializationAttempt | undefined;

	const start = (): InitializationAttempt => {
		const install: InstallReport = {};
		const entry: InitializationAttempt = {
			deadlineMs: Date.now() + EVICTION_TIMEOUT_MS,
			context: Promise.resolve()
				.then(() => initFn(options, install))
				.then(
					(ctx) => {
						startSchemaCheck(ctx);
						// An evicted attempt the background task handler kept alive
						// still settles, after the attempt that replaced it started.
						// It must not take that attempt's place.
						if (attempt === entry) {
							settledContext = entry.context;
							// One attempt becomes the context, so telemetry reports one
							// install for each Auth Instance.
							void install.send?.().catch((error: unknown) => {
								ctx.logger.error(
									"Could not report the install to telemetry.",
									error,
								);
							});
						}
						return ctx;
					},
					(error: unknown) => {
						if (attempt === entry) attempt = undefined;
						throw error;
					},
				),
		};
		try {
			// The schema check starts once initialization settles, and the
			// request that started it may respond before the lookup finishes.
			options.advanced?.backgroundTasks?.handler?.(
				entry.context
					.then((ctx) => ctx.checkSchema?.(ctx.logger))
					.catch(() => {}),
			);
		} catch (error) {
			createLogger(options.logger).debug(
				"advanced.backgroundTasks.handler threw, so initialization was not handed to it. A runtime that scopes the handler to a request rejects it at module scope.",
				error,
			);
		}
		return entry;
	};

	const joinAuthContext = (): Promise<AuthContext> => {
		if (settledContext !== undefined) return settledContext;
		if (attempt && Date.now() >= attempt.deadlineMs) attempt = undefined;
		const entry = (attempt ??= start());
		return settleByDeadline(entry.context, entry.deadlineMs, () => {
			throw new BetterAuthError(ABANDONED_INIT_MESSAGE);
		});
	};

	const { api } = getEndpoints(joinAuthContext, options);
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
		const ctx = await joinAuthContext();
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
			return joinAuthContext();
		},
		$ERROR_CODES: {
			...errorCodes,
			...BASE_ERROR_CODES,
		},
	} as any;
};
