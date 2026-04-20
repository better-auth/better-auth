import type { AuthContext, HookEndpointContext } from "@better-auth/core";
import type { AuthMiddleware } from "@better-auth/core/api";
import {
	hasRequestState,
	runWithEndpointContext,
	runWithRequestState,
} from "@better-auth/core/context";
import { writers } from "@better-auth/core/context/internals";
import { shouldPublishLog } from "@better-auth/core/env";
import { APIError, BetterAuthError } from "@better-auth/core/error";
import {
	ATTR_CONTEXT,
	ATTR_HOOK_TYPE,
	ATTR_HTTP_ROUTE,
	ATTR_OPERATION_ID,
	withSpan,
} from "@better-auth/core/instrumentation";
import type {
	Endpoint,
	EndpointContext,
	EndpointOptions,
	InputContext,
} from "better-call";
import { kAPIErrorHeaderSymbol, toResponse } from "better-call";
import { createDefu } from "defu";
import {
	pickSource,
	resolveDynamicTrustedProxyHeaders,
	resolveRequestContext,
} from "../context/helpers";
import { expireSessionCookiesInHeaders } from "../cookies";
import { isAPIError } from "../utils/is-api-error";
import { isDynamicBaseURLConfig, isRequestLike } from "../utils/url";

type InternalContext = Partial<
	InputContext<string, any> & EndpointContext<string, any>
> & {
	path: string;
	asResponse?: boolean | undefined;
	context: AuthContext & {
		logger: AuthContext["logger"];
		returned?: unknown | undefined;
		responseHeaders?: Headers | undefined;
	};
};

const defuReplaceArrays = createDefu((obj, key, value) => {
	if (Array.isArray(obj[key]) && Array.isArray(value)) {
		obj[key] = value;
		return true;
	}
});

type Hook = {
	matcher: (context: HookEndpointContext) => boolean;
	handler: AuthMiddleware;
};

function normalizeHeaders(
	headers:
		| Headers
		| Record<string, string>
		| [string, string][]
		| null
		| undefined,
): Headers {
	if (headers instanceof Headers) {
		return headers;
	}
	return new Headers(headers ?? undefined);
}

async function commitFinalizedSignIn(context: InternalContext): Promise<void> {
	const finalizedSignIn = context.context.getFinalizedSignIn();
	await finalizedSignIn?.commit?.();
}

/**
 * Fires the `onSuccess` closure a finalized sign-in registered with
 * `finalizeSignIn({ onSuccess })`. Invoked once after-hooks complete without
 * converting the response into a failure, so any side-effects it writes
 * (trusted-device rotation, best-effort audit marks) are strictly durable.
 * Errors are logged and swallowed: the sign-in already succeeded and
 * best-effort writes must not rebound into an error response.
 */
async function runFinalizedSignInOnSuccess(
	context: InternalContext,
): Promise<void> {
	const finalizedSignIn = context.context.getFinalizedSignIn();
	if (!finalizedSignIn?.onSuccess) {
		return;
	}
	try {
		await finalizedSignIn.onSuccess();
	} catch (error) {
		context.context.logger.error(
			"Sign-in onSuccess callback failed; sign-in succeeded, side-effect did not.",
			error,
		);
	}
}

async function rollBackFinalizedSignIn(
	context: InternalContext,
): Promise<void> {
	const finalizedSignIn = context.context.getFinalizedSignIn();
	if (!finalizedSignIn) {
		return;
	}
	try {
		await context.context.internalAdapter.deleteSession(
			finalizedSignIn.session.token,
		);
	} catch (error) {
		context.context.logger.error(
			"Failed to roll back finalized sign-in after request failure",
			error,
		);
	}
	// Undo handler-side state the dispatcher cannot reach on its own (e.g. an
	// atomically-consumed sign-in attempt), so a retry can complete instead of
	// failing with INVALID_TWO_FACTOR_COOKIE.
	try {
		await finalizedSignIn.rollback?.();
	} catch (error) {
		context.context.logger.error(
			"Failed to run sign-in rollback after request failure",
			error,
		);
	}
	// Finalizers ran before after-hooks, so the session `Set-Cookie` is
	// already on the outgoing response. Append an expired cookie so the
	// browser discards the now-orphaned token instead of 401-ing on it.
	const responseHeaders = context.context.responseHeaders;
	if (responseHeaders) {
		expireSessionCookiesInHeaders(responseHeaders, context.context.authCookies);
	}
	const ctxWriters = writers(context.context);
	ctxWriters.setNewSession(null);
	ctxWriters.setFinalizedSignIn(null);
}

