import type { BetterAuthOptions, BetterAuthPlugin } from "@better-auth/core";
import { init } from "../context/init";
import type { Auth } from "../types";
import { createBetterAuth } from "./base";
import type {
	BetterAuthConfigInput,
	ResolvedAuthOptions,
} from "./config-types";

/**
 * Better Auth initializer for full mode (with Kysely)
 *
 * Const type-params for `plugins` / model options let `databaseHooks` callbacks
 * see sibling plugin and additionalFields types without a helper wrapper.
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
export const betterAuth = <
	const Plugins extends readonly BetterAuthPlugin[] | undefined = undefined,
	const UserConfig extends BetterAuthOptions["user"] = undefined,
	const SessionConfig extends BetterAuthOptions["session"] = undefined,
	const AccountConfig extends BetterAuthOptions["account"] = undefined,
	const VerificationConfig extends
		BetterAuthOptions["verification"] = undefined,
	const Options extends BetterAuthOptions = BetterAuthOptions,
>(
	options: BetterAuthConfigInput<
		Plugins,
		UserConfig,
		SessionConfig,
		AccountConfig,
		VerificationConfig,
		Options
	> & {},
): Auth<
	ResolvedAuthOptions<
		Plugins,
		UserConfig,
		SessionConfig,
		AccountConfig,
		VerificationConfig,
		Options
	>
> => {
	return createBetterAuth(options as never, init) as never;
};
