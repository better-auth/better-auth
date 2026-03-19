import type { BetterAuthOptions } from "@better-auth/core";
import { init } from "../context/init";
import type { Auth } from "../types";
import { createBetterAuth } from "./base";
import type { StrictAdditionalFieldsOptions } from "./strict-additional-fields";

type NormalizeOptions<Options extends BetterAuthOptions> =
	keyof Options extends never ? BetterAuthOptions : Options;

/**
 * Better Auth initializer for full mode (with Kysely)
 *
 * @example
 * ```ts
 * import { betterAuth } from "better-auth";
 *
 * const auth = betterAuth({
 * 	database: new PostgresDialect({ connection: process.env.DATABASE_URL }),
 * });
 * ```
 *
 * For minimal mode (without Kysely), import from `better-auth/minimal` instead
 * @example
 * ```ts
 * import { betterAuth } from "better-auth/minimal";
 *
 * const auth = betterAuth({
 *	  database: drizzleAdapter(db, { provider: "pg" }),
 * });
 */
export function betterAuth<Options extends BetterAuthOptions>(
	options: Options & StrictAdditionalFieldsOptions<Options>,
): Auth<NormalizeOptions<Options>>;
export function betterAuth(options: BetterAuthOptions): Auth {
	return createBetterAuth(options, init);
}