function isSuccessfulAuthFinalization(
	response: unknown,
	context: InternalContext,
): boolean {
	if (!context.context.getFinalizedSignIn()) {
		return false;
	}
	if (!isAPIError(response)) {
		return true;
	}
	return response.statusCode >= 300 && response.statusCode < 400;
}

const hooksSourceWeakMap = new WeakMap<
	AuthMiddleware,
	`user` | `plugin:${string}`
>();

function getOperationId(endpoint: Endpoint | undefined, key: string): string {
	if (!endpoint?.options) return key;
	const opts = endpoint.options as {
		operationId?: string;
		metadata?: { openapi?: { operationId?: string } };
	};
	return opts.operationId ?? opts.metadata?.openapi?.operationId ?? key;
}

type UserInputContext = Partial<
	InputContext<string, any> & EndpointContext<string, any>
>;

/**
 * Resolves the per-call `AuthContext` for endpoints with a dynamic `baseURL`.
 *
 * - `rawCtx.baseURL` already set: HTTP handler rehydrated upstream; return as-is.
 * - Direct `auth.api` call with a source or a configured `fallback`: resolve here.
 * - Neither: throw `APIError` with a helpful message. Leaving `baseURL = ""`
 *   would let plugins build `new URL("")` and crash cryptically downstream.
 */
async function resolveDynamicContext(
	rawCtx: AuthContext,
	input: UserInputContext | undefined,
): Promise<AuthContext> {
	if (rawCtx.baseURL) return rawCtx;

	const source = pickSource(input);
	const config = rawCtx.options.baseURL;
	const hasFallback =
		isDynamicBaseURLConfig(config) && Boolean(config.fallback);

	if (source === undefined && !hasFallback) {
		throw new APIError("INTERNAL_SERVER_ERROR", {
			message:
				"Dynamic baseURL could not be resolved for this direct auth.api call. " +
				"Pass `headers: request.headers` (or `request`) to the call, " +
				"or add `fallback` to your baseURL config.",
		});
	}

	try {
		return await resolveRequestContext(
			rawCtx,
			source,
			resolveDynamicTrustedProxyHeaders(rawCtx.options),
		);
	} catch (err) {
		if (err instanceof BetterAuthError) {
			throw new APIError("INTERNAL_SERVER_ERROR", { message: err.message });
		}
		throw err;
	}
}

