import {
	APIError,
	type EndpointContext,
	type InputContext,
	toResponse,
} from "better-call";
import type { AuthEndpoint, AuthMiddleware } from "@better-auth/core/api";
import { createDefu } from "defu";
import { shouldPublishLog } from "@better-auth/core/env";
import type { AuthContext, HookEndpointContext } from "@better-auth/core";
import { runWithEndpointContext } from "@better-auth/core/context";

type InternalContext = InputContext<string, any> &
	EndpointContext<string, any> & {
		asResponse?: boolean;
		responseHeaders: Headers;
		context: AuthContext & {
			logger: AuthContext["logger"];
			returned?: unknown;
			responseHeaders?: Headers;
		};
	};
const defuReplaceArrays = createDefu((obj, key, value) => {
	if (Array.isArray(obj[key]) && Array.isArray(value)) {
		obj[key] = value;
		return true;
	}
});

export function toAuthEndpoints<E extends Record<string, AuthEndpoint>>(
	endpoints: E,
	ctx: AuthContext | Promise<AuthContext>,
) {
	const api: Record<string, Omit<AuthEndpoint, "wrap">> = {};

	for (const [key, e] of Object.entries(endpoints)) {
		api[key] = e.wrap(async (context: any, originalFn: any) => {
			const authContext = await ctx;
			context.context = { ...authContext };

			return runWithEndpointContext(context, async () => {
				const { beforeHooks, afterHooks } = getHooks(authContext);
				const before = await runBeforeHooks(context, beforeHooks);
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
							(context.headers as Headers).set(key, value);
						});
					}
					context = defuReplaceArrays(rest, context);
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

				context.asResponse = false;
				context.returnHeaders = true;
				let hasError = false;
				const result = await runWithEndpointContext(context, () =>
					originalFn(context as any),
				).catch((e: unknown) => {
					if (e instanceof APIError) {
						if (shouldPublishLog(context.context.logger.level, "debug")) {
							// inherit stack from errorStack if debug mode is enabled
							e.stack = e.errorStack;
						}
					}
					hasError = true;
					return e;
				});

				//if response object is returned we skip after hooks and post processing
				if (result && result instanceof Response) {
					return result;
				}

				const after = await runAfterHooks(context, afterHooks);

				if (result?.response instanceof APIError && !context?.asResponse) {
					throw result.response;
				}
				if (after.response) {
					return after.response;
				}

				if (hasError) {
					throw result;
				}

				return result;
			});
		});
		// We don't allow the user to wrap the endpoint again
		api[key]!.wrap = undefined;
	}
	return api as E;
}

async function runBeforeHooks(
	context: InternalContext,
	hooks: {
		matcher: (context: HookEndpointContext) => boolean;
		handler: AuthMiddleware;
	}[],
) {
	let modifiedContext: {
		headers?: Headers;
	} = {};
	for (const hook of hooks) {
		if (hook.matcher(context)) {
			const result = await hook
				.handler({
					...context,
					returnHeaders: false,
				})
				.catch((e: unknown) => {
					if (
						e instanceof APIError &&
						shouldPublishLog(context.context.logger.level, "debug")
					) {
						// inherit stack from errorStack if debug mode is enabled
						e.stack = e.errorStack;
					}
					throw e;
				});
			if (result && typeof result === "object") {
				if ("context" in result && typeof result.context === "object") {
					const { headers, ...rest } = result.context as {
						headers: Headers;
					};
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
				if (e instanceof APIError) {
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
					if (key.toLowerCase() === "set-cookie") {
						context.responseHeaders.append(key, value);
					} else {
						context.responseHeaders.set(key, value);
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
	if (authContext.options.hooks?.before) {
		beforeHooks.push({
			matcher: () => true,
			handler: authContext.options.hooks.before,
		});
	}
	if (authContext.options.hooks?.after) {
		afterHooks.push({
			matcher: () => true,
			handler: authContext.options.hooks.after,
		});
	}
	const pluginBeforeHooks = plugins
		.map((plugin) => {
			if (plugin.hooks?.before) {
				return plugin.hooks.before;
			}
		})
		.filter((plugin) => plugin !== undefined)
		.flat();
	const pluginAfterHooks = plugins
		.map((plugin) => {
			if (plugin.hooks?.after) {
				return plugin.hooks.after;
			}
		})
		.filter((plugin) => plugin !== undefined)
		.flat();

	/**
	 * Add plugin added hooks at last
	 */
	pluginBeforeHooks.length && beforeHooks.push(...pluginBeforeHooks);
	pluginAfterHooks.length && afterHooks.push(...pluginAfterHooks);

	return {
		beforeHooks,
		afterHooks,
	};
}
