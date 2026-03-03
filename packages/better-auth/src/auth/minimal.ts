import type { BetterAuthOptions } from "@better-auth/core";
import { initMinimal } from "../context/init-minimal";
import type { Auth } from "../types";
import { createBetterAuth } from "./base";
import type { StrictAdditionalFieldsOptions } from "./strict-additional-fields";

export type { BetterAuthOptions };

/**
 * Better Auth initializer for minimal mode (without Kysely)
 */
export function betterAuth(options: Record<string, never>): Auth;
export function betterAuth<Options extends BetterAuthOptions>(
	options: Options & StrictAdditionalFieldsOptions<Options>,
): Auth<Options>;
export function betterAuth(options: BetterAuthOptions): Auth {
	return createBetterAuth(options, initMinimal);
}