export function toAuthEndpoints<const E extends Record<string, Endpoint>>(
	endpoints: E,
	ctx: AuthContext | Promise<AuthContext>,
): E {
	const api: Record<
		string,
		((
			context: EndpointContext<string, any> & InputContext<string, any>,
		) => Promise<any>) & {
			path?: string | undefined;
			options?: EndpointOptions | undefined;
		}
	> = {};

	for (const [key, endpoint] of Object.entries(endpoints)) {
		api[key] = async (context?: UserInputContext) => {
			const operationId = getOperationId(endpoint, key);
			const endpointMethod = endpoint?.options?.method;
			const defaultMethod = Array.isArray(endpointMethod)
				? endpointMethod[0]
				: endpointMethod;

			const run = async () => {
				const rawContext = await ctx;
				const methodName =
					context?.method ?? context?.request?.method ?? defaultMethod ?? "?";
				const route = endpoint.path ?? "/:virtual";

				const authContext = isDynamicBaseURLConfig(rawContext.options.baseURL)
					? await resolveDynamicContext(rawContext, context)
					: rawContext;

				let internalContext: InternalContext = {
					...context,
					context: {
						...authContext,
						returned: undefined,
						responseHeaders: undefined,
						session: null,
					},
					path: endpoint.path,
					headers: context?.headers ? new Headers(context?.headers) : undefined,
				};
				const hasRequest = isRequestLike(context?.request);
				const shouldReturnResponse = context?.asResponse ?? hasRequest;
				return withSpan(
					`${methodName} ${route}`,
					{
						[ATTR_HTTP_ROUTE]: route,
						[ATTR_OPERATION_ID]: operationId,
					},
					async () =>
						runWithEndpointContext(internalContext, async () => {
							const { beforeHooks, afterHooks } = getHooks(authContext);
							const before = await runBeforeHooks(
								internalContext,
								beforeHooks,
								endpoint,
								operationId,
							);
							/**
							 * If `before.context` is returned, it should
							 * get merged with the original context
							 */
							if (
								"context" in before &&
								before.context &&
								typeof before.context === "object"
							) {
								const { headers, ...rest } = before.context as {
									headers: Headers;
								};
								/**
								 * Headers should be merged differently
								 * so the hook doesn't override the whole
								 * header
								 */
								if (headers) {
									headers.forEach((value, key) => {
										(internalContext.headers as Headers).set(key, value);
									});
								}
								internalContext = defuReplaceArrays(rest, internalContext);
							} else if (before) {
								/* Return before hook response if it's anything other than a context return */
								return shouldReturnResponse
									? toResponse(before, {
											headers: context?.headers,
										})
									: context?.returnHeaders
										? {
												headers: context?.headers,
												response: before,
											}
										: before;
							}

							internalContext.asResponse = false;
							internalContext.returnHeaders = true;
							internalContext.returnStatus = true;
							const result = (await runWithEndpointContext(
								internalContext,
								() =>
									withSpan(
										`handler ${route}`,
										{
											[ATTR_HTTP_ROUTE]: route,
											[ATTR_OPERATION_ID]: operationId,
										},
										() => (endpoint as any)(internalContext as any),
									),
							).catch(async (e: any) => {
								if (isAPIError(e)) {
									/**
									 * API Errors from response are caught
									 * and returned to hooks
									 */
									return {
										response: e,
										status: e.statusCode,
										headers: normalizeHeaders(e.headers),
									};
								}
								// Non-APIError throw escapes the handler path before
								// after-hooks get a chance to run; clean up any session
								// row `finalizeSignIn` may have already persisted.
								await rollBackFinalizedSignIn(internalContext);
								throw e;
							})) as {
								headers: Headers;
								response: any;
								status: number;
							};

							//if response object is returned we skip after hooks and post processing
							if (result && result instanceof Response) {
								return result;
							}

							internalContext.context.returned = result.response;
							result.headers = normalizeHeaders(result.headers);
							internalContext.context.responseHeaders = result.headers;
							try {
								/**
								 * Commit the session cookie (and any sibling rotations) BEFORE
								 * after-hooks run so plugins that read `set-cookie` from
								 * `responseHeaders` (bearer, oidc-provider, mcp) observe the
								 * freshly issued session. If an after-hook converts the response
								 * into an error, the DB row is rolled back below; the emitted
								 * cookie then references a dead session and is rejected on next
								 * use.
								 */
								const finalizationWasSuccessful = isSuccessfulAuthFinalization(
									result.response,
									internalContext,
								);
								if (finalizationWasSuccessful) {
									await commitFinalizedSignIn(internalContext);
								}

								const preHookResponse = result.response;
								const after = await runAfterHooks(
									internalContext,
									afterHooks,
									endpoint,
									operationId,
								);

								if (after.response) {
									result.response = after.response;
								}

								/**
								 * Only roll back when the response actually represents a
								 * failed sign-in. A 3xx redirect is a successful auth outcome
								 * regardless of whether it was the handler's own response or
								 * an after-hook replacement (e.g. oidc-provider redirecting
								 * to the consent page after /sign-in/email).
								 */
								const isRedirectResponse =
									isAPIError(result.response) &&
									result.response.statusCode >= 300 &&
									result.response.statusCode < 400;
								const afterHooksReplacedResponse =
									result.response !== preHookResponse;
								const shouldRollback =
									isAPIError(result.response) &&
									!isRedirectResponse &&
									(!finalizationWasSuccessful || afterHooksReplacedResponse);
								if (shouldRollback) {
									await rollBackFinalizedSignIn(internalContext);
								}

								if (
									isAPIError(result.response) &&
									shouldPublishLog(authContext.logger.level, "debug")
								) {
									// inherit stack from errorStack if debug mode is enabled
									result.response.stack = result.response.errorStack;
								}

								if (isAPIError(result.response) && !shouldReturnResponse) {
									// `throw` falls into the outer catch which rolls back;
									// firing `onSuccess` *before* the throw would leak its
									// side-effects when the rollback expires the session.
									throw result.response;
								}

								if (!shouldRollback && finalizationWasSuccessful) {
									// After-hooks accepted the sign-in and the redirect path
									// has had its chance to unwind. Fire post-success
									// side-effects now, when the outcome is confirmed. This
									// keeps durable writes (trusted-device rotation etc.) out
									// of the commit window and eliminates the need for a
									// paired rollback.
									await runFinalizedSignInOnSuccess(internalContext);
								}

								let response: unknown;
								if (shouldReturnResponse) {
									response = toResponse(result.response, {
										headers: result.headers,
										status: result.status,
									});
								} else if (context?.returnHeaders) {
									if (context?.returnStatus) {
										response = {
											headers: result.headers,
											response: result.response,
											status: result.status,
										};
									} else {
										response = {
											headers: result.headers,
											response: result.response,
										};
									}
								} else if (context?.returnStatus) {
									response = {
										response: result.response,
										status: result.status,
									};
								} else {
									response = result.response;
								}
								return response;
							} catch (error) {
								await rollBackFinalizedSignIn(internalContext);
								throw error;
							}
						}),
				);
			};
			if (await hasRequestState()) {
				return run();
			} else {
				const store = new WeakMap();
				return runWithRequestState(store, run);
			}
		};
		api[key].path = endpoint.path;
		api[key].options = endpoint.options;
	}
	return api as unknown as E;
}

