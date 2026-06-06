import type { AuthContext } from "@better-auth/core";
import {
	hasRequestState,
	runWithRequestState,
} from "@better-auth/core/context";
import { APIError, BetterAuthError } from "@better-auth/core/error";
import {
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
import {
	pickSource,
	resolveDynamicTrustedProxyHeaders,
	resolveRequestContext,
} from "../context/helpers";
import { isDynamicBaseURLConfig } from "../utils/url";

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

				const internalContext: InternalContext = {
					...context,
					context: {
						...authContext,
						returned: undefined,
						responseHeaders: undefined,
						session: null,
					},
					path: endpoint.path,
					headers: context?.headers ? new Headers(context?.headers) : undefined,
					operationId,
				};
				return withSpan(
					`${methodName} ${route}`,
					{
						[ATTR_HTTP_ROUTE]: route,
						[ATTR_OPERATION_ID]: operationId,
					},
					() => (endpoint as any)(internalContext as any),
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
