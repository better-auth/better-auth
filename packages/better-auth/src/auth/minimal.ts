import type { BetterAuthOptions } from "@better-auth/core";
import { initMinimal } from "../context/init-minimal";
import type { Auth } from "../types";
import { createBetterAuth } from "./base";
import type { StrictAdditionalFieldsOptions } from "./strict-additional-fields";

export type { BetterAuthOptions };

type NormalizeOptions<Options extends BetterAuthOptions> =
	keyof Options extends never ? BetterAuthOptions : Options;

/**
 * Better Auth initializer for minimal mode (without Kysely)
 */
export function betterAuth<Options extends BetterAuthOptions>(
	options: Options & StrictAdditionalFieldsOptions<Options>,
): Auth<NormalizeOptions<Options>>;
export function betterAuth(options: BetterAuthOptions): Auth {
	return createBetterAuth(options, initMinimal);
}
