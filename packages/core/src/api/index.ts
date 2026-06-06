import type {
	Endpoint,
	EndpointContext,
	EndpointOptions,
	InputContext,
	StrictEndpoint,
} from "better-call";
import {
	createEndpoint,
	createMiddleware,
	kAPIErrorHeaderSymbol,
	toResponse,
} from "better-call";
import { runWithEndpointContext } from "../context";
import { shouldPublishLog } from "../env";
import { APIError } from "../error";
import {
	ATTR_CONTEXT,
	ATTR_HOOK_TYPE,
	ATTR_HTTP_ROUTE,
	ATTR_OPERATION_ID,
	withSpan,
} from "../instrumentation";
import type { AuthContext, HookEndpointContext } from "../types";
import { isAPIError } from "../utils/is-api-error";

/**
 * Better-call's createEndpoint re-throws APIError without exposing the headers
 * accumulated on ctx.responseHeaders (e.g. Set-Cookie from deleteSessionCookie
 * before throw). Attach them to the error via kAPIErrorHeaderSymbol — matching
 * better-call's createMiddleware contract so the outer pipeline can merge them
 * into the response.
 */
function attachResponseHeadersToAPIError(
	responseHeaders: Headers | undefined,
	e: unknown,
): void {
	if (!isAPIError(e) || !responseHeaders) return;
	Object.defineProperty(e, kAPIErrorHeaderSymbol, {
		enumerable: false,
		configurable: true,
		value: responseHeaders,
		writable: false,
	});
}

export const optionsMiddleware = createMiddleware(async () => {
	/**
	 * This will be passed on the instance of
	 * the context. Used to infer the type
	 * here.
	 */
	return {} as AuthContext;
});

export const createAuthMiddleware = createMiddleware.create({
	use: [
		optionsMiddleware,
		/**
		 * Only use for post hooks
		 */
		createMiddleware(async () => {
			return {} as {
				returned?: unknown | undefined;
				responseHeaders?: Headers | undefined;
			};
		}),
	],
});

const use = [optionsMiddleware];

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
	operationId?: string | undefined;
};

type Hook = {
	matcher: (context: HookEndpointContext) => boolean;
	handler: AuthMiddleware;
};

const hooksSourceWeakMap = new WeakMap<
	AuthMiddleware,
	`user` | `plugin:${string}`
>();

function getOperationId(
	endpoint: Endpoint | undefined,
	context: Partial<InternalContext> | undefined,
): string {
	if (context?.operationId) return context.operationId;
	if (!endpoint?.options) return endpoint?.path ?? "/:virtual";
	const opts = endpoint.options as {
		operationId?: string;
		metadata?: { openapi?: { operationId?: string } };
	};
	return (
		opts.operationId ??
		opts.metadata?.openapi?.operationId ??
		endpoint.path ??
		"/:virtual"
	);
}

function isRequestLike(value: unknown): value is Request {
	if (value instanceof Request) return true;
	if (
		typeof value !== "object" ||
		value === null ||
		Object.prototype.toString.call(value) !== "[object Request]"
	) {
		return false;
	}
	const v = value as { url?: unknown; headers?: unknown };
	return (
		typeof v.url === "string" &&
		typeof v.headers === "object" &&
		v.headers !== null &&
		typeof (v.headers as { get?: unknown }).get === "function"
	);
}

function isAuthContext(value: unknown): value is AuthContext {
	return (
		!!value &&
		typeof value === "object" &&
		"options" in value &&
		"logger" in value
	);
}

function makeEndpointContext(
	context: Partial<InternalContext> | undefined,
	endpoint: Endpoint,
): InternalContext | null {
	const authContext = context?.context;
	if (!isAuthContext(authContext)) {
		return null;
	}
	return {
		...context,
		context: {
			...authContext,
			returned: undefined,
			responseHeaders: undefined,
			session: authContext.session ?? null,
		},
		path: endpoint.path ?? context?.path ?? "/:virtual",
		headers: context?.headers ? new Headers(context.headers) : undefined,
	};
}

function mergeResponseHeaders(
	target: AuthContext & { responseHeaders?: Headers | undefined },
	headers: Headers | null | undefined,
) {
	if (!headers) return;
	headers.forEach((value, key) => {
		if (!target.responseHeaders) {
			target.responseHeaders = new Headers({ [key]: value });
		} else if (key.toLowerCase() === "set-cookie") {
			target.responseHeaders.append(key, value);
		} else {
			target.responseHeaders.set(key, value);
		}
	});
}

function mergeEndpointHeadersBack(
	parent: AuthContext,
	current: AuthContext & { responseHeaders?: Headers | undefined },
) {
	if (parent === current) return;
	mergeResponseHeaders(parent, current.responseHeaders);
}

function mergeHookContext(ctx: InternalContext, hookContext: unknown) {
	if (!hookContext || typeof hookContext !== "object") return;
	const { headers, ...rest } = hookContext as Partial<InternalContext>;
	if (headers instanceof Headers) {
		if (!ctx.headers) {
			ctx.headers = new Headers();
		}
		headers.forEach((value, key) => {
			ctx.headers?.set(key, value);
		});
	}
	mergeContextValue(ctx, rest);
}

