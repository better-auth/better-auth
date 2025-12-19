import type { AuthContext, BetterAuthOptions } from "@better-auth/core";
import { runWithAdapter } from "@better-auth/core/context";
import { env } from "@better-auth/core/env";
import { BASE_ERROR_CODES, BetterAuthError } from "@better-auth/core/error";
import { getEndpoints, router } from "../api";
import type { Auth } from "../types";
import { getBaseURL, getOrigin } from "../utils/url";

export const createBetterAuth = <Options extends BetterAuthOptions>(
	options: Options &
		// fixme(alex): do we need Record<never, never> here?
		Record<never, never>,
	initFn: (options: Options) => Promise<AuthContext>,
): Auth<Options> => {
	const authContext = initFn(options);
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
			const baseURLWasInferred = !ctx.options.baseURL;
			if (baseURLWasInferred) {
				const baseURL = getBaseURL(
					undefined,
					basePath,
					request,
					undefined,
					ctx.options.advanced?.trustedProxyHeaders,
				);
				if (baseURL) {
					ctx.baseURL = baseURL;
					ctx.options.baseURL = getOrigin(ctx.baseURL) || undefined;
				} else {
					throw new BetterAuthError(
						"Could not get base URL from request. Please provide a valid base URL.",
					);
				}
			}

			// Rebuild trustedOrigins if baseURL was inferred from request.
			// getTrustedOrigins() returns [] when baseURL is not set at init time,
			// so we need to rebuild it here with all configured origins.
			// See: https://github.com/better-auth/better-auth/issues/6798
			if (baseURLWasInferred && ctx.options.baseURL) {
				const baseOrigin = getOrigin(ctx.options.baseURL);
				if (baseOrigin) {
					ctx.trustedOrigins = [baseOrigin];
				}
				// Add array-based trustedOrigins from config
				if (options.trustedOrigins && Array.isArray(options.trustedOrigins)) {
					ctx.trustedOrigins.push(...options.trustedOrigins);
				}
				// Add env-based trustedOrigins
				const envTrustedOrigins = env.BETTER_AUTH_TRUSTED_ORIGINS;
				if (envTrustedOrigins) {
					ctx.trustedOrigins.push(...envTrustedOrigins.split(","));
				}
			}

			// Handle function-based trustedOrigins (dynamic at request time)
			if (typeof options.trustedOrigins === "function") {
				ctx.trustedOrigins = [
					...ctx.trustedOrigins,
					...(await options.trustedOrigins(request)),
				];
			}
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
