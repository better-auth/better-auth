import type { BetterAuthOptions, BetterAuthPlugin } from "@better-auth/core";
import { initMinimal } from "../context/init-minimal";
import type { Auth } from "../types";
import { createBetterAuth } from "./base";
import type {
	BetterAuthConfigInput,
	ResolvedAuthOptions,
} from "./config-types";

export type { BetterAuthOptions };
export type {
	AuthModelsSlice,
	BetterAuthConfigInput,
	ResolvedAuthOptions,
	WritableTuple,
} from "./config-types";

/**
 * Better Auth initializer for minimal mode (without Kysely)
 *
 * Const type-params for `plugins` / model options let `databaseHooks` callbacks
 * see sibling plugin and additionalFields types without a helper wrapper.
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
	return createBetterAuth(options as never, initMinimal) as never;
};