async function runBeforeHooks(
	context: InternalContext,
	hooks: Hook[],
	endpoint: Endpoint,
	operationId: string,
) {
	let modifiedContext: Partial<InternalContext> = {};

	for (const hook of hooks) {
		let matched = false;
		try {
			matched = hook.matcher(context);
		} catch (error) {
			// manually handle unexpected errors during hook matcher execution to prevent accidental exposure of internal details
			// Also provides debug information about which plugin the hook failed and error info
			const hookSource = hooksSourceWeakMap.get(hook.handler) ?? "unknown";
			context.context.logger.error(
				`An error occurred during ${hookSource} hook matcher execution:`,
				error,
			);
			throw new APIError("INTERNAL_SERVER_ERROR", {
				message: `An error occurred during hook matcher execution. Check the logs for more details.`,
			});
		}
		if (matched) {
			const hookSource = hooksSourceWeakMap.get(hook.handler) ?? "unknown";
			const route = endpoint.path ?? "/:virtual";
			const result = await withSpan(
				`hook before ${route} ${hookSource}`,
				{
					[ATTR_HOOK_TYPE]: "before",
					[ATTR_HTTP_ROUTE]: route,
					[ATTR_CONTEXT]: hookSource,
					[ATTR_OPERATION_ID]: operationId,
				},
				() =>
					hook.handler({
						...context,
						returnHeaders: false,
					}),
			).catch((e: unknown) => {
				if (
					isAPIError(e) &&
					shouldPublishLog(context.context.logger.level, "debug")
				) {
					// inherit stack from errorStack if debug mode is enabled
					e.stack = e.errorStack;
				}
				throw e;
			});
			if (result && typeof result === "object") {
				if ("context" in result && typeof result.context === "object") {
					const { headers, ...rest } =
						result.context as Partial<InternalContext>;
					if (headers instanceof Headers) {
						if (modifiedContext.headers) {
							headers.forEach((value, key) => {
								modifiedContext.headers?.set(key, value);
							});
						} else {
							modifiedContext.headers = headers;
						}
					}
					modifiedContext = defuReplaceArrays(rest, modifiedContext);

					continue;
				}
				return result;
			}
		}
	}
	return { context: modifiedContext };
}

