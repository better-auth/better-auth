import type { BetterAuthOptions } from "@better-auth/core";
import { initMinimal } from "../context/init-minimal.js";
import type { Auth } from "../types/index.js";
import { createBetterAuth } from "./base.js";

export type { BetterAuthOptions };

/**
 * Better Auth initializer for minimal mode (without Kysely)
 */
export const betterAuth = <Options extends BetterAuthOptions>(
	options: Options & {},
): Auth<Options> => {
	return createBetterAuth(options, initMinimal);
};