function mergeContextValue(
	ctx: InternalContext,
	hookContext: Partial<InternalContext>,
) {
	for (const [key, value] of Object.entries(hookContext)) {
		if (value === undefined) continue;
		const target = ctx as Record<string, unknown>;
		target[key] = mergeHookValue(target[key], value);
	}
}

function mergeHookValue(target: unknown, value: unknown): unknown {
	if (isMergeableRecord(target) && isMergeableRecord(value)) {
		const merged = { ...target };
		for (const [key, childValue] of Object.entries(value)) {
			merged[key] = mergeHookValue(merged[key], childValue);
		}
		return merged;
	}
	return value;
}

function isMergeableRecord(value: unknown): value is Record<string, unknown> {
	return (
		!!value &&
		typeof value === "object" &&
		!Array.isArray(value) &&
		!(value instanceof Headers) &&
		!(value instanceof Request) &&
		!(value instanceof Response) &&
		!(value instanceof URLSearchParams) &&
		!(value instanceof Date)
	);
}

function getAPIErrorHeaders(apiError: unknown) {
	if (!isAPIError(apiError)) return null;
	const headersFromSymbol = (
		apiError as typeof apiError & { [kAPIErrorHeaderSymbol]?: Headers }
	)[kAPIErrorHeaderSymbol];
	if (headersFromSymbol) {
		return headersFromSymbol;
	}
	if (apiError.headers) {
		return new Headers(apiError.headers);
	}
	return null;
}

function mergeAPIErrorHeaders(apiError: unknown) {
	if (!isAPIError(apiError)) return null;
	const ctxHeaders = (
		apiError as typeof apiError & { [kAPIErrorHeaderSymbol]?: Headers }
	)[kAPIErrorHeaderSymbol];
	const errHeaders =
		apiError.headers && apiError.headers !== ctxHeaders
			? new Headers(apiError.headers)
			: null;
	let headers: Headers | null = null;
	if (ctxHeaders || errHeaders) {
		headers = new Headers();
		ctxHeaders?.forEach((value, key) => {
			headers!.append(key, value);
		});
		errHeaders?.forEach((value, key) => {
			if (key.toLowerCase() === "set-cookie") {
				headers!.append(key, value);
			} else {
				headers!.set(key, value);
			}
		});
	}
	return headers;
}

function attachMergedHeadersToAPIError(
	error: unknown,
	headers?: Headers | null,
) {
	if (!isAPIError(error) || !headers) return;
	Object.defineProperty(error, kAPIErrorHeaderSymbol, {
		enumerable: false,
		configurable: true,
		writable: false,
		value: headers,
	});
}

async function runBeforeHooks(
	context: InternalContext,
	hooks: Hook[],
	endpoint: Endpoint,
	operationId: string,
) {
	for (const hook of hooks) {
		let matched = false;
		try {
			matched = hook.matcher(context);
		} catch (error) {
			const hookSource = hooksSourceWeakMap.get(hook.handler) ?? "unknown";
			context.context.logger.error(
				`An error occurred during ${hookSource} hook matcher execution:`,
				error,
			);
			throw new APIError("INTERNAL_SERVER_ERROR", {
				message:
					"An error occurred during hook matcher execution. Check the logs for more details.",
			});
		}
		if (!matched) continue;

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
				e.stack = e.errorStack;
			}
			throw e;
		});
		if (!result || typeof result !== "object") continue;
		if ("context" in result && typeof result.context === "object") {
			mergeHookContext(context, result.context);
			continue;
		}
		return result;
	}
}

async function runAfterHooks(
	context: InternalContext,
	hooks: Hook[],
	endpoint: Endpoint,
	operationId: string,
) {
	for (const hook of hooks) {
		if (!hook.matcher(context)) continue;

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
				if (shouldPublishLog(context.context.logger.level, "debug")) {
					e.stack = e.errorStack;
				}
				return {
					response: e,
					headers: getAPIErrorHeaders(e),
				};
			}
			throw e;
		})) as {
			response: unknown;
			headers?: Headers | null;
		};
		mergeResponseHeaders(context.context, result.headers);
		if (result.response !== undefined) {
			context.context.returned = result.response;
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

	if (pluginBeforeHooks.length) beforeHooks.push(...pluginBeforeHooks);
	if (pluginAfterHooks.length) afterHooks.push(...pluginAfterHooks);

	return {
		beforeHooks,
		afterHooks,
	};
}

