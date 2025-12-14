import type { BetterAuthOptions } from "@better-auth/core";
import { init } from "../context/init";
import type { Auth } from "../types";
import { createBetterAuth } from "./base";

/**
 * Better Auth initializer for full mode (with Kysely)
 *
 * Check `minimal.ts` for minimal mode (without Kysely)
 */
export const betterAuth = <Options extends BetterAuthOptions>(
	options: Options &
		// fixme(alex): do we need Record<never, never> here?
		Record<never, never>,
): Auth<Options> => {
	return createBetterAuth(options, init);
};
