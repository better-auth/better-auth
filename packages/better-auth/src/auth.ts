import { getEndpoints, router } from "./api";
import { init } from "./init";
import type { BetterAuthOptions } from "./types/options";
import type {
	InferPluginErrorCodes,
	InferPluginTypes,
	InferSession,
	InferUser,
	AuthContext,
	InferAPI,
} from "./types";
import type { PrettifyDeep, Expand } from "./types/helper";
import { getBaseURL, getOrigin } from "./utils/url";
import { BASE_ERROR_CODES } from "./error/codes";
import { BetterAuthError } from "./error";

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
		handler: async (request: Request, ctx?: AuthContext) => {
			const _ctx = ctx || (await authContext);
			const basePath = _ctx.options.basePath || "/api/auth";
			if (!_ctx.options.baseURL) {
				const baseURL = getBaseURL(undefined, basePath, request);
				if (baseURL) {
					_ctx.baseURL = baseURL;
					_ctx.options.baseURL = getOrigin(_ctx.baseURL) || undefined;
				} else {
					throw new BetterAuthError(
						"Could not get base URL from request. Please provide a valid base URL.",
					);
				}
			}
			_ctx.trustedOrigins = [
				...(options.trustedOrigins
					? Array.isArray(options.trustedOrigins)
						? options.trustedOrigins
						: await options.trustedOrigins(request)
					: []),
				_ctx.options.baseURL!,
			];
			const { handler } = router(_ctx, options);
			return handler(request);
		},
		api: api as never,
		options: options as Options,
		$context: authContext,
		$Infer: {} as {
			Session: {
				session: PrettifyDeep<InferSession<Options>>;
				user: PrettifyDeep<InferUser<Options>>;
			};
		} & InferPluginTypes<Options>,
		$ERROR_CODES: {
			...errorCodes,
			...BASE_ERROR_CODES,
		} as InferPluginErrorCodes<Options> & typeof BASE_ERROR_CODES,
	};
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
	$Infer: {
		Session: {
			session: PrettifyDeep<InferSession<Options>>;
			user: PrettifyDeep<InferUser<Options>>;
		};
	} & InferPluginTypes<Options>;
};
