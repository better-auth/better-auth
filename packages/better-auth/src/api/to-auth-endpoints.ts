import type { AuthContext } from "@better-auth/core";
import {
	hasRequestState,
	runWithRequestState,
} from "@better-auth/core/context";
import type {
	Endpoint,
	EndpointContext,
	EndpointOptions,
	InputContext,
} from "better-call";
import { pickSource, resolvePerRequestContext } from "../context/helpers";
import { isRequestLike } from "../utils/url";
import { dispatchAuthEndpoint, getOperationId } from "./dispatch";

type UserInputContext = Partial<
	InputContext<string, any> & EndpointContext<string, any>
>;

/**
 * Wraps each raw endpoint so a router or `auth.api.*` call runs it through the
 * configured hook pipeline. Per-call work that is specific to this entry point
 * (per-request context resolution, request-state initialization) happens here;
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
				const authContext = await resolvePerRequestContext(
					rawContext,
					pickSource(context),
				);

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
