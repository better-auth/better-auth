import { getEndpoints, router } from "./api";
import { init } from "./init";
import type { BetterAuthOptions } from "./types/options";
import type {
	InferPluginErrorCodes,
	InferPluginTypes,
	InferSession,
	InferUser,
	AuthContext,
	Adapter,
} from "./types";
import type { PrettifyDeep, Expand } from "./types/helper";
import { getBaseURL, getOrigin } from "./utils/url";
import type { FilterActions, InferAPI } from "./types";
import { BASE_ERROR_CODES } from "./error/codes";
import { BetterAuthError } from "./error";

export type WithJsDoc<T, D> = Expand<T & D>;

export const betterAuth = <O extends BetterAuthOptions>(
	options: O &
		// fixme(alex): do we need Record<never, never> here?
		Record<never, never>,
) => {
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
			const { runWithAdapter } = await import("./context/transaction.js").catch(
				() => {
					ctx.logger.warn(
						'Failed to load "AsyncLocalStorage" from "node:async_hooks". Transactional operations are not supported in this environment.',
					);
					return {
						runWithAdapter: <T>(
							adapter: Omit<Adapter, "transaction">,
							fn: () => T,
						): T => fn(),
					};
				},
			);
			const { handler } = router(ctx, options);
			return ctx.adapter.transaction((trx) => {
				return runWithAdapter(trx, () => handler(request));
			});
		},
		api: api as InferAPI<typeof api>,
		options: options as O,
		$context: authContext,
		$Infer: {} as {
			Session: {
				session: PrettifyDeep<InferSession<O>>;
				user: PrettifyDeep<InferUser<O>>;
			};
		} & InferPluginTypes<O>,
		$ERROR_CODES: {
			...errorCodes,
			...BASE_ERROR_CODES,
		} as InferPluginErrorCodes<O> & typeof BASE_ERROR_CODES,
	};
};

export type Auth = {
	handler: (request: Request) => Promise<Response>;
	api: FilterActions<ReturnType<typeof router>["endpoints"]>;
	options: BetterAuthOptions;
	$ERROR_CODES: typeof BASE_ERROR_CODES;
	$context: Promise<AuthContext>;
};
