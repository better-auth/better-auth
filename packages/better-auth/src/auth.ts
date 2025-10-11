import type { AuthContext, BetterAuthOptions } from "@better-auth/core";
import { BASE_ERROR_CODES, BetterAuthError } from "@better-auth/core/error";
import { getEndpoints, router } from "./api";
import { runWithAdapter } from "./context/transaction";
import { init } from "./init";
import type {
	InferAPI,
	InferPluginErrorCodes,
	InferPluginTypes,
	InferSession,
	InferUser,
} from "./types";
import type { Expand, PrettifyDeep } from "./types/helper";
import { getBaseURL, getOrigin } from "./utils/url";

export type WithJsDoc<T, D> = Expand<T & D>;

export const betterAuth = <Options extends BetterAuthOptions>(
	options: Options &
		// fixme(alex): do we need Record<never, never> here?
		Record<never, never>,
): Auth<Options> => {
	const authContext = init(options);
	const { api } = getEndpoints(authContext, options);
	const errorCodes = options.plugins?.reduce((acc, plugin) => {
		if (plugin.$ERROR_CODES) {
			return {
				...acc,
				...plugin.$ERROR_CODES,
			};
		}
		return acc;
	}, {});
	return {
		handler: async (request: Request) => {
			const ctx = await authContext;
			const basePath = ctx.options.basePath || "/api/auth";
			if (!ctx.options.baseURL) {
				const baseURL = getBaseURL(undefined, basePath, request);
				if (baseURL) {
					ctx.baseURL = baseURL;
					ctx.options.baseURL = getOrigin(ctx.baseURL) || undefined;
				} else {
					throw new BetterAuthError(
						"Could not get base URL from request. Please provide a valid base URL.",
					);
				}
			}
			ctx.trustedOrigins = [
				...(options.trustedOrigins
					? Array.isArray(options.trustedOrigins)
						? options.trustedOrigins
						: await options.trustedOrigins(request)
					: []),
				ctx.options.baseURL!,
			];
			const { handler } = router(ctx, options);
			return runWithAdapter(ctx.adapter, () => handler(request));
		},
		api,
		options: options,
		$context: authContext,
		$ERROR_CODES: {
			...errorCodes,
			...BASE_ERROR_CODES,
		},
	} as any;
};

export type Auth<Options extends BetterAuthOptions = BetterAuthOptions> = {
	handler: (request: Request) => Promise<Response>;
	api: InferAPI<ReturnType<typeof router<Options>>["endpoints"]>;
	options: Options;
	$ERROR_CODES: InferPluginErrorCodes<Options> & typeof BASE_ERROR_CODES;
	$context: Promise<AuthContext>;
	/**
	 * Share types
	 */
	$Infer: InferPluginTypes<Options> extends {
		Session: any;
	}
		? InferPluginTypes<Options>
		: {
				Session: {
					session: PrettifyDeep<InferSession<Options>>;
					user: PrettifyDeep<InferUser<Options>>;
				};
			} & InferPluginTypes<Options>;
};
