import type { BetterAuthOptions, InferDatabaseHooks } from "@better-auth/core";

/**
 * `const` type params infer readonly tuples; plugin endpoint inference uses
 * `extends Array` / mutable tuples — unwrap readonly without deep-mutating
 * plugin objects (which would break schema field inference).
 */
export type WritableTuple<T> = T extends readonly [...infer U] ? [...U] : T;

export type AuthModelsSlice<
	Plugins,
	UserConfig,
	SessionConfig,
	AccountConfig,
	VerificationConfig,
> = {
	plugins: WritableTuple<Plugins>;
	user: UserConfig;
	session: SessionConfig;
	account: AccountConfig;
	verification: VerificationConfig;
};

export type BetterAuthConfigInput<
	Plugins,
	UserConfig,
	SessionConfig,
	AccountConfig,
	VerificationConfig,
	Options extends BetterAuthOptions,
> = {
	plugins?: Plugins;
	user?: UserConfig;
	session?: SessionConfig;
	account?: AccountConfig;
	verification?: VerificationConfig;
	databaseHooks?: InferDatabaseHooks<
		AuthModelsSlice<
			Plugins,
			UserConfig,
			SessionConfig,
			AccountConfig,
			VerificationConfig
		>
	>;
} & Omit<Options, "databaseHooks">;

export type ResolvedAuthOptions<
	Plugins,
	UserConfig,
	SessionConfig,
	AccountConfig,
	VerificationConfig,
	Options extends BetterAuthOptions,
> = Omit<
	Options,
	"plugins" | "user" | "session" | "account" | "verification" | "databaseHooks"
> &
	(undefined extends Plugins
		? Pick<Options, "plugins">
		: { plugins: WritableTuple<Plugins> }) &
	(undefined extends UserConfig
		? Pick<Options, "user">
		: { user: UserConfig }) &
	(undefined extends SessionConfig
		? Pick<Options, "session">
		: { session: SessionConfig }) &
	(undefined extends AccountConfig
		? Pick<Options, "account">
		: { account: AccountConfig }) &
	(undefined extends VerificationConfig
		? Pick<Options, "verification">
		: { verification: VerificationConfig });
