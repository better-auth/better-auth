import {
	APIError,
	toResponse,
	type EndpointOptions,
	type InputContext,
	type Middleware,
} from "better-call";
import type { AuthEndpoint } from "./call";
import type {
	AuthContext,
	HookAfterHandler,
	HookBeforeHandler,
	HookEndpointContext,
} from "../types";
import defu from "defu";

interface InternalContext {
	context: AuthContext & {
		returned?: unknown;
		responseHeaders?: Headers;
	};
	body?: any;
	method?: any;
	query?: unknown;
	request?: Request | undefined;
	headers?: Headers | undefined;
	asResponse?: boolean | undefined;
	returnHeaders?: boolean | undefined;
	use?: Middleware[] | undefined;
	path: string;
}

export function toAuthEndpoints<E extends Record<string, AuthEndpoint>>(
	endpoints: E,
	ctx: AuthContext | Promise<AuthContext>,
) {
	const api: Record<
		string,
		((context?: InputContext<any, any>) => Promise<any>) & {
			path?: string;
			options?: EndpointOptions;
		}
	> = {};

	for (const [key, endpoint] of Object.entries(endpoints)) {
		api[key] = async (context) => {
			const authContext = await ctx;
			//reset session
			authContext.session = null;
			let internalContext: InternalContext = {
				...context,
				context: authContext,
				path: endpoint.path,
				headers: new Headers(context?.headers),
			};
			const { beforeHooks, afterHooks } = getHooks(authContext);
			//override to make headers object
			internalContext.headers = new Headers(internalContext.headers);
			const before = await runBeforeHooks(internalContext, beforeHooks);
			/**
			 * If `before.context` is returned, it should
			 * get merged with the original context
			 */
			if ("context" in before && before.context) {
				const { headers, ...rest }: { headers: Headers } = before.context;
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
				internalContext = defu(rest, internalContext);
			} else if (before) {
				/* Return before hook response if it's anything other than a context return */
				return before;
			}

			internalContext.asResponse = false;
			internalContext.returnHeaders = true;
			const result = (await endpoint(internalContext as any).catch((e) => {
				if (e instanceof APIError) {
					/**
					 * API Errors from response are caught
					 * and returned to hooks
					 */
					return {
						response: e,
						headers: e.headers ? new Headers(e.headers) : null,
					};
				}
				throw e;
			})) as {
				headers: Headers;
				response: any;
			};
			internalContext.context.returned = result.response;
			internalContext.context.responseHeaders = result.headers;
			const after = await runAfterHooks(internalContext, afterHooks);

			/**
			 * Append after hook returned headers
			 * to the response headers
			 */
			if (
				result &&
				typeof result === "object" &&
				"headers" in result &&
				result.headers instanceof Headers
			) {
				after.headers?.forEach((value, key) => {
					(result.headers as Headers).append(key, value);
				});
			}

			if (after.response) {
				result.response = after.response;
			}

			if (result.response instanceof APIError && !context?.asResponse) {
				throw result.response;
			}

			const response = context?.asResponse
				? toResponse(result.response, {
						headers: result.headers,
					})
				: context?.returnHeaders
					? {
							headers: result.headers,
							response: result.response,
						}
					: result.response;
			return response;
		};
		api[key].path = endpoint.path;
		api[key].options = endpoint.options;
	}
	return api as E;
}

async function runBeforeHooks(
	context: HookEndpointContext,
	hooks: {
		matcher: (context: HookEndpointContext) => boolean;
		handler: HookBeforeHandler;
	}[],
) {
	let modifiedContext: {
		headers?: Headers;
	} = {};
	for (const hook of hooks) {
		if (hook.matcher(context)) {
			const result = await hook.handler({
				...context,
				returnHeaders: false,
			});
			if (result) {
				if ("context" in result) {
					const { headers, ...rest } = result.context;
					if (headers instanceof Headers) {
						if (modifiedContext.headers) {
							headers.forEach((value, key) => {
								modifiedContext.headers?.set(key, value);
							});
						} else {
							modifiedContext.headers = headers;
						}
					}
					modifiedContext = defu(rest, modifiedContext);
					continue;
				}
				return result;
			}
		}
	}
	return { context: modifiedContext };
}

async function runAfterHooks(
	context: HookEndpointContext,
	hooks: {
		matcher: (context: HookEndpointContext) => boolean;
		handler: HookAfterHandler;
	}[],
) {
	const response = {
		headers: null,
		response: null,
	} as {
		headers: Headers | null;
		response: unknown;
	};
	for (const hook of hooks) {
		context.context.returned = response.response || context.context.returned;
		context.context.responseHeaders =
			response.headers || context.context.responseHeaders;
		context.returnHeaders = true;
		if (hook.matcher(context)) {
			const result = (await hook.handler(context).catch((e) => {
				if (e instanceof APIError) {
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
					if (!response.headers) {
						response.headers = new Headers({
							[key]: value,
						});
					} else {
						response.headers?.append(key, value);
					}
				});
			}
			if (result.response) {
				response.response = result.response;
			}
		}
	}
	return response;
}

function getHooks(authContext: AuthContext) {
	const plugins = authContext.options.plugins || [];
	const beforeHooks: {
		matcher: (context: HookEndpointContext) => boolean;
		handler: HookBeforeHandler;
	}[] = [];
	const afterHooks: {
		matcher: (context: HookEndpointContext) => boolean;
		handler: HookAfterHandler;
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
