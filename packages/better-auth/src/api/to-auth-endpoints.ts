import type { AuthContext } from "@better-auth/core";
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
import { pickSource, resolveRequestContext } from "../context/helpers";
import { isDynamicBaseURLConfig, isRequestLike } from "../utils/url";
import { dispatchAuthEndpoint, getOperationId } from "./dispatch";

type UserInputContext = Partial<
	InputContext<string, any> & EndpointContext<string, any>
>;

/**
 * Resolves the `AuthContext` for a direct `auth.api` call. A dynamic config with
 * no `source` and no `fallback` throws a helpful `APIError` rather than letting
 * `new URL("")` crash downstream.
 */
async function resolveDirectCallContext(
	rawCtx: AuthContext,
	input: UserInputContext | undefined,
): Promise<AuthContext> {
	// baseURL resolved at init: use the shared context. Direct calls carry no
	// meaningful request, so re-resolving would needlessly re-fire trust callbacks.
	if (rawCtx.baseURL) return rawCtx;

	const source = pickSource(input);
	const config = rawCtx.options.baseURL;
	if (
		isDynamicBaseURLConfig(config) &&
		source === undefined &&
		!config.fallback
	) {
		throw new APIError("INTERNAL_SERVER_ERROR", {
			message:
				"Dynamic baseURL could not be resolved for this direct auth.api call. " +
				"Pass `headers: request.headers` (or `request`) to the call, " +
				"or add `fallback` to your baseURL config.",
		});
	}

	try {
		return await resolveRequestContext(rawCtx, source);
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
				// HTTP passes the resolved context as `context.context`; direct
				// calls resolve from their own source.
				let authContext = context?.context as AuthContext | undefined;
				if (!authContext) {
					const rawContext = await ctx;
					authContext = await resolveDirectCallContext(rawContext, context);
				}

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
			const store = new WeakMap();
			return runWithRequestState(store, run);
		};
		api[key].path = endpoint.path;
		api[key].options = endpoint.options;
	}
	return api as unknown as E;
}
