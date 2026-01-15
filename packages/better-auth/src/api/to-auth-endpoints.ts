import type { AuthContext, HookEndpointContext } from "@better-auth/core";
import type { AuthEndpoint, AuthMiddleware } from "@better-auth/core/api";
import {
	getEnumerationSafeResponse,
	hasRequestState,
	runWithEndpointContext,
	runWithRequestState,
} from "@better-auth/core/context";
import { shouldPublishLog } from "@better-auth/core/env";
import { APIError } from "@better-auth/core/error";
import type {
	EndpointContext,
	EndpointOptions,
	InputContext,
} from "better-call";
import { toResponse } from "better-call";
import { createDefu } from "defu";
import { isAPIError } from "../utils/is-api-error";

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

const hooksSourceWeakMap = new WeakMap<
	AuthMiddleware,
	`user` | `plugin:${string}`
>();

type UserInputContext = Partial<
	InputContext<string, any> & EndpointContext<string, any>
>;

export function toAuthEndpoints<
	const E extends Record<
		string,
		Omit<AuthEndpoint<string, EndpointOptions, any>, "wrap">
	>,
>(endpoints: E, ctx: AuthContext | Promise<AuthContext>): E {
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
			const run = async () => {
				const authContext = await ctx;
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
				return runWithEndpointContext(internalContext, async () => {
					const { beforeHooks, afterHooks } = getHooks(authContext);
					const before = await runBeforeHooks(internalContext, beforeHooks);
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
						return context?.asResponse
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
					const result = (await runWithEndpointContext(internalContext, () =>
						(endpoint as any)(internalContext as any),
					).catch((e: any) => {
						if (isAPIError(e)) {
							/**
							 * API Errors from response are caught
							 * and returned to hooks
							 */
							return {
								response: e,
								status: e.statusCode,
								headers: e.headers ? new Headers(e.headers) : null,
							};
						}
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
					internalContext.context.responseHeaders = result.headers;

					const after = await runAfterHooks(internalContext, afterHooks);

					if (after.response) {
						result.response = after.response;
					}

					if (
						isAPIError(result.response) &&
						shouldPublishLog(authContext.logger.level, "debug")
					) {
						// inherit stack from errorStack if debug mode is enabled
						result.response.stack = result.response.errorStack;
					}

					const safeResponse = await getEnumerationSafeResponse();
					if (isAPIError(result.response) && safeResponse !== null) {
						authContext.logger.debug(
							`Enumeration protection applied for ${endpoint.path}`,
						);
						result.response = safeResponse;
						result.status = 200;
					}

					if (isAPIError(result.response) && !context?.asResponse) {
						throw result.response;
					}

					const response = context?.asResponse
						? toResponse(result.response, {
								headers: result.headers,
								status: result.status,
							})
						: context?.returnHeaders
							? context?.returnStatus
								? {
										headers: result.headers,
										response: result.response,
										status: result.status,
									}
								: {
										headers: result.headers,
										response: result.response,
									}
							: context?.returnStatus
								? { response: result.response, status: result.status }
								: result.response;
					return response;
				});
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
	hooks: {
		matcher: (context: HookEndpointContext) => boolean;
		handler: AuthMiddleware;
	}[],
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
			const result = await hook
				.handler({
					...context,
					returnHeaders: false,
				})
				.catch((e: unknown) => {
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
	hooks: {
		matcher: (context: HookEndpointContext) => boolean;
		handler: AuthMiddleware;
	}[],
) {
	for (const hook of hooks) {
		if (hook.matcher(context)) {
			const result = (await hook.handler(context).catch((e) => {
				if (isAPIError(e)) {
					if (shouldPublishLog(context.context.logger.level, "debug")) {
						// inherit stack from errorStack if debug mode is enabled
						e.stack = e.errorStack;
					}
					return {
						response: e,
						headers: e.headers ? new Headers(e.headers) : null,
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
	const beforeHooks: {
		matcher: (context: HookEndpointContext) => boolean;
		handler: AuthMiddleware;
	}[] = [];
	const afterHooks: {
		matcher: (context: HookEndpointContext) => boolean;
		handler: AuthMiddleware;
	}[] = [];
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
	const pluginBeforeHooks = plugins
		.filter((plugin) => plugin.hooks?.before)
		.map((plugin) => plugin.hooks?.before!)
		.flat();
	const pluginAfterHooks = plugins
		.filter((plugin) => plugin.hooks?.after)
		.map((plugin) => plugin.hooks?.after!)
		.flat();

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
