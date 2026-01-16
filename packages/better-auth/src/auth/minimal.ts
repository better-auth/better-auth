import type { BetterAuthOptions } from "@better-auth/core";
import { initMinimal } from "../context/init-minimal";
import type { Auth } from "../types";
import { createBetterAuth } from "./base";

export type { BetterAuthOptions };

/**
 * Better Auth initializer for minimal mode (without Kysely)
 */
export const betterAuth = <Options extends BetterAuthOptions>(
	options: Options,
): Auth<Options> => {
	return createBetterAuth(options, initMinimal);
};
