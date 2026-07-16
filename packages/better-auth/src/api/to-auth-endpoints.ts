import type { AuthContext } from "@better-auth/core";
import type { RequestStateWeakMap } from "@better-auth/core/context";
import {
	hasRequestState,
	runWithRequestState,
} from "@better-auth/core/context";
import { APIError, BetterAuthError } from "@better-auth/core/error";
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
import { isDynamicBaseURLConfig, isRequestLike } from "../utils/url";
import { dispatchAuthEndpoint, getOperationId } from "./dispatch";

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

/**
 * Wraps each raw endpoint so a router or `auth.api.*` call runs it through the
 * configured hook pipeline. Per-call work that is specific to this entry point
 * (dynamic `baseURL` resolution, request-state initialization) happens here;
 * the hook pipeline itself lives in {@link dispatchAuthEndpoint}.
 */
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

			const run = async () => {
				const rawContext = await ctx;
				const authContext = isDynamicBaseURLConfig(rawContext.options.baseURL)
					? await resolveDynamicContext(rawContext, context)
					: rawContext;

				return dispatchAuthEndpoint(endpoint, {
					...context,
					context: authContext,
					operationId,
					asResponse: context?.asResponse ?? isRequestLike(context?.request),
				});
			};

			if (await hasRequestState()) {
				return run();
			}
			const store: RequestStateWeakMap = new WeakMap();
			return runWithRequestState(store, run);
		};
		api[key].path = endpoint.path;
		api[key].options = endpoint.options;
	}
	return api as unknown as E;
}