function withHookPipeline<T extends Endpoint>(endpoint: T): T {
	const hooked = (async (context?: Partial<InternalContext>) => {
		const endpointContext = makeEndpointContext(context, endpoint);
		if (!endpointContext) {
			return endpoint(context as never);
		}

		const parentAuthContext = context?.context;
		const operationId = getOperationId(endpoint, endpointContext);
		const route = endpoint.path ?? "/:virtual";
		const hasRequest = isRequestLike(context?.request);
		const shouldReturnResponse = context?.asResponse ?? hasRequest;
		return runWithEndpointContext(endpointContext, async () => {
			const { beforeHooks, afterHooks } = getHooks(endpointContext.context);
			const before = await runBeforeHooks(
				endpointContext,
				beforeHooks,
				endpoint,
				operationId,
			);
			if (before) {
				mergeEndpointHeadersBack(parentAuthContext!, endpointContext.context);
				return shouldReturnResponse
					? toResponse(before, {
							headers: endpointContext.headers,
						})
					: context?.returnHeaders
						? {
								headers: endpointContext.headers,
								response: before,
							}
						: before;
			}

			endpointContext.asResponse = false;
			endpointContext.returnHeaders = true;
			endpointContext.returnStatus = true;
			const result = (await runWithEndpointContext(endpointContext, () =>
				withSpan(
					`handler ${route}`,
					{
						[ATTR_HTTP_ROUTE]: route,
						[ATTR_OPERATION_ID]: operationId,
					},
					() => endpoint(endpointContext as never),
				),
			).catch((e: unknown) => {
				if (isAPIError(e)) {
					const headers = mergeAPIErrorHeaders(e);
					return {
						response: e,
						status: e.statusCode,
						headers,
					};
				}
				throw e;
			})) as
				| Response
				| {
						headers: Headers | null;
						response: unknown;
						status?: number;
				  };

			if (result instanceof Response) {
				mergeEndpointHeadersBack(parentAuthContext!, endpointContext.context);
				return result;
			}

			endpointContext.context.returned = result.response;
			endpointContext.context.responseHeaders = result.headers ?? undefined;

			const after = await runAfterHooks(
				endpointContext,
				afterHooks,
				endpoint,
				operationId,
			);

			if (after.response !== undefined) {
				result.response = after.response;
			}
			if (after.headers) {
				result.headers = after.headers;
			}

			if (
				isAPIError(result.response) &&
				shouldPublishLog(endpointContext.context.logger.level, "debug")
			) {
				result.response.stack = result.response.errorStack;
			}

			mergeEndpointHeadersBack(parentAuthContext!, endpointContext.context);

			if (isAPIError(result.response) && !shouldReturnResponse) {
				attachMergedHeadersToAPIError(result.response, result.headers);
				throw result.response;
			}

			return shouldReturnResponse
				? toResponse(result.response, {
						headers: result.headers ?? undefined,
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
		});
	}) as T;
	hooked.path = endpoint.path;
	hooked.options = endpoint.options;
	return hooked;
}

type EndpointHandler<
	Path extends string,
	Options extends EndpointOptions,
	R,
> = (context: EndpointContext<Path, Options, AuthContext>) => Promise<R>;

export function createAuthEndpoint<
	Path extends string,
	Options extends EndpointOptions,
	R,
>(
	path: Path,
	options: Options,
	handler: EndpointHandler<Path, Options, R>,
): StrictEndpoint<Path, Options, R>;

export function createAuthEndpoint<
	Path extends string,
	Options extends EndpointOptions,
	R,
>(
	options: Options,
	handler: EndpointHandler<Path, Options, R>,
): StrictEndpoint<Path, Options, R>;

export function createAuthEndpoint<
	Path extends string,
	Opts extends EndpointOptions,
	R,
>(
	pathOrOptions: Path | Opts,
	handlerOrOptions: EndpointHandler<Path, Opts, R> | Opts,
	handlerOrNever?: any,
) {
	const path: Path | undefined =
		typeof pathOrOptions === "string" ? pathOrOptions : undefined;
	const options: Opts =
		typeof handlerOrOptions === "object"
			? handlerOrOptions
			: (pathOrOptions as Opts);
	const handler: EndpointHandler<Path, Opts, R> =
		typeof handlerOrOptions === "function" ? handlerOrOptions : handlerOrNever;

	// todo: prettify the code, we want to call `runWithEndpointContext` to top level
	const wrapped: EndpointHandler<Path, Opts, R> = async (ctx) => {
		const runtimeCtx = ctx as unknown as { responseHeaders?: Headers };
		try {
			return await runWithEndpointContext(ctx as any, () => handler(ctx));
		} catch (e) {
			attachResponseHeadersToAPIError(runtimeCtx.responseHeaders, e);
			throw e;
		}
	};

	if (path) {
		return withHookPipeline(
			createEndpoint(
				path,
				{
					...options,
					use: [...(options?.use || []), ...use],
				},
				wrapped,
			),
		);
	}

	return withHookPipeline(
		createEndpoint(
			{
				...options,
				use: [...(options?.use || []), ...use],
			},
			wrapped,
		),
	);
}

export type AuthEndpoint<
	Path extends string,
	Opts extends EndpointOptions,
	R,
> = ReturnType<typeof createAuthEndpoint<Path, Opts, R>>;
export type AuthMiddleware = ReturnType<typeof createAuthMiddleware>;
