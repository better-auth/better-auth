import type { BetterAuthOptions } from "@better-auth/core";
import { init } from "../context/init";
import type { Auth } from "../types";
import { createBetterAuth } from "./base";

/**
 * Initializes a Better Auth instance.
 *
 * @example
 * ```ts
 * import { betterAuth } from "better-auth";
 *
 * const auth = betterAuth({
 * 	database: new Pool({ connectionString: process.env.DATABASE_URL }),
 * });
 * ```
 */
export const betterAuth = <Options extends BetterAuthOptions>(
	options: Options & {},
): Auth<Options> => {
	return createBetterAuth(options, init);
};