async function runAfterHooks(
	context: InternalContext,
	hooks: Hook[],
	endpoint: Endpoint,
	operationId: string,
) {
	for (const hook of hooks) {
		if (hook.matcher(context)) {
			const hookSource = hooksSourceWeakMap.get(hook.handler) ?? "unknown";
			const route = endpoint.path ?? "/:virtual";
			const result = (await withSpan(
				`hook after ${route} ${hookSource}`,
				{
					[ATTR_HOOK_TYPE]: "after",
					[ATTR_HTTP_ROUTE]: route,
					[ATTR_CONTEXT]: hookSource,
					[ATTR_OPERATION_ID]: operationId,
				},
				() => hook.handler(context),
			).catch((e) => {
				if (isAPIError(e)) {
					const headers = (e as any)[kAPIErrorHeaderSymbol] as
						| Headers
						| undefined;
					if (shouldPublishLog(context.context.logger.level, "debug")) {
						// inherit stack from errorStack if debug mode is enabled
						e.stack = e.errorStack;
					}
					return {
						response: e,
						headers: headers
							? headers
							: e.headers
								? new Headers(e.headers)
								: null,
					};
				}
				throw e;
			})) as {
				response: any;
				headers: Headers;
			};
			if (result.headers) {
				result.headers.forEach((value, key) => {
					if (!context.context.responseHeaders) {
						context.context.responseHeaders = new Headers({
							[key]: value,
						});
					} else {
						if (key.toLowerCase() === "set-cookie") {
							context.context.responseHeaders.append(key, value);
						} else {
							context.context.responseHeaders.set(key, value);
						}
					}
				});
			}
			if (result.response) {
				context.context.returned = result.response;
			}
		}
	}
	return {
		response: context.context.returned,
		headers: context.context.responseHeaders,
	};
}

function getHooks(authContext: AuthContext) {
	const plugins = authContext.options.plugins || [];
	const beforeHooks: Hook[] = [];
	const afterHooks: Hook[] = [];
	const beforeHookHandler = authContext.options.hooks?.before;
	if (beforeHookHandler) {
		hooksSourceWeakMap.set(beforeHookHandler, "user");
		beforeHooks.push({
			matcher: () => true,
			handler: beforeHookHandler,
		});
	}
	const afterHookHandler = authContext.options.hooks?.after;
	if (afterHookHandler) {
		hooksSourceWeakMap.set(afterHookHandler, "user");
		afterHooks.push({
			matcher: () => true,
			handler: afterHookHandler,
		});
	}
	const pluginBeforeHooks = plugins.flatMap((plugin) =>
		(plugin.hooks?.before ?? []).map((h) => {
			hooksSourceWeakMap.set(h.handler, `plugin:${plugin.id}`);
			return h;
		}),
	);
	const pluginAfterHooks = plugins.flatMap((plugin) =>
		(plugin.hooks?.after ?? []).map((h) => {
			hooksSourceWeakMap.set(h.handler, `plugin:${plugin.id}`);
			return h;
		}),
	);

	/**
	 * Add plugin added hooks at last
	 */
	if (pluginBeforeHooks.length) beforeHooks.push(...pluginBeforeHooks);
	if (pluginAfterHooks.length) afterHooks.push(...pluginAfterHooks);

	return {
		beforeHooks,
		afterHooks,
	};
}
