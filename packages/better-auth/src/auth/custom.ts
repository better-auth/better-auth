import type { AuthContext, BetterAuthOptions } from "@better-auth/core";
import { BetterAuthError } from "@better-auth/core/error";
import { init } from "../context/init";
import type { Auth } from "../types";
import { createBetterAuth } from "./base";

/**
 * Better Auth initializer that allows for a modified context (Advanced)
 *
 * Lets you intercept + modify the AuthContext right after init() runs.
 * Only use this if you genuinely need to patch or extend the context.
 *
 * Check `auth.ts` for standard initialization
 */

export const betterAuth = <Options extends BetterAuthOptions>(
	options: Options &
		// fixme(alex): do we need Record<never, never> here?
		Record<never, never>,
	contextInterceptor?: (ctx: AuthContext) => AuthContext,
): Auth<Options> => {
	const isValidInterceptor = typeof contextInterceptor === "function";
	const interceptor = isValidInterceptor
		? contextInterceptor
		: (ctx: AuthContext) => ctx;

	if (!isValidInterceptor && contextInterceptor !== undefined) {
		throw new BetterAuthError(
			"Provided contextInterceptor is not a valid function",
		);
	}

	const initFn = (options: Options) => init(options).then(interceptor);
	return createBetterAuth(options, initFn);
};
